// The CanvasAdapter drawn with React Flow. Nodes are positioned locally while dragged and reported once
// dropped; everything else comes from the scene, so the document stays the single source of truth.
// Interaction model (docs/Design/Editor-quality-of-life.md): drag on empty canvas selects with a box, Alt-drag
// with a lasso; scroll, middle- or right-drag and Space-drag pan; Ctrl or pinch zooms; arrows nudge.
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useStore,
  useReactFlow,
  useStoreApi,
  ViewportPortal,
  type Connection,
  type EdgeChange,
  type EdgeTypes,
  type FitViewOptions,
  type NodeChange,
  type NodeTypes,
  type OnConnectEnd,
  type OnNodeDrag,
} from "@xyflow/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CanvasViewProps, Connected, Insets, Point } from "../adapter";
import type { Move } from "../model/tween";
import { connectionItem, portOf } from "../model/connect";
import { particlesShown } from "../model/flow-style";
import { lodTier } from "../model/lod";
import { GRID } from "../model/geometry";
import type { CanvasScene, EdgeView, NodeView } from "../model/scene";
import { insideLasso, nudgeOffset } from "../model/selection";
import { setCanvasActions } from "../viewport";
import { visibleCentre } from "../model/view";
import { GhostFrameNode, useGhostLayer } from "../ghost/use-ghost-layer";
import { isGhost } from "../ghost/ghost";
import { FrameNode, JunctionNode, NoteNode } from "./annotation-nodes";
import { InstanceNode, PortNode } from "./subgraph-nodes";
import { CanvasContext } from "./context";
import { FlowEdge } from "./flow-edge";
import { LassoArea } from "./lasso";
import { handleBounds } from "./port-handle";
import { RecipeNode } from "./recipe-node";
import { SnapMarks, useSnapping } from "./snapping";
import { useAltHeld, useInsertTarget } from "./edge-gestures";
import { SinkNode, SourceNode } from "./terminal-nodes";
import { toPng, toSvg } from "html-to-image";
import { imageFrame } from "../model/image-frame";
import { withTag } from "./tag-badge";
import { useGraphWindow } from "./graph-window";
import { motionDurations, useMoveTween } from "./tween";
import type { FlowEdge as FlowEdgeType, FlowNode } from "./types";

const nodeTypes = {
  recipe: withTag(RecipeNode),
  source: withTag(SourceNode),
  sink: withTag(SinkNode),
  junction: withTag(JunctionNode),
  note: withTag(NoteNode),
  frame: withTag(FrameNode),
  instance: withTag(InstanceNode),
  port: withTag(PortNode),
  ghostFrame: GhostFrameNode,
} as NodeTypes;

const edgeTypes = { flow: FlowEdge } as EdgeTypes;

const MAJOR_GRID_EVERY = 4;
const DOT_SIZE = 1.5;
const MAJOR_DOT_SIZE = 2;

export function ReactFlowCanvas(props: CanvasViewProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvas {...props} />
    </ReactFlowProvider>
  );
}

