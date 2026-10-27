// The factory canvas. Hides how a document is drawn (React Flow today, behind the CanvasAdapter seam) and
// turns what the user does on it into `editing` commands sent through the connector.
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CommandInput } from "../../contracts/commands";
import type { Document, LocalId } from "../../contracts/document";
import type { PackData } from "../../contracts/pack";
import type { AnalysisResults } from "../../contracts/results";
import { useConnector } from "../core/connector";
import { usePanels } from "../shell/panels";
import type { Issue } from "../../contracts/issues";
import { pickCommands, recipeUsage, type PickerEntry } from "../features/recipe-picker/picker";
import { RecipePicker } from "../features/recipe-picker/recipe-picker";
import { errorMessage, toast } from "../shell/toasts";
import type { CanvasAdapter, CanvasViewProps, Insets, Point, PortDrop, Viewport } from "./adapter";
import "./canvas.css";
import { ghostContent, withGhostResults, type Ghost } from "./ghost/ghost";
import { freeSpot, obstaclesOf } from "./model/free-spot";
import { rateDisplayOf, type RateDisplay } from "./model/format";
import { GRID } from "./model/geometry";
import { createResultSlots } from "./model/result-slots";
import { insertCommands } from "./model/insert";
import { createSceneBuilder, type CanvasScene, type NodeView, type Subgraphs } from "./model/scene";
import { ReactFlowCanvas } from "./react-flow/react-flow-canvas";
import { CanvasContextMenu } from "./context-menu";
import { SelectionToolbar } from "./selection-toolbar";
import { UnitsPicker } from "./units-picker";
import { MultiEdit } from "./multi-edit";
import { canvasActions, canvasShown } from "./viewport";
import { FindPanel } from "../features/find/find-panel";
import { recipeChangeCommands, type FindResult } from "../features/find/find";
import { useFind } from "../features/find/find-store";
import type { Id } from "../../contracts/pack";
import { useEditActions, type Selection } from "./use-edit-actions";
import { useNavigation } from "./use-navigation";
import { usePaste } from "./use-paste";
import { setViewportCentre } from "./viewport";

/** The renderer in use; the only place that names it. */
const Renderer: CanvasAdapter = ReactFlowCanvas;

export interface CanvasProps {
  document?: Document;
  /** The data of the document's pack. */
  pack?: PackData;
  /** The latest results for the shown graph, or null while there are none. */
  results?: AnalysisResults | null;
  /** `root`, or the blueprint whose graph is shown. */
  graph?: string;
  /** Where to look first; the whole graph when left out. */
  viewport?: Viewport;
  /** The selected nodes changed. */
  onSelectionChange?: (nodeIds: LocalId[]) => void;
  /** A preview over the graph, such as a planner proposal (ghost/ghost.ts). */
  ghost?: Ghost | undefined;
  /** The ghost was moved or placed: its offset from its positions. */
  onGhostPlace?: (offset: Point) => void;
  onGhostCancel?: () => void;
  /** Screen pixels that overlays on the canvas cover besides the side panels; fitting keeps clear of them. */
  reserved?: Partial<Insets> | undefined;
  /** Drawn over the graph in flow coordinates, such as the bottleneck heatmap. */
  overlay?: ReactNode;
  /** A subgraph instance was double-clicked or its open button pressed (or "Open subgraph" ran on it). */
  onOpenSubgraph?: (instance: LocalId) => void;
  /** Sits at the canvas's top-left, such as the breadcrumbs inside a subgraph; bars at the top move below it. */
  header?: ReactNode;
  /** Find jumped to a node in another graph: open the way there. Without it, find jumps only on screen. */
  onReveal?: ((graph: string, nodeId: LocalId) => void) | undefined;
}

export function Canvas({
  document,
  pack,
  results = null,
  graph = "root",
  viewport,
  onSelectionChange = ignore,
  ...overlay
}: CanvasProps) {
  if (!document || !pack) return <EmptyCanvas />;
  return (
    <DocumentCanvas
      // Each graph is a canvas of its own: its view, selection and history start afresh.
      key={graph}
      document={document}
      pack={pack}
      results={results}
      graph={graph}
      {...(viewport && { viewport })}
      onSelectionChange={onSelectionChange}
      {...overlay}
    />
  );
}

const EMPTY_SCENE: CanvasScene = { nodes: [], edges: [] };
const EMPTY_RATES: RateDisplay = { unit: "per_minute" };

