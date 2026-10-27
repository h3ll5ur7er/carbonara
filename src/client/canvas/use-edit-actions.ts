// The canvas's editing actions for the app's commands (edit-actions.ts), for the document on screen: they read
// the selection and the scene the moment they run and send their edits through the connector.
import { useEffect, useMemo, type RefObject } from "react";
import type { CommandInput } from "../../contracts/commands";
import type { Document, LocalId, Node } from "../../contracts/document";
import type { PackData } from "../../contracts/pack";
import { useConnector } from "../core/connector";
import { errorMessage, toast } from "../shell/toasts";
import { blueprintName } from "../features/subgraphs/path";
import { setCanvasEditActions, type CanvasEditActions } from "./edit-actions";
import type { NavigationActions } from "./use-navigation";
import type { Point } from "./adapter";
import { clipboardActions } from "./clipboard-actions";
import { align, distribute, straightenChain, type AlignMode, type Box } from "./model/align";
import { freeSpot, obstaclesOf } from "./model/free-spot";
import { rateChoices, settingsFor } from "./model/format";
import { GRID } from "./model/geometry";
import { createSceneBuilder, type CanvasScene, type EffectiveItems } from "./model/scene";
import { shapesOf } from "./model/shapes";
import { canvasActions, viewportCentre } from "./viewport";
import { download, imageFileName } from "../features/export/export";

export interface Selection {
  nodes: LocalId[];
  edges: LocalId[];
}

export interface EditActionsInput {
  document: Document;
  pack: PackData;
  graph: string;
  scene: CanvasScene;
  /** The effective items the scene was drawn with, to arrange nodes at the size they're drawn. */
  effective: EffectiveItems | undefined;
  selection: RefObject<Selection>;
  apply(commands: CommandInput[], label: string): Promise<void>;
  /** Back, forward and bookmarks (use-navigation.ts). */
  navigation: NavigationActions;
  /** Opens a subgraph instance; nothing opens without it. */
  openSubgraph?: ((instance: LocalId) => void) | undefined;
  /** Selects these nodes as soon as the canvas draws them (a collapse's new instance). */
  selectWhenShown(ids: LocalId[]): void;
}