function FlowCanvas({
  scene,
  initialViewport,
  insets,
  results,
  rateUnit,
  machineGroups,
  onMoveNodes,
  onConnect,
  onViewCentre,
  onPortDropped,
  onSelectionChange,
  ghost,
  onGhostPlace = ignore,
  onGhostCancel = ignore,
  overlay,
  onInsert,
  onRewire,
  onDelete,
  onEditText,
  onResize,
  onViewSettled,
  onOpenSubgraph = ignore,
}: CanvasViewProps) {
  const [nodes, setNodes] = useState(() => scene.nodes.map((view) => toFlowNode(view)));
  const [edges, setEdges] = useState(() => scene.edges.map((view) => toFlowEdge(view)));
  const [shownScene, setShownScene] = useState(scene);
  /** Where the canvas put nodes itself (a drop, a nudge), until the document says the same. */
  const pending = useRef(new Map<string, Point>());
  if (shownScene !== scene) {
    // A new document version: adopt it, keeping what only the canvas knows (selection, a drag in progress).
    // Nodes that moved keep their place for now and glide to the new one (below).
    setShownScene(scene);
    setNodes((current) => mergeNodes(scene, current));
    setEdges((current) => mergeEdges(scene, current));
  }
  const glide = useMoveTween(setNodes);
  /** While a picture is taken: every node drawn. */
  const [exporting, setExporting] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // One subscriber to the zoom for the whole canvas: nodes re-render only when the tier changes.
  const lod = useStore((state) => lodTier(state.transform[2]));
  const particles = useStore((state) => particlesShown(state.transform[2]));
  const context = useMemo(
    () => ({
      results,
      rateUnit,
      machineGroups,
      lod,
      editText: onEditText,
      resize: onResize,
      openSubgraph: onOpenSubgraph,
    }),
    [results, rateUnit, machineGroups, lod, onEditText, onResize, onOpenSubgraph],
  );

  const store = useStoreApi<FlowNode, FlowEdgeType>();
  // Once per adopted scene. It reads `nodes`: React Flow's store catches up with them in an effect of its own.
  const glided = useRef(shownScene);
  useLayoutEffect(() => {
    if (glided.current === shownScene) return;
    glided.current = shownScene;
    const moves = new Map<string, Move>();
    for (const node of nodes) {
      const to = node.data.view.position;
      const local = pending.current.get(node.id);
      if (local) {
        // A newer local move is on its way to the document: don't pull the node back meanwhile.
        if (local.x === to.x && local.y === to.y) pending.current.delete(node.id);
        continue;
      }
      if (!node.dragging && (node.position.x !== to.x || node.position.y !== to.y)) {
        moves.set(node.id, { from: node.position, to });
      }
    }
    glide(moves);
  }, [shownScene, nodes, glide]);
  const moveLocally = useCallback(
    (moved: Record<string, Point>) => {
      for (const [id, position] of Object.entries(moved)) pending.current.set(id, position);
      onMoveNodes(moved);
    },
    [onMoveNodes],
  );

  const snapping = useSnapping();
  const { snapChanges } = snapping;
  const { screenToFlowPosition, fitView, setViewport } = useReactFlow<FlowNode, FlowEdgeType>();
  const { getNodesBounds } = useReactFlow<FlowNode, FlowEdgeType>();
  // Shows a new ghost, with the graph around it while cards stay readable at the zoom that takes.
  const reveal = useCallback(
    (ghostNodes: { id: string }[], context: { id: string }[]) => {
      const { width, height } = store.getState();
      const all = [...ghostNodes, ...context];
      const bounds = getNodesBounds(all.map((node) => node.id));
      const room = { width: width - insets.left - insets.right - 2 * FIT_MARGIN, height: height - 2 * FIT_MARGIN };
      const zoom = Math.min(room.width / bounds.width, room.height / bounds.height);
      const shown = lodTier(zoom) === "chip" ? ghostNodes : all;
      void fitView({ ...fitOptions(insets), nodes: shown, duration: motionDuration() });
    },
    [fitView, getNodesBounds, insets, store],
  );
  const ghostLayer = useGhostLayer({ ghost, onPlace: onGhostPlace, onCancel: onGhostCancel, reveal });
  const { takeChanges, onKeyDown: ghostKeyDown } = ghostLayer;
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const snapped = snapChanges(takeChanges(changes), store.getState().nodes);
      setNodes((current) => applyNodeChanges(snapped, current));
    },
    [snapChanges, store, takeChanges],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdgeType>[]) => setEdges((current) => applyEdgeChanges(changes, current)),
    [],
  );
  const insert = useInsertTarget(scene);
  const { onNodeDrag: snapDrag, onNodeDragEnd } = snapping;
  const { follow: followInsert, end: endInsert } = insert;
  const onNodeDrag: OnNodeDrag<FlowNode> = useCallback(
    (event, node, dragged) => {
      snapDrag(event, node, dragged);
      if (!isGhost(node.id)) followInsert(dragged);
    },
    [snapDrag, followInsert],
  );
  const onNodeDragStop: OnNodeDrag<FlowNode> = useCallback(
    (_event, node, dragged) => {
      if (isGhost(node.id)) return;
      const dropped = onNodeDragEnd(dragged);
      const edge = endInsert();
      const position = dropped[node.id];
      if (edge && position && dragged.length === 1) {
        pending.current.set(node.id, position);
        onInsert(node.id, edge, position);
      } else moveLocally(dropped);
    },
    [moveLocally, onNodeDragEnd, endInsert, onInsert],
  );
  // The flow a dragged node would be inserted into stands out.
  const shownEdges = useMemo(
    () =>
      insert.target === undefined
        ? edges
        : edges.map((edge) => (edge.id === insert.target ? { ...edge, className: "is-insert-target" } : edge)),
    [edges, insert.target],
  );

  const graphWindow = useGraphWindow({
    scene: shownScene,
    nodes,
    edges: shownEdges,
    exporting,
    padding: fitOptions(insets).padding ?? 0,
  });
  const { windowed } = graphWindow;

  const altHeld = useAltHeld();
  const onReconnect = useCallback(
    (old: FlowEdgeType, connection: Connection) => {
      const item = connectionItem(normalise(connection));
      const unchanged =
        old.source === connection.source &&
        old.target === connection.target &&
        old.sourceHandle === connection.sourceHandle &&
        old.targetHandle === connection.targetHandle;
      if (!item || item !== old.data?.view.item || unchanged) return;
      onRewire(old.id, connected(connection, item));
    },
    [onRewire],
  );
  const { onNodeDragStart: startSnapping } = snapping;
  const onNodeDragStart: OnNodeDrag<FlowNode> = useCallback(
    (event, node, dragged) => {
      if (!isGhost(node.id)) startSnapping(event, node, dragged);
    },
    [startSnapping],
  );
  const isValidConnection = useCallback(
    (connection: Connection | FlowEdgeType) => connectionItem(normalise(connection)) !== undefined,
    [],
  );
  const handleConnect = useCallback(
    (connection: Connection) => {
      const item = connectionItem(normalise(connection));
      if (item) onConnect(connected(connection, item));
    },
    [onConnect],
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connection) => {
      // Only a drop on the empty pane asks for a new node; a drop on a node or port is a connection attempt.
      const target = event.target instanceof Element ? event.target : null;
      if (connection.isValid || !connection.fromHandle?.id || !connection.fromNode) return;
      if (!target?.classList.contains("react-flow__pane")) return;
      const view = scene.nodes.find((node) => node.id === connection.fromNode?.id);
      const port = view?.ports.find((candidate) => candidate.handle === connection.fromHandle?.id);
      const item = view?.kind === "junction" ? view.item?.id : port?.item.id;
      if (!view || !port || !item) return;
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      if (!point) return;
      const bounds = target.getBoundingClientRect();
      onPortDropped({
        node: view.id,
        item,
        ...(port.port !== undefined && { port: port.port }),
        side: port.direction,
        flow: screenToFlowPosition({ x: point.clientX, y: point.clientY }),
        screen: { x: point.clientX - bounds.left, y: point.clientY - bounds.top },
      });
    },
    [scene, screenToFlowPosition, onPortDropped],
  );

  const reportCentre = useCallback(() => {
    const { transform, width, height } = store.getState();
    const [x, y, zoom] = transform;
    if (width > 0) onViewCentre(visibleCentre({ x, y, zoom }, { width, height }, insets));
  }, [store, insets, onViewCentre]);
  useEffect(reportCentre, [reportCentre]);
  const onMoveEnd = useCallback(() => {
    reportCentre();
    const { transform, width, height } = store.getState();
    const [x, y, zoom] = transform;
    if (width > 0) onViewSettled({ x, y, zoom }, { width, height });
  }, [reportCentre, store, onViewSettled]);

  const { start: startWindow, fitTo, allNodes } = graphWindow;
  const onInit = useCallback(() => {
    startWindow(!initialViewport);
    onMoveEnd();
  }, [startWindow, initialViewport, onMoveEnd]);

  useEffect(() => {
    // Moves made here settle without React Flow saying so: report them, for back and forward.
    const settled = () => onMoveEnd();
    const fit = (nodes?: FlowNode[]) =>
      // The whole graph shows at most at 100%; a selection may be zoomed in on up to the canvas maximum.
      void (
        windowed
          ? fitTo(nodes, nodes ? MAX_ZOOM : 1, motionDuration())
          : fitView({ ...fitOptions(insets), ...(nodes && { nodes, maxZoom: MAX_ZOOM }), duration: motionDuration() })
      ).then(settled);
    setCanvasActions({
      zoomToFit: () => fit(),
      zoomToSelection: () => {
        const selected = store.getState().nodes.filter((node) => node.selected);
        fit(selected.length > 0 ? selected : undefined);
      },
      focus: (ids) => {
        const chosen = new Set(ids);
        setNodes((current) =>
          current.map((node) =>
            node.selected === chosen.has(node.id) ? node : { ...node, selected: chosen.has(node.id) },
          ),
        );
        const targets = (windowed ? allNodes() : store.getState().nodes).filter((node) => chosen.has(node.id));
        // Close enough to read the cards, never closer than real size.
        if (targets.length > 0) {
          const fitted = windowed
            ? fitTo(targets, 1, motionDuration())
            : fitView({ ...fitOptions(insets), nodes: targets, duration: motionDuration() });
          void fitted.then(settled);
        }
      },
      image: async (format) => {
        // Every node has to be drawn for the picture, so culling stops while it's taken.
        setExporting(true);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        try {
          const viewport = root.current?.querySelector<HTMLElement>(".react-flow__viewport");
          if (!viewport) throw new Error("The canvas isn't on screen");
          const frame = imageFrame(getNodesBounds(store.getState().nodes), FIT_MARGIN, MAX_IMAGE_SIDE);
          const { x, y, zoom } = frame.viewport;
          const options = {
            backgroundColor: backgroundOf(root.current),
            width: frame.width,
            height: frame.height,
            pixelRatio: 1,
            style: {
              width: `${frame.width}px`,
              height: `${frame.height}px`,
              transform: `translate(${x}px, ${y}px) scale(${zoom})`,
            },
          };
          return await (format === "png" ? toPng(viewport, options) : toSvg(viewport, options));
        } finally {
          setExporting(false);
        }
      },
      select: (nodeIds, edgeIds = []) => {
        const nodesChosen = new Set(nodeIds);
        const edgesChosen = new Set(edgeIds);
        setNodes((current) =>
          current.map((node) =>
            node.selected === nodesChosen.has(node.id) ? node : { ...node, selected: nodesChosen.has(node.id) },
          ),
        );
        setEdges((current) =>
          current.map((edge) =>
            edge.selected === edgesChosen.has(edge.id) ? edge : { ...edge, selected: edgesChosen.has(edge.id) },
          ),
        );
      },
      goTo: (viewport) => setViewport(viewport, { duration: motionDuration() }).then(settled),
      zoomInto: async (nodeId) => {
        const nodes = store.getState().nodes.filter((node) => node.id === nodeId);
        // Closer than any fit: the card fills the view, as if the canvas were about to pass through it.
        await fitView({
          ...fitOptions(insets),
          nodes,
          minZoom: MAX_ZOOM,
          maxZoom: MAX_ZOOM,
          duration: motionDuration(),
        });
        const [x, y, zoom] = store.getState().transform;
        return { x, y, zoom };
      },
      toFlow: (screen) => screenToFlowPosition(screen),
      view: () => {
        const { transform, width, height } = store.getState();
        const [x, y, zoom] = transform;
        return { viewport: { x, y, zoom }, size: { width, height } };
      },
    });
    return () => setCanvasActions(undefined);
  }, [fitView, fitTo, allNodes, windowed, getNodesBounds, setViewport, screenToFlowPosition, insets, store, onMoveEnd]);

  const onLasso = useCallback(
    (polygon: Point[], additive: boolean) => {
      const shape = polygon.map((point) => screenToFlowPosition(point));
      const candidates = store
        .getState()
        .nodes.filter((node) => node.type !== "frame")
        .map((node) => ({ id: node.id, ...node.position, width: node.width ?? 0, height: node.height ?? 0 }));
      const chosen = new Set(insideLasso(candidates, shape));
      setNodes((current) =>
        current.map((node) => {
          const selected = chosen.has(node.id) || (additive && !!node.selected);
          return node.selected === selected ? node : { ...node, selected };
        }),
      );
    },
    [screenToFlowPosition, store],
  );

  // Arrow keys nudge the selection; the move is one edit. Captured, so React Flow's own nudging stays out.
  const onKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (ghostKeyDown(event)) return;
      // With Ctrl or Cmd, arrows are shortcuts (into and out of subgraphs), not nudges.
      const offset = event.ctrlKey || event.metaKey ? undefined : nudgeOffset(event.key, event, GRID);
      const editable =
        event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable]");
      if (event.key === "Backspace" && !editable) {
        // The Delete key's command, for keyboards without one; with Mod+Shift, delete and bridge.
        event.preventDefault();
        onDelete((event.ctrlKey || event.metaKey) && event.shiftKey);
        return;
      }
      if (!offset || editable) return;
      const selected = store.getState().nodes.filter((node) => node.selected && !node.data.view.locked);
      if (selected.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const moved = Object.fromEntries(
        selected.map((node) => [node.id, { x: node.position.x + offset.x, y: node.position.y + offset.y }]),
      );
      setNodes((current) =>
        current.map((node) => {
          const position = moved[node.id];
          return position ? { ...node, position } : node;
        }),
      );
      moveLocally(moved);
    },
    [store, moveLocally, onDelete, ghostKeyDown],
  );

  const onNodeDoubleClick = useCallback(
    (_event: unknown, node: FlowNode) => {
      if (node.type === "instance" && !isGhost(node.id)) onOpenSubgraph(node.id);
    },
    [onOpenSubgraph],
  );

  // React Flow wants this handler stable; it reports every selection change, including box and lasso.
  const reportSelection = useCallback(
    ({ nodes: selected, edges: selectedEdges }: { nodes: FlowNode[]; edges: FlowEdgeType[] }) =>
      onSelectionChange(
        selected.map((node) => node.id),
        selectedEdges.map((edge) => edge.id),
      ),
    [onSelectionChange],
  );

  return (
    <CanvasContext value={context}>
      <div ref={root} className={`size-full ${altHeld ? "alt-held" : ""}`} onKeyDownCapture={onKeyDownCapture}>
        <LassoArea onLasso={onLasso}>
          <ReactFlow<FlowNode, FlowEdgeType>
            nodes={ghostLayer.nodes.length > 0 ? [...graphWindow.nodes, ...ghostLayer.nodes] : graphWindow.nodes}
            edges={ghostLayer.edges.length > 0 ? [...graphWindow.edges, ...ghostLayer.edges] : graphWindow.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            // Alt-drag an end of a flow to another port; without Alt, the ends belong to the ports.
            edgesReconnectable={altHeld}
            onReconnect={onReconnect}
            reconnectRadius={RECONNECT_RADIUS}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            selectionKeyCode={null}
            multiSelectionKeyCode="Shift"
            panOnDrag={PAN_BUTTONS}
            panOnScroll
            // Deleting is the Edit commands' job (one undoable edit); React Flow's would only hide nodes locally.
            deleteKeyCode={null}
            onConnect={handleConnect}
            onConnectEnd={onConnectEnd}
            onNodeDoubleClick={onNodeDoubleClick}
            onPaneMouseMove={ghostLayer.onPaneMouseMove}
            onPaneClick={ghostLayer.onPaneClick}
            onSelectionChange={reportSelection}
            onInit={onInit}
            onMoveEnd={onMoveEnd}
            // Bottom centre is the one place the floating side panels never cover.
            attributionPosition="bottom-center"
            isValidConnection={isValidConnection}
            {...(initialViewport ? { defaultViewport: initialViewport } : { fitView: true })}
            fitViewOptions={fitOptions(insets)}
            minZoom={0.05}
            maxZoom={MAX_ZOOM}
            aria-label="Factory canvas"
            className={`lod-${lod} ${particles ? "" : "particles-off"} ${ghostLayer.following ? "ghost-following" : ""}`}
            // Culling pays off while part of the graph is on screen. At chip zoom most of a graph that isn't
            // windowed is, and mounting and unmounting chips at the screen edges on every pan frame costs more
            // than drawing them all.
            onlyRenderVisibleElements={(lod !== "chip" || windowed) && !exporting}
          >
            <Background
              id="minor"
              variant={BackgroundVariant.Dots}
              gap={GRID}
              size={DOT_SIZE}
              offset={centredOnGrid(GRID, DOT_SIZE)}
              color="var(--color-grid-dot)"
            />
            <Background
              id="major"
              variant={BackgroundVariant.Dots}
              gap={GRID * MAJOR_GRID_EVERY}
              size={MAJOR_DOT_SIZE}
              offset={centredOnGrid(GRID * MAJOR_GRID_EVERY, MAJOR_DOT_SIZE)}
              color="var(--color-grid-dot-major)"
            />
            <SnapMarks guides={snapping.marks.guides} gaps={snapping.marks.gaps} />
            {overlay && <ViewportPortal>{overlay}</ViewportPortal>}
          </ReactFlow>
        </LassoArea>
      </div>
    </CanvasContext>
  );
}

