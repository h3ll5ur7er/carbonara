// The factory canvas. Hides how a document is drawn (React Flow today, behind the CanvasAdapter seam) and
// turns what the user does on it into `editing` commands sent through the connector.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import type { CanvasAdapter, CanvasViewProps, Insets, PortDrop, Viewport } from "./adapter";
import "./canvas.css";
import { createResultSlots } from "./model/result-slots";
import { createSceneBuilder, type CanvasScene } from "./model/scene";
import { ReactFlowCanvas } from "./react-flow/react-flow-canvas";
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
}

export function Canvas({ document, pack, results = null, graph = "root", viewport }: CanvasProps) {
  if (!document || !pack) return <EmptyCanvas />;
  return (
    <DocumentCanvas document={document} pack={pack} results={results} graph={graph} {...(viewport && { viewport })} />
  );
}

const EMPTY_SCENE: CanvasScene = { nodes: [], edges: [] };

/** The side panels float `inset-3` (12 px) from the canvas edges (src/client/shell/side-panel.tsx). */
const PANEL_MARGIN = 12;

/** What the open side panels cover of the canvas. */
function usePanelInsets(): Insets {
  const left = usePanels((panels) => (panels.left.open ? panels.left.width + PANEL_MARGIN : 0));
  const right = usePanels((panels) => (panels.right.open ? panels.right.width + PANEL_MARGIN : 0));
  return useMemo(() => ({ left, right }), [left, right]);
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
      rateUnit="per_minute"
      onMoveNodes={ignore}
      onConnect={ignore}
      onPortDropped={ignore}
      onViewCentre={setViewportCentre}
    />
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
  const insets = usePanelInsets();
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
  const rateUnit = document.settings.rateUnit ?? pack.units.rate;
  const onPick = useCallback(
    (entry: PickerEntry) => {
      if (!drop) return;
      setDrop(null);
      const pick = { graph, from: drop, entry, drop: drop.flow, id: newNodeId(entry) };
      void apply(pickCommands(pack, pick), `Add ${entry.title}`);
    },
    [apply, drop, graph, pack],
  );

  return (
    <div ref={container} className="relative size-full">
      <Renderer
        scene={scene}
        {...(viewport && { initialViewport: viewport })}
        insets={insets}
        results={slots}
        rateUnit={rateUnit}
        onMoveNodes={onMoveNodes}
        onConnect={onConnect}
        onPortDropped={onPortDropped}
        onViewCentre={setViewportCentre}
      />
      {drop && request && (
        <RecipePicker
          pack={pack}
          request={request}
          usage={usage}
          rateUnit={rateUnit}
          at={drop.screen}
          bounds={drop.bounds}
          onPick={onPick}
          onClose={() => setDrop(null)}
        />
      )}
    </div>
  );
}

/** A readable, practically unique id for a new node: what it runs, plus a random suffix. */
function newNodeId(entry: PickerEntry): LocalId {
  const base = entry.kind === "recipe" ? entry.id : `${entry.kind}-${entry.item.id}`;
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

function issuesText(issues: Issue[]): string {
  return issues.map((issue) => issue.message).join(" ");
}
