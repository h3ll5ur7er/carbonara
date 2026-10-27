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
import type { CanvasViewProps, Insets, Point } from "../adapter";
import type { Move } from "../model/tween";
import { connectionItem } from "../model/connect";
import { particlesShown } from "../model/flow-style";
import { lodTier } from "../model/lod";
import { GRID } from "../model/geometry";
import type { CanvasScene, EdgeView, NodeView } from "../model/scene";
import { insideLasso, nudgeOffset } from "../model/selection";
import { setCanvasActions } from "../viewport";
import { visibleCentre } from "../model/view";
import { FrameNode, JunctionNode, NoteNode, PlaceholderNode } from "./annotation-nodes";
import { CanvasContext } from "./context";
import { FlowEdge } from "./flow-edge";
import { LassoArea } from "./lasso";
import { handleBounds } from "./port-handle";
import { RecipeNode } from "./recipe-node";
import { SnapMarks, useSnapping } from "./snapping";
import { useAltHeld, useInsertTarget } from "./edge-gestures";
import { SinkNode, SourceNode } from "./terminal-nodes";
import { motionDurations, useMoveTween } from "./tween";
import type { FlowEdge as FlowEdgeType, FlowNode } from "./types";

const nodeTypes = {
  recipe: RecipeNode,
  source: SourceNode,
  sink: SinkNode,
  junction: JunctionNode,
  note: NoteNode,
  frame: FrameNode,
  placeholder: PlaceholderNode,
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
  onMoveNodes,
  onConnect,
  onViewCentre,
  onPortDropped,
  onSelectionChange,
  onInsert,
  onRewire,
  onDelete,
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

  // One subscriber to the zoom for the whole canvas: nodes re-render only when the tier changes.
  const lod = useStore((state) => lodTier(state.transform[2]));
  const particles = useStore((state) => particlesShown(state.transform[2]));
  const context = useMemo(() => ({ results, rateUnit, lod }), [results, rateUnit, lod]);

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
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const snapped = snapChanges(changes, store.getState().nodes);
      setNodes((current) => applyNodeChanges(snapped, current));
    },
    [snapChanges, store],
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
      followInsert(dragged);
    },
    [snapDrag, followInsert],
  );
  const onNodeDragStop: OnNodeDrag<FlowNode> = useCallback(
    (_event, node, dragged) => {
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
      onRewire(old.id, { from: connection.source, to: connection.target, item });
    },
    [onRewire],
  );
  const isValidConnection = useCallback(
    (connection: Connection | FlowEdgeType) => connectionItem(normalise(connection)) !== undefined,
    [],
  );
  const handleConnect = useCallback(
    (connection: Connection) => {
      const item = connectionItem(normalise(connection));
      if (item) onConnect({ from: connection.source, to: connection.target, item });
    },
    [onConnect],
  );

  const { screenToFlowPosition, fitView } = useReactFlow<FlowNode, FlowEdgeType>();
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

  useEffect(() => {
    const fit = (nodes?: FlowNode[]) =>
      // The whole graph shows at most at 100%; a selection may be zoomed in on up to the canvas maximum.
      void fitView({ ...fitOptions(insets), ...(nodes && { nodes, maxZoom: MAX_ZOOM }), duration: motionDuration() });
    setCanvasActions({
      zoomToFit: () => fit(),
      zoomToSelection: () => {
        const selected = store.getState().nodes.filter((node) => node.selected);
        fit(selected.length > 0 ? selected : undefined);
      },
    });
    return () => setCanvasActions(undefined);
  }, [fitView, insets, store]);

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
      const offset = nudgeOffset(event.key, event, GRID);
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
    [store, moveLocally, onDelete],
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
      <div className={`size-full ${altHeld ? "alt-held" : ""}`} onKeyDownCapture={onKeyDownCapture}>
        <LassoArea onLasso={onLasso}>
          <ReactFlow<FlowNode, FlowEdgeType>
            nodes={nodes}
            edges={shownEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={snapping.onNodeDragStart}
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
            onSelectionChange={reportSelection}
            onInit={reportCentre}
            onMoveEnd={reportCentre}
            // Bottom centre is the one place the floating side panels never cover.
            attributionPosition="bottom-center"
            isValidConnection={isValidConnection}
            {...(initialViewport ? { defaultViewport: initialViewport } : { fitView: true })}
            fitViewOptions={fitOptions(insets)}
            minZoom={0.05}
            maxZoom={MAX_ZOOM}
            aria-label="Factory canvas"
            className={`lod-${lod} ${particles ? "" : "particles-off"}`}
            // Culling pays off while part of the graph is on screen. At chip zoom most of it is, and mounting
            // and unmounting chips at the screen edges on every pan frame costs more than drawing them all.
            onlyRenderVisibleElements={lod !== "chip"}
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
          </ReactFlow>
        </LassoArea>
      </div>
    </CanvasContext>
  );
}

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