const ignore = () => undefined;

/** How close to a flow's end, in screen pixels, an Alt-drag picks it up. */
const RECONNECT_RADIUS = 14;

/** Middle and right mouse buttons pan; the left one selects. */
const PAN_BUTTONS = [1, 2];

/** The slow motion token in milliseconds: 0 when the user prefers reduced motion. */
function motionDuration(): number {
  return motionDurations().slow;
}

/** Room around a fitted graph, in screen pixels, on top of what the panels cover. */
const FIT_MARGIN = 48;

const MAX_ZOOM = 2;

/** The colour behind the canvas: of the nearest element that paints one (the canvas backdrop). */
function backgroundOf(element: Element | null): string {
  for (let current = element; current; current = current.parentElement) {
    const colour = getComputedStyle(current).backgroundColor;
    if (colour && colour !== "transparent" && colour !== "rgba(0, 0, 0, 0)") return colour;
  }
  return getComputedStyle(document.body).backgroundColor;
}

/** Exported pictures stay this size or smaller along their longest side, in pixels. */
const MAX_IMAGE_SIDE = 8192;

function fitOptions(insets: Insets): FitViewOptions {
  return {
    // Plain numbers would be fractions of the viewport; these are pixels.
    padding: {
      top: `${FIT_MARGIN}px`,
      bottom: `${FIT_MARGIN}px`,
      left: `${insets.left + FIT_MARGIN}px`,
      right: `${insets.right + FIT_MARGIN}px`,
    },
    // A small factory shows at its real size instead of blown up to fill the screen.
    maxZoom: 1,
  };
}