/** Builds the actions, registers them while the canvas is on screen, and returns them for the canvas's own keys. */
export function useEditActions({
  document,
  pack,
  graph,
  scene,
  effective,
  selection,
  apply,
  navigation,
  openSubgraph,
  selectWhenShown,
}: EditActionsInput): CanvasEditActions {
  const connector = useConnector();
  const documentId = document.id;
  const shown = graph === "root" ? document.graph : document.blueprints[graph]?.graph;
  const layout = document.layout[graph];

  const actions = useMemo((): CanvasEditActions => {
    const selectedBoxes = (): Box[] => {
      const chosen = new Set(selection.current.nodes);
      return scene.nodes
        .filter((view) => chosen.has(view.id))
        .map((view) => ({
          id: view.id,
          ...view.position,
          width: view.width,
          height: view.height,
          locked: !!view.locked,
        }));
    };
    /** One move edit, keeping each position's other fields; nothing when nothing moves. */
    const move = (moves: Record<LocalId, Point>, label: string) => {
      const positions = Object.fromEntries(Object.entries(moves).map(([id, at]) => [id, { ...layout?.[id], ...at }]));
      if (Object.keys(positions).length > 0) void apply([{ type: "moveNodes", graph, positions }], label);
    };
    /** Mid-view, clear of the other nodes. */
    const placeNew = (node: Node) => {
      const [view] = createSceneBuilder()({ nodes: { new: node }, edges: {} }, undefined, pack).nodes;
      const width = view?.width ?? 0;
      const height = view?.height ?? 0;
      const centre = viewportCentre() ?? { x: 0, y: 0 };
      const snap = (value: number) => Math.round(value / GRID) * GRID;
      const wanted = { x: snap(centre.x - width / 2), y: snap(centre.y - height / 2), width, height };
      return freeSpot(wanted, obstaclesOf(scene.nodes), GRID);
    };
    return {
      arrange(direction) {
        const selected = selection.current.nodes;
        const nodeIds = selected.length >= 2 ? selected : undefined;
        // The layout engine gets the nodes as they'll be drawn: arranged down, their flows enter at the top and
        // leave at the bottom (the editing manager turns them).
        const arranged = new Set(nodeIds ?? Object.keys(shown?.nodes ?? {}));
        const turned = Object.fromEntries(
          Object.keys(shown?.nodes ?? {}).map((id) => {
            const { flow, ...at } = layout?.[id] ?? { x: 0, y: 0 };
            const turn = arranged.has(id) && !at.locked ? direction : flow;
            return [id, { ...at, ...(turn === "down" && { flow: "down" as const }) }];
          }),
        );
        const views = shown ? createSceneBuilder()(shown, turned, pack, document, effective).nodes : scene.nodes;
        report(
          "Arrange",
          connector.editing.arrange({
            documentId,
            graph,
            direction,
            shapes: shapesOf(views),
            ...(nodeIds && { nodeIds }),
          }),
        );
      },
      deleteSelection(bridge) {
        const nodes = selection.current.nodes.filter((id) => shown?.nodes[id]);
        const removed = new Set(nodes);
        // Flows of deleted nodes go with them; the other selected flows are deleted on their own.
        const edges = selection.current.edges.filter((id) => {
          const edge = shown?.edges[id];
          return edge && !removed.has(edge.from) && !removed.has(edge.to);
        });
        const commands: CommandInput[] = [
          ...(nodes.length > 0
            ? [{ type: bridge ? "removeAndBridge" : "removeNodes", graph, ids: nodes } as const]
            : []),
          ...(edges.length > 0 ? [{ type: "disconnect", graph, ids: edges } as const] : []),
        ];
        if (commands.length === 0) return;
        void apply(commands, bridge ? "Delete and bridge" : "Delete");
      },
      align(mode) {
        move(align(selectedBoxes(), mode), `Align ${ALIGN_LABELS[mode]}`);
      },
      distribute(axis) {
        move(distribute(selectedBoxes(), axis), `Distribute ${axis}ly`);
      },
      straighten() {
        move(straightenChain(scene, selection.current.nodes), "Straighten chain");
      },
      addNote() {
        const node: Node = { kind: "note", text: "Note" };
        void apply([{ type: "addNode", graph, node, position: placeNew(node) }], "Add note");
      },
      frameSelection() {
        const boxes = selectedBoxes();
        if (boxes.length === 0) return;
        // A grid step around the nodes, two above for the label.
        const left = Math.min(...boxes.map((box) => box.x)) - GRID;
        const top = Math.min(...boxes.map((box) => box.y)) - GRID * 2;
        const right = Math.max(...boxes.map((box) => box.x + box.width)) + GRID;
        const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + GRID;
        const position = { x: left, y: top, width: right - left, height: bottom - top };
        void apply([{ type: "addNode", graph, node: { kind: "frame", label: "Frame" }, position }], "Frame selection");
      },
      tag(tag) {
        const ids = selection.current.nodes;
        if (ids.length > 0) void apply([{ type: "setTag", graph, ids, tag }], tag ? `Tag ${tag}` : "Remove tag");
      },
      toggleLock() {
        const ids = selection.current.nodes;
        if (ids.length === 0) return;
        const locked = !ids.every((id) => layout?.[id]?.locked);
        void apply([{ type: "setLocked", graph, ids, locked }], locked ? "Lock" : "Unlock");
      },
      toggleCollapse() {
        const frames = selection.current.nodes.flatMap((id) => {
          const node = shown?.nodes[id];
          return node?.kind === "frame" ? [{ id, collapsed: !!node.collapsed }] : [];
        });
        if (frames.length === 0) return;
        const collapsed = !frames.every((frame) => frame.collapsed);
        const ids = frames.map((frame) => frame.id);
        void apply([{ type: "setCollapsed", graph, ids, collapsed }], collapsed ? "Collapse frame" : "Expand frame");
      },
      showRatesIn(choice) {
        // The fastest solid carrier: what "belts" means in factory games.
        const fastest = [...pack.logistics]
          .filter((logistics) => logistics.carries === "solid")
          .sort((a, b) => b.capacity - a.capacity)[0];
        const resolved = choice === "belts" ? (fastest ? `belt:${fastest.id}` : undefined) : choice;
        if (resolved === undefined) return;
        const label = rateChoices(pack).find((option) => option.value === resolved)?.label ?? resolved;
        void apply([{ type: "setSettings", settings: settingsFor(resolved) }], `Show rates in ${label}`);
      },
      toggleMachineGroups() {
        const even = document.settings.machineGroups !== "even";
        void apply(
          [{ type: "setSettings", settings: { machineGroups: even ? "even" : null } }],
          even ? "Round machines to buildable" : "Fill machines to 100%",
        );
      },
      exportImage(format) {
        const image = canvasActions()?.image(format);
        image?.then(
          (url) => download(url, imageFileName(document.name, format)),
          (error: unknown) => failed("Export the picture", errorMessage(error)),
        );
      },
      collapseSelection() {
        const ids = selection.current.nodes.filter((id) => shown?.nodes[id] && shown.nodes[id].kind !== "port");
        if (ids.length === 0) {
          toast({ title: "Nothing to collapse", description: "Select the nodes to put into a subgraph first." });
          return;
        }
        const boxes = selectedBoxes().filter((box) => ids.includes(box.id));
        const left = Math.min(...boxes.map((box) => box.x));
        const top = Math.min(...boxes.map((box) => box.y));
        const bounds = {
          x: left,
          y: top,
          width: Math.max(...boxes.map((box) => box.x + box.width)) - left,
          height: Math.max(...boxes.map((box) => box.y + box.height)) - top,
        };
        const suffix = crypto.randomUUID().slice(0, 8);
        const instance = `subgraph-${suffix}`;
        const name = blueprintName(document, pack, graph, ids);
        selectWhenShown([instance]);
        void apply(
          [
            {
              type: "collapse",
              graph,
              ids,
              name,
              blueprint: `blueprint-${suffix}`,
              instance,
              ...(boxes.length > 0 && { bounds }),
            },
          ],
          `Collapse into ${name}`,
        );
      },
      expandSelection() {
        const ids = selection.current.nodes.filter((id) => shown?.nodes[id]?.kind === "instance");
        if (ids.length === 0) {
          toast({ title: "Nothing to expand", description: "Select a subgraph first." });
          return;
        }
        void apply(
          ids.map((id) => ({ type: "expand", graph, id }) as const),
          ids.length === 1 ? "Expand subgraph" : `Expand ${ids.length} subgraphs`,
        );
      },
      openSubgraph() {
        const [instance] = selection.current.nodes.filter((id) => shown?.nodes[id]?.kind === "instance");
        if (!instance) {
          toast({ title: "No subgraph selected", description: "Select a subgraph to open it." });
          return;
        }
        openSubgraph?.(instance);
      },
      undo: () => report("Undo", connector.editing.undo({ documentId })),
      redo: () => report("Redo", connector.editing.redo({ documentId })),
      placeNew,
      ...clipboardActions({ connector, document, pack, graph, shown, scene, selection, apply }),
      ...navigation,
    };
  }, [
    connector,
    document,
    documentId,
    graph,
    shown,
    layout,
    pack,
    scene,
    effective,
    selection,
    apply,
    navigation,
    openSubgraph,
    selectWhenShown,
  ]);

  useEffect(() => {
    setCanvasEditActions(actions);
    return () => setCanvasEditActions(undefined);
  }, [actions]);
  return actions;
}

const ALIGN_LABELS: Record<AlignMode, string> = {
  left: "left",
  centre: "centres",
  right: "right",
  top: "top",
  middle: "middles",
  bottom: "bottom",
};

/** Reports a call that failed, as a value or on the way. */
function report(label: string, call: Promise<unknown>) {
  call.then(
    (result) => {
      if (isFailure(result)) failed(label, result.error.map((issue) => issue.message).join(" "));
    },
    (error: unknown) => failed(label, errorMessage(error)),
  );
}

function isFailure(result: unknown): result is { ok: false; error: { message: string }[] } {
  return typeof result === "object" && result !== null && "ok" in result && result.ok === false;
}

function failed(label: string, description: string) {
  toast({ tone: "error", title: `Couldn't ${label.toLowerCase()}`, ...(description && { description }) });
}