/** The side panels float `inset-3` (12 px) from the canvas edges (src/client/shell/side-panel.tsx). */
const PANEL_MARGIN = 12;

/** What the open side panels (and other overlays, `reserved`) cover of the canvas. */
function usePanelInsets(reserved?: Partial<Insets>): Insets {
  const left = usePanels((panels) => (panels.left.open ? panels.left.width + PANEL_MARGIN : 0));
  const right = usePanels((panels) => (panels.right.open ? panels.right.width + PANEL_MARGIN : 0));
  const extraLeft = reserved?.left ?? 0;
  const extraRight = reserved?.right ?? 0;
  return useMemo(() => ({ left: left + extraLeft, right: right + extraRight }), [left, right, extraLeft, extraRight]);
}
const ignore = () => undefined;

function EmptyCanvas() {
  const [results] = useState(createResultSlots);
  const insets = usePanelInsets();
  return (
    <Renderer
      scene={EMPTY_SCENE}
      insets={insets}
      results={results}
      rateUnit={EMPTY_RATES}
      machineGroups="fill"
      onMoveNodes={ignore}
      onConnect={ignore}
      onPortDropped={ignore}
      onInsert={ignore}
      onRewire={ignore}
      onDelete={ignore}
      onEditText={ignore}
      onResize={ignore}
      onToggleCollapsed={ignore}
      onViewSettled={ignore}
      onViewCentre={setViewportCentre}
      onSelectionChange={ignore}
    />
  );
}