/** React Flow shifts dots by half a gap; this offset puts their centres on multiples of the gap instead. */
function centredOnGrid(gap: number, size: number) {
  return size / 2 - gap / 2;
}

/** The flow two handles make, with the blueprint ports of the instances they belong to. */
function connected(connection: Connection, item: string): Connected {
  const fromPort = portOf(connection.sourceHandle);
  const toPort = portOf(connection.targetHandle);
  return {
    from: connection.source,
    to: connection.target,
    item,
    ...(fromPort !== undefined && { fromPort }),
    ...(toPort !== undefined && { toPort }),
  };
}

function normalise(connection: Connection | FlowEdgeType) {
  return {
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? null,
    targetHandle: connection.targetHandle ?? null,
  };
}

function toFlowNode(view: NodeView, previous?: FlowNode): FlowNode {
  return {
    id: view.id,
    type: view.kind,
    // An existing node keeps its place: a drag goes on, and a moved node glides there (see the layout effect).
    position: previous ? previous.position : view.position,
    width: view.width,
    height: view.height,
    // Known sizes count as measured, so culled nodes that were never drawn still take part in fitting.
    measured: { width: view.width, height: view.height },
    handles: view.ports.map(handleBounds),
    data: { view },
    ...(view.kind === "frame" && { zIndex: -1 }),
    ...(view.locked && { draggable: false, className: "is-locked" }),
    ...(previous?.selected && { selected: true }),
    ...(previous?.dragging && { dragging: true }),
  };
}

