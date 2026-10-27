// A large graph reaches React Flow as the window around the view (model/window.ts), which moves only when the view
// leaves it: React Flow's own work per pan frame (culling, its selection listener) scans every node it has. Hides
// the window, when it moves, and how nodes outside it are still fitted (docs/Design.md, Performance).
import { getViewportForBounds, useReactFlow, useStoreApi, type ReactFlowState } from "@xyflow/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CanvasScene } from "../model/scene";
import { graphWindow, serves, windowAround, WINDOWED_ABOVE, type Box } from "../model/window";
import type { FlowEdge, FlowNode } from "./types";

export interface GraphWindowInput {
  scene: CanvasScene;
  /** Every node and edge, as the canvas holds them. */
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** While a picture is taken: every node is handed over. */
  exporting: boolean;
  /** Padding when fitting, as React Flow's `fitView` takes it. */
  padding: Parameters<typeof getViewportForBounds>[5];
}

export interface GraphWindow {
  /** Whether the graph is large enough to be windowed. */
  windowed: boolean;
  /** What to hand React Flow. */
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Call once React Flow is set up; fits the whole graph first when `fitWhole`. Windowing starts then. */
  start(fitWhole: boolean): void;
  /** Fits nodes React Flow may not have (every node when none are given). */
  fitTo(nodes: FlowNode[] | undefined, maxZoom: number, duration: number): Promise<boolean>;
  /** Every node, also those outside the window. */
  allNodes(): FlowNode[];
}

export function useGraphWindow({ scene, nodes, edges, exporting, padding }: GraphWindowInput): GraphWindow {
  const store = useStoreApi<FlowNode, FlowEdge>();
  const { getNodesBounds, setViewport } = useReactFlow<FlowNode, FlowEdge>();
  const index = useMemo(() => (scene.nodes.length > WINDOWED_ABOVE ? graphWindow(scene) : undefined), [scene]);
  const [box, setBox] = useState<Box>();
  /** React Flow has the whole graph until its view is set up: fitting it on init needs every node. */
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!index || !started) return;
    let current: Box | undefined;
    const follow = ({ transform: [x, y, zoom], width, height }: ReactFlowState<FlowNode, FlowEdge>) => {
      if (width === 0) return;
      const view = { x: -x / zoom, y: -y / zoom, width: width / zoom, height: height / zoom };
      if (current && serves(current, view)) return;
      setBox((current = windowAround(view)));
    };
    follow(store.getState());
    return store.subscribe(follow);
  }, [index, started, store]);

  const all = useRef(nodes);
  useLayoutEffect(() => {
    all.current = nodes;
  }, [nodes]);

  const shown = useMemo(() => {
    if (!index || !box || exporting) return { nodes, edges };
    const inside = index.nodesIn(box);
    // What is selected or dragged stays, wherever it is: selections are kept and moved in React Flow.
    const kept = nodes.filter((node) => inside.has(node.id) || node.selected || node.dragging);
    const ids = new Set(kept.map((node) => node.id));
    return { nodes: kept, edges: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) };
  }, [index, box, exporting, nodes, edges]);

  const fitTo = useCallback(
    (targets: FlowNode[] | undefined, maxZoom: number, duration: number) => {
      const { width, height, minZoom } = store.getState();
      const bounds = getNodesBounds(targets ?? all.current);
      return setViewport(getViewportForBounds(bounds, width, height, minZoom, maxZoom, padding), { duration });
    },
    [store, getNodesBounds, setViewport, padding],
  );
  const start = useCallback(
    (fitWhole: boolean) => {
      // A large graph is fitted here, before its window replaces the whole graph in React Flow.
      if (index && fitWhole && store.getState().width > 0) void fitTo(undefined, 1, 0);
      setStarted(true);
    },
    [index, store, fitTo],
  );
  const allNodes = useCallback(() => all.current, []);

  return { windowed: index !== undefined, ...shown, start, fitTo, allNodes };
}