function DocumentCanvas({
  document,
  pack,
  results,
  graph,
  viewport,
  onSelectionChange,
  ghost,
  onGhostPlace,
  onGhostCancel,
  reserved,
  overlay,
  onOpenSubgraph,
  header,
  onReveal,
}: Pick<
  CanvasProps,
  "ghost" | "onGhostPlace" | "onGhostCancel" | "reserved" | "overlay" | "onOpenSubgraph" | "header" | "onReveal"
> & {
  document: Document;
  pack: PackData;
  results: AnalysisResults | null;
  graph: string;
  viewport?: Viewport;
  onSelectionChange: (nodeIds: LocalId[]) => void;
}) {
  const connector = useConnector();
  const insets = usePanelInsets(reserved);
  const [buildScene] = useState(createSceneBuilder);
  const shown = graph === "root" ? document.graph : document.blueprints[graph]?.graph;
  const layout = document.layout[graph];
  // Instances draw their blueprint's ports: the blueprints and their layouts, the same object until one changes.
  const subgraphs = useSubgraphs(document);
  const scene = useMemo(
    () => (shown ? buildScene(shown, layout, pack, subgraphs) : EMPTY_SCENE),
    [buildScene, shown, layout, pack, subgraphs],
  );

  // A paste waiting to be placed is drawn over any other ghost: it's what the person did last.
  const paste = usePaste(document, graph, scene);
  const shownGhost = paste.ghost ?? ghost;
  const placeGhost = paste.ghost ? paste.onPlace : onGhostPlace;
  const cancelGhost = paste.ghost ? paste.onCancel : onGhostCancel;

  const [buildGhostScene] = useState(createSceneBuilder);
  // The ghost's content and its placement change apart: moving it mustn't rebuild (or re-reveal) it.
  const {
    graph: ghostGraph,
    positions: ghostPositions,
    label: ghostLabel,
    placement,
    results: ghostResults,
    subgraphs: ghostSubgraphs,
  } = shownGhost ?? {};
  // A paste from another factory brings blueprints of its own: its instances are drawn with those.
  const placedByGhost = useMemo(
    () =>
      ghostSubgraphs
        ? {
            blueprints: { ...subgraphs.blueprints, ...ghostSubgraphs.blueprints },
            layout: { ...subgraphs.layout, ...ghostSubgraphs.layout },
          }
        : subgraphs,
    [subgraphs, ghostSubgraphs],
  );
  const content = useMemo(
    () =>
      ghostGraph &&
      ghostPositions &&
      ghostContent(buildGhostScene(ghostGraph, ghostPositions, pack, placedByGhost), ghostLabel ?? ""),
    [buildGhostScene, ghostGraph, ghostPositions, ghostLabel, pack, placedByGhost],
  );
  const ghostScene = useMemo(() => content && placement && { ...content, placement }, [content, placement]);

  const forGraph = useMemo(
    () => withGhostResults(results?.graph === graph ? results : null, ghostResults),
    [results, graph, ghostResults],
  );
  const [slots] = useState(() => {
    const created = createResultSlots();
    created.update(forGraph);
    return created;
  });
  useLayoutEffect(() => slots.update(forGraph), [slots, forGraph]);

  const apply = useCallback(
    async (commands: CommandInput[], label: string) => {
      try {
        const result = await connector.editing.apply({ documentId: document.id, commands, label });
        if (!result.ok) {
          toast({ tone: "error", title: `Couldn't ${label.toLowerCase()}`, description: issuesText(result.error) });
        }
      } catch (error) {
        toast({ tone: "error", title: `Couldn't ${label.toLowerCase()}`, description: errorMessage(error) });
      }
    },
    [connector, document.id],
  );

  const onMoveNodes: CanvasViewProps["onMoveNodes"] = useCallback(
    (moved) => {
      // A collapsed frame takes what it holds along, so they're still inside when it opens.
      const carried = scene.nodes.flatMap((view) => {
        const frame = view.hiddenBy && moved[view.hiddenBy];
        const from = view.hiddenBy && layout?.[view.hiddenBy];
        if (!frame || !from || moved[view.id]) return [];
        return [[view.id, { x: view.position.x + frame.x - from.x, y: view.position.y + frame.y - from.y }] as const];
      });
      const positions = Object.fromEntries(
        [...Object.entries(moved), ...carried].map(([id, point]) => [id, { ...layout?.[id as LocalId], ...point }]),
      );
      void apply([{ type: "moveNodes", graph, positions }], "Move");
    },
    [apply, graph, layout, scene],
  );
  const onConnect: CanvasViewProps["onConnect"] = useCallback(
    (edge) => void apply([{ type: "connect", graph, edge }], "Connect"),
    [apply, graph],
  );

  const selection = useRef<Selection>({ nodes: [], edges: [] });
  /** Whether several nodes are selected: the selection toolbar shows then. */
  const [several, setSeveral] = useState(false);
  const onSelection: CanvasViewProps["onSelectionChange"] = useCallback(
    (nodes, edges) => {
      selection.current = { nodes, edges };
      setSeveral(nodes.length >= 2);
      onSelectionChange(nodes);
    },
    [onSelectionChange],
  );
  // Back and forward stay within the graph on screen.
  const navigation = useNavigation(graph === "root" ? document.id : `${document.id}/${graph}`);
  // The first settled view says the canvas is set up: a jump across levels can move it on from there.
  const viewSetUp = useRef(false);
  const { onViewSettled: settled } = navigation;
  const onViewSettled: CanvasViewProps["onViewSettled"] = useCallback(
    (view, size) => {
      settled(view, size);
      if (viewSetUp.current) return;
      viewSetUp.current = true;
      canvasShown();
    },
    [settled],
  );
  // Nodes an edit is about to add (a collapse's instance) are selected once they're drawn.
  const selectWhenShown = useRef<LocalId[] | null>(null);
  useLayoutEffect(() => {
    const wanted = selectWhenShown.current;
    if (!wanted) return;
    const ids = new Set(scene.nodes.map((view) => view.id));
    if (!wanted.every((id) => ids.has(id))) return;
    selectWhenShown.current = null;
    canvasActions()?.select(wanted);
  }, [scene]);
  const selectLater = useCallback((ids: LocalId[]) => (selectWhenShown.current = ids), []);
  const actions = useEditActions({
    document,
    pack,
    graph,
    scene,
    selection,
    apply,
    navigation: navigation.actions,
    openSubgraph: onOpenSubgraph,
    selectWhenShown: selectLater,
  });
  const onDelete: CanvasViewProps["onDelete"] = useCallback((bridge) => actions.deleteSelection(bridge), [actions]);
  const onInsert: CanvasViewProps["onInsert"] = useCallback(
    (nodeId, edgeId, point) => {
      const edge = shown?.edges[edgeId];
      const views = new Map(scene.nodes.map((view) => [view.id, view]));
      const node = views.get(nodeId);
      const consumer = edge && views.get(edge.to);
      const position = { ...layout?.[nodeId], ...point };
      const commands = edge && node && consumer && insertCommands(graph, edgeId, edge, node, consumer, position);
      if (commands) void apply(commands, `Insert ${nodeTitle(node)}`);
      else onMoveNodes({ [nodeId]: point });
    },
    [apply, graph, layout, scene, shown, onMoveNodes],
  );
  const onRewire: CanvasViewProps["onRewire"] = useCallback(
    (edgeId, to) => {
      const old = shown?.edges[edgeId];
      if (!old) return;
      // The flow keeps its belt and share; a port it leaves no longer applies.
      const { fromPort, toPort, ...kept } = old;
      const edge = {
        ...kept,
        ...to,
        ...(fromPort !== undefined && to.from === old.from && { fromPort }),
        ...(toPort !== undefined && to.to === old.to && { toPort }),
      };
      void apply(
        [
          { type: "disconnect", graph, ids: [edgeId] },
          { type: "connect", graph, edge },
        ],
        "Rewire",
      );
    },
    [apply, graph, shown],
  );

  const onEditText: CanvasViewProps["onEditText"] = useCallback(
    (id, text) => {
      const kind = shown?.nodes[id]?.kind;
      void apply([{ type: "setText", graph, id, text }], kind === "frame" ? "Rename frame" : "Edit note");
    },
    [apply, graph, shown],
  );
  const onToggleCollapsed: CanvasViewProps["onToggleCollapsed"] = useCallback(
    (id) => {
      const node = shown?.nodes[id];
      if (node?.kind !== "frame") return;
      const collapsed = !node.collapsed;
      void apply(
        [{ type: "setCollapsed", graph, ids: [id], collapsed }],
        collapsed ? "Collapse frame" : "Expand frame",
      );
    },
    [apply, graph, shown],
  );
  const onResize: CanvasViewProps["onResize"] = useCallback(
    (id, rect) =>
      void apply([{ type: "moveNodes", graph, positions: { [id]: { ...layout?.[id], ...rect } } }], "Resize"),
    [apply, graph, layout],
  );

  const finding = useFind((state) => state.open);
  const onJump = useCallback(
    (result: FindResult) =>
      result.graph === graph ? canvasActions()?.focus([result.nodeId]) : onReveal?.(result.graph, result.nodeId),
    [graph, onReveal],
  );
  const onReplace = useCallback(
    (from: Id, to: Id) => {
      const running: Record<string, LocalId[]> = {};
      const graphs = [
        ["root", document.graph] as const,
        ...Object.entries(document.blueprints).map(([id, b]) => [id, b.graph] as const),
      ];
      for (const [scope, { nodes }] of graphs) {
        const ids = Object.entries(nodes).flatMap(([id, node]) =>
          node.kind === "recipe" && node.recipe === from ? [id] : [],
        );
        if (ids.length > 0) running[scope] = ids;
      }
      const name = (id: Id) => pack.recipes.find((recipe) => recipe.id === id)?.name ?? id;
      void apply(
        recipeChangeCommands(document, pack, running, to),
        `Replace ${name(from)} with ${name(to)} everywhere`,
      );
    },
    [apply, document, pack],
  );

  // The recipe picker, while a connection dropped in empty space waits for its other end.
  const [drop, setDrop] = useState<(PortDrop & { bounds: { left: number; right: number; height: number } }) | null>(
    null,
  );
  const container = useRef<HTMLDivElement>(null);
  const onPortDropped = useCallback(
    (dropped: PortDrop) => {
      const width = container.current?.clientWidth ?? 0;
      const height = container.current?.clientHeight ?? 0;
      setDrop({ ...dropped, bounds: { left: insets.left, right: width - insets.right, height } });
    },
    [insets],
  );
  const usage = useMemo(() => (shown ? recipeUsage(shown) : {}), [shown]);
  const request = useMemo(() => drop && { item: drop.item, side: drop.side }, [drop]);
  const rateUnit = useMemo(() => rateDisplayOf(document.settings, pack), [document.settings, pack]);
  const onPick = useCallback(
    (entry: PickerEntry) => {
      if (!drop) return;
      setDrop(null);
      const from = { node: drop.node, item: drop.item, side: drop.side, ...(drop.port && { port: drop.port }) };
      const pick = { graph, from, entry, drop: drop.flow, id: newNodeId(entry) };
      void apply(clearOfOthers(pickCommands(pack, pick), scene, pack), `Add ${entry.title}`);
    },
    [apply, drop, graph, pack, scene],
  );

  return (
    <div ref={container} className="relative size-full">
      <CanvasContextMenu>
        <Renderer
          scene={scene}
          {...(viewport && { initialViewport: viewport })}
          insets={insets}
          results={slots}
          rateUnit={rateUnit}
          machineGroups={document.settings.machineGroups ?? "fill"}
          onMoveNodes={onMoveNodes}
          onConnect={onConnect}
          onPortDropped={onPortDropped}
          onViewCentre={setViewportCentre}
          onSelectionChange={onSelection}
          onInsert={onInsert}
          onRewire={onRewire}
          onDelete={onDelete}
          onEditText={onEditText}
          onResize={onResize}
          onToggleCollapsed={onToggleCollapsed}
          onViewSettled={onViewSettled}
          {...(onOpenSubgraph && { onOpenSubgraph })}
          ghost={ghostScene}
          {...(placeGhost && { onGhostPlace: placeGhost })}
          {...(cancelGhost && { onGhostCancel: cancelGhost })}
          overlay={overlay}
        />
      </CanvasContextMenu>
      {header && (
        <div style={{ left: insets.left }} className="pointer-events-none absolute top-3 ml-3 flex">
          {header}
        </div>
      )}
      {/* The bars at the top move down a row while a header takes the top-left. */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 ${header ? "mt-12" : ""}`}>
        {several && !finding && (
          <SelectionToolbar
            left={insets.left}
            right={insets.right}
            multiEdit={<MultiEdit document={document} pack={pack} graph={graph} selection={selection} apply={apply} />}
          />
        )}
        {finding && (
          <FindPanel
            document={document}
            pack={pack}
            graph={graph}
            leaves={onReveal !== undefined}
            left={insets.left}
            right={insets.right}
            onJump={onJump}
            onReplace={onReplace}
          />
        )}
      </div>
      <UnitsPicker settings={document.settings} pack={pack} right={insets.right} actions={actions} />
      {drop && request && (
        <RecipePicker
          pack={pack}
          request={request}
          usage={usage}
          rateUnit={rateUnit.unit}
          at={drop.screen}
          bounds={drop.bounds}
          onPick={onPick}
          onClose={() => setDrop(null)}
        />
      )}
    </div>
  );
}

/**
 * The document's blueprints and their layouts (what instance cards are drawn from), as one object that stays the
 * same until a blueprint or a blueprint's layout changes, so a ghost isn't rebuilt by edits elsewhere.
 */
function useSubgraphs(document: Document): Subgraphs {
  const { blueprints, layout } = document;
  const layouts = Object.fromEntries(Object.keys(blueprints).flatMap((id) => (layout[id] ? [[id, layout[id]]] : [])));
  const [kept, setKept] = useState<Subgraphs>(() => ({ blueprints, layout: layouts }));
  const same =
    kept.blueprints === blueprints &&
    Object.keys(layouts).length === Object.keys(kept.layout).length &&
    Object.entries(layouts).every(([id, positions]) => kept.layout[id] === positions);
  if (same) return kept;
  const next = { blueprints, layout: layouts };
  setKept(next);
  return next;
}

/** A readable, practically unique id for a new node: what it runs, plus a random suffix. */
function newNodeId(entry: PickerEntry): LocalId {
  const base = entry.kind === "recipe" ? entry.id : `${entry.kind}-${entry.item.id}`;
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

/** How a node is named in the history: "Insert Iron Plate". */
function nodeTitle(view: NodeView): string {
  switch (view.kind) {
    case "recipe":
      return view.title;
    case "source":
    case "sink":
      return view.item.name;
    case "junction":
      return "junction";
    default:
      return "node";
  }
}

/** Moves the nodes the commands add off the nodes already there, as little as it takes. */
function clearOfOthers(commands: CommandInput[], scene: CanvasScene, pack: PackData): CommandInput[] {
  const obstacles = obstaclesOf(scene.nodes);
  return commands.map((command) => {
    if (command.type !== "addNode") return command;
    const [view] = createSceneBuilder()({ nodes: { new: command.node }, edges: {} }, undefined, pack).nodes;
    const wanted = { ...command.position, width: view?.width ?? 0, height: view?.height ?? 0 };
    return { ...command, position: { ...command.position, ...freeSpot(wanted, obstacles, GRID) } };
  });
}

function issuesText(issues: Issue[]): string {
  return issues.map((issue) => issue.message).join(" ");
}
