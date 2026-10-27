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
  type Connection,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  type OnNodeDrag,
} from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";
import type { CanvasViewProps } from "../adapter";
import { connectionItem } from "../model/connect";
import { particlesShown } from "../model/flow-style";
import { GRID } from "../model/geometry";
import type { CanvasScene, EdgeView, NodeView } from "../model/scene";
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

function FlowCanvas({ scene, initialViewport, results, rateUnit, onMoveNodes, onConnect }: CanvasViewProps) {
  const [nodes, setNodes] = useState(() => scene.nodes.map((view) => toFlowNode(view)));
  const [edges, setEdges] = useState(() => scene.edges.map((view) => toFlowEdge(view)));
  const [shownScene, setShownScene] = useState(scene);
  if (shownScene !== scene) {
    // A new document version: adopt it, keeping what only the canvas knows (selection, a drag in progress).
    setShownScene(scene);
    setNodes((current) => mergeNodes(scene, current));
    setEdges((current) => mergeEdges(scene, current));
  }

  const context = useMemo(() => ({ results, rateUnit }), [results, rateUnit]);
  const particles = useStore((state) => particlesShown(state.transform[2]));

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
        isValidConnection={isValidConnection}
        {...(initialViewport ? { defaultViewport: initialViewport } : { fitView: true })}
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.05}
        maxZoom={2}
        aria-label="Factory canvas"
        {...(!particles && { className: "particles-off" })}
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