function mergeNodes(scene: CanvasScene, current: FlowNode[]): FlowNode[] {
  const byId = new Map(current.map((node) => [node.id, node]));
  return scene.nodes.map((view) => {
    const previous = byId.get(view.id);
    if (previous && previous.data.view === view) return previous;
    return toFlowNode(view, previous);
  });
}

function toFlowEdge(view: EdgeView, previous?: FlowEdgeType): FlowEdgeType {
  return {
    id: view.id,
    type: "flow",
    source: view.source,
    target: view.target,
    sourceHandle: view.sourceHandle,
    targetHandle: view.targetHandle,
    data: { view },
    ...(previous?.selected && { selected: true }),
  };
}

function mergeEdges(scene: CanvasScene, current: FlowEdgeType[]): FlowEdgeType[] {
  const byId = new Map(current.map((edge) => [edge.id, edge]));
  return scene.edges.map((view) => {
    const previous = byId.get(view.id);
    if (previous && sameEdge(previous.data?.view, view)) return previous;
    return toFlowEdge(view, previous);
  });
}

function sameEdge(a: EdgeView | undefined, b: EdgeView): boolean {
  return (
    !!a &&
    a.source === b.source &&
    a.target === b.target &&
    a.sourceHandle === b.sourceHandle &&
    a.targetHandle === b.targetHandle &&
    a.item === b.item
  );
}
