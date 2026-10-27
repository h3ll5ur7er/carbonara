// The CanvasAdapter drawn with React Flow. Nodes are positioned locally while dragged and reported once
// dropped; everything else comes from the scene, so the document stays the single source of truth.
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CanvasViewProps, Insets } from "../adapter";
import { connectionItem } from "../model/connect";
import { particlesShown } from "../model/flow-style";
import { lodTier } from "../model/lod";
import { GRID } from "../model/geometry";
import type { CanvasScene, EdgeView, NodeView } from "../model/scene";
import { visibleCentre } from "../model/view";
import { FrameNode, JunctionNode, NoteNode, PlaceholderNode } from "./annotation-nodes";
import { CanvasContext } from "./context";
import { FlowEdge } from "./flow-edge";
import { handleBounds } from "./port-handle";
import { RecipeNode } from "./recipe-node";
import { SinkNode, SourceNode } from "./terminal-nodes";
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
}: CanvasViewProps) {
  const [nodes, setNodes] = useState(() => scene.nodes.map((view) => toFlowNode(view)));
  const [edges, setEdges] = useState(() => scene.edges.map((view) => toFlowEdge(view)));
  const [shownScene, setShownScene] = useState(scene);
  if (shownScene !== scene) {
    // A new document version: adopt it, keeping what only the canvas knows (selection, a drag in progress).
    setShownScene(scene);
    setNodes((current) => mergeNodes(scene, current));
    setEdges((current) => mergeEdges(scene, current));
  }

  // One subscriber to the zoom for the whole canvas: nodes re-render only when the tier changes.
  const lod = useStore((state) => lodTier(state.transform[2]));
  const particles = useStore((state) => particlesShown(state.transform[2]));
  const context = useMemo(() => ({ results, rateUnit, lod }), [results, rateUnit, lod]);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdgeType>[]) => setEdges((current) => applyEdgeChanges(changes, current)),
    [],
  );
  const onNodeDragStop: OnNodeDrag<FlowNode> = useCallback(
    (_event, _node, dragged) => onMoveNodes(Object.fromEntries(dragged.map((node) => [node.id, node.position]))),
    [onMoveNodes],
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

  const { screenToFlowPosition } = useReactFlow<FlowNode, FlowEdgeType>();
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

  const store = useStoreApi<FlowNode, FlowEdgeType>();
  const reportCentre = useCallback(() => {
    const { transform, width, height } = store.getState();
    const [x, y, zoom] = transform;
    if (width > 0) onViewCentre(visibleCentre({ x, y, zoom }, { width, height }, insets));
  }, [store, insets, onViewCentre]);
  useEffect(reportCentre, [reportCentre]);

  return (
    <CanvasContext value={context}>
      <ReactFlow<FlowNode, FlowEdgeType>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={handleConnect}
        onConnectEnd={onConnectEnd}
        onInit={reportCentre}
        onMoveEnd={reportCentre}
        // Bottom centre is the one place the floating side panels never cover.
        attributionPosition="bottom-center"
        isValidConnection={isValidConnection}
        {...(initialViewport ? { defaultViewport: initialViewport } : { fitView: true })}
        fitViewOptions={fitOptions(insets)}
        minZoom={0.05}
        maxZoom={2}
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
      </ReactFlow>
    </CanvasContext>
  );
}

/** Room around a fitted graph, in screen pixels, on top of what the panels cover. */
const FIT_MARGIN = 48;

function fitOptions(insets: Insets): FitViewOptions {
  return {
    // Plain numbers would be fractions of the viewport; these are pixels.
    padding: {
      top: `${FIT_MARGIN}px`,
      bottom: `${FIT_MARGIN}px`,
      left: `${insets.left + FIT_MARGIN}px`,
      right: `${insets.right + FIT_MARGIN}px`,
    },
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
    position: previous?.dragging ? previous.position : view.position,
    width: view.width,
    height: view.height,
    // Known sizes count as measured, so culled nodes that were never drawn still take part in fitting.
    measured: { width: view.width, height: view.height },
    handles: view.ports.map(handleBounds),
    data: { view },
    ...(view.kind === "frame" && { zIndex: -1 }),
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
