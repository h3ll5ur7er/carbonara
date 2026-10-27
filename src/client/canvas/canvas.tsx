// The factory canvas. Hides how a document is drawn (React Flow today, behind the CanvasAdapter seam) and
// turns what the user does on it into `editing` commands sent through the connector.
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import type { CommandInput } from "../../contracts/commands";
import type { Document, LocalId } from "../../contracts/document";
import type { PackData } from "../../contracts/pack";
import type { AnalysisResults } from "../../contracts/results";
import { useConnector } from "../core/connector";
import type { CanvasAdapter, CanvasViewProps, Viewport } from "./adapter";
import "./canvas.css";
import { createResultSlots } from "./model/result-slots";
import { createSceneBuilder, type CanvasScene } from "./model/scene";
import { ReactFlowCanvas } from "./react-flow/react-flow-canvas";

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
}

export function Canvas({ document, pack, results = null, graph = "root", viewport }: CanvasProps) {
  if (!document || !pack) return <EmptyCanvas />;
  return (
    <DocumentCanvas document={document} pack={pack} results={results} graph={graph} {...(viewport && { viewport })} />
  );
}

const EMPTY_SCENE: CanvasScene = { nodes: [], edges: [] };
const ignore = () => undefined;

function EmptyCanvas() {
  const [results] = useState(createResultSlots);
  return (
    <Renderer scene={EMPTY_SCENE} results={results} rateUnit="per_minute" onMoveNodes={ignore} onConnect={ignore} />
  );
}

function DocumentCanvas({
  document,
  pack,
  results,
  graph,
  viewport,
}: {
  document: Document;
  pack: PackData;
  results: AnalysisResults | null;
  graph: string;
  viewport?: Viewport;
}) {
  const connector = useConnector();
  const [buildScene] = useState(createSceneBuilder);
  const shown = graph === "root" ? document.graph : document.blueprints[graph]?.graph;
  const layout = document.layout[graph];
  const scene = useMemo(
    () => (shown ? buildScene(shown, layout, pack) : EMPTY_SCENE),
    [buildScene, shown, layout, pack],
  );

  const forGraph = results?.graph === graph ? results : null;
  const [slots] = useState(() => {
    const created = createResultSlots();
    created.update(forGraph);
    return created;
  });
  useLayoutEffect(() => slots.update(forGraph), [slots, forGraph]);

  const apply = useCallback(
    async (commands: CommandInput[], label: string) => {
      const result = await connector.editing.apply({ documentId: document.id, commands, label });
      // Until toasts exist (CARB-22), a refused edit is only logged.
      if (!result.ok) console.warn(`${label} was refused`, result.error);
    },
    [connector, document.id],
  );

  const onMoveNodes: CanvasViewProps["onMoveNodes"] = useCallback(
    (moved) => {
      const positions = Object.fromEntries(
        Object.entries(moved).map(([id, point]) => [id, { ...layout?.[id as LocalId], ...point }]),
      );
      void apply([{ type: "moveNodes", graph, positions }], "Move");
    },
    [apply, graph, layout],
  );
  const onConnect: CanvasViewProps["onConnect"] = useCallback(
    (edge) => void apply([{ type: "connect", graph, edge }], "Connect"),
    [apply, graph],
  );

  return (
    <Renderer
      scene={scene}
      {...(viewport && { initialViewport: viewport })}
      results={slots}
      rateUnit={document.settings.rateUnit ?? pack.units.rate}
      onMoveNodes={onMoveNodes}
      onConnect={onConnect}
    />
  );
}
