// The subgraph a document's canvas shows, and moving between levels: opening an instance dives into it (the view
// zooms into its card, then its blueprint grows in), leaving zooms back out of it to where the view was. Inside a
// blueprint, its results are followed while it's on screen, and breadcrumbs lead back up.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { Document, LocalId } from "../../../contracts/document";
import type { DocumentInfo } from "../../../contracts/managers";
import type { AnalysisResults } from "../../../contracts/results";
import type { Viewport } from "../../canvas/adapter";
import { focusNodeWhenShown } from "../../canvas/focus";
import { canvasActions } from "../../canvas/viewport";
import { useConnector } from "../../core/connector";
import { useModels } from "../../core/models";
import { errorMessage, toast } from "../../shell/toasts";
import { Breadcrumbs } from "./breadcrumbs";
import { crumbsOf, graphOf, instancesOf, livePath } from "./path";
import { pathOf, setPath, setSubgraphNavigation, useSubgraphs, type Opened } from "./subgraph-store";

const NONE: readonly Opened[] = [];

export interface SubgraphView {
  /** `root`, or the blueprint on screen. */
  graph: string;
  /** The results to show: the root graph's, or the blueprint's (all its instances together). */
  results: AnalysisResults | null;
  /** Where the canvas starts when it comes back up out of a subgraph. */
  viewport: Viewport | undefined;
  /** How the canvas arrived at this level, for its entrance: diving in, coming back up, or neither. */
  motion: "enter" | "leave" | undefined;
  onOpenSubgraph(instance: LocalId): void;
  /** The breadcrumbs, inside a subgraph. */
  header: ReactNode;
}

interface Arrival {
  documentId: string;
  graph: string;
  kind: "enter" | "leave";
  /** Leaving: the view zoomed into the instance, and the view to glide back to. */
  from?: Viewport | undefined;
  to?: Viewport | undefined;
}

export function useSubgraphView({
  info,
  document,
  results,
  leaveShortcut,
}: {
  info: DocumentInfo | null;
  document: Document | undefined;
  results: AnalysisResults | undefined;
  leaveShortcut?: string[] | undefined;
}): SubgraphView {
  const documentId = info?.id ?? "";
  const connector = useConnector();
  const stored = useSubgraphs((state) => state.paths[documentId] ?? NONE);
  // An undo, an expand or a delete can take away a level that's open: the canvas goes up to what's still there.
  // (While the document loads, the path stays as it was.)
  const path = document ? livePath(document, stored) : stored;
  useEffect(() => {
    if (path !== stored) setPath(documentId, path);
  }, [documentId, path, stored]);
  const graph = graphOf(path);
  const inside = useGraphResults(documentId, graph);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const arrived = arrival?.documentId === documentId && arrival.graph === graph ? arrival : undefined;

  const onOpenSubgraph = useCallback(
    (instance: LocalId) => {
      const shown = graph === "root" ? document?.graph : document?.blueprints[graph]?.graph;
      const node = shown?.nodes[instance];
      if (node?.kind !== "instance" || !document?.blueprints[node.blueprint]) return;
      const blueprint = node.blueprint;
      const actions = canvasActions();
      const above = actions?.view().viewport;
      const dive = actions?.zoomInto(instance) ?? Promise.resolve(undefined);
      void dive
        .catch(() => undefined)
        .then((into) => {
          setPath(documentId, [...pathOf(documentId), { instance, blueprint, above, into }]);
          setArrival({ documentId, graph: blueprint, kind: "enter" });
          // The canvas above goes away with the focus in it: the keyboard carries on inside, from the first node.
          focusNodeWhenShown();
        });
    },
    [document, documentId, graph],
  );

  const leaveTo = useCallback(
    (depth: number) => {
      const current = pathOf(documentId);
      const left = current[depth];
      if (!left) return;
      const remaining = current.slice(0, depth);
      setPath(documentId, remaining);
      setArrival({ documentId, graph: graphOf(remaining), kind: "leave", from: left.into, to: left.above });
      // Back on the instance that was opened, as a dialog hands the focus back to what opened it.
      focusNodeWhenShown(left.instance);
    },
    [documentId],
  );

  // Back up: the canvas starts zoomed into the instance just left and glides out to where the view was.
  useEffect(() => {
    if (arrived?.kind === "leave" && arrived.to) void canvasActions()?.goTo(arrived.to);
  }, [arrived]);

  useEffect(() => {
    setSubgraphNavigation({ leave: () => leaveTo(pathOf(documentId).length - 1) });
    return () => setSubgraphNavigation(undefined);
  }, [documentId, leaveTo]);

  const blueprint = path.at(-1)?.blueprint;
  const onRename = useCallback(
    (name: string) => {
      if (!blueprint) return;
      connector.editing
        .apply({ documentId, commands: [{ type: "renameBlueprint", blueprint, name }], label: `Rename to ${name}` })
        .then(
          (result) => {
            if (!result.ok) {
              toast({
                tone: "error",
                title: "Couldn't rename",
                description: result.error.map((e) => e.message).join(" "),
              });
            }
          },
          (error: unknown) => toast({ tone: "error", title: "Couldn't rename", description: errorMessage(error) }),
        );
    },
    [connector, documentId, blueprint],
  );

  const header = useMemo(
    () =>
      document && blueprint ? (
        <Breadcrumbs
          crumbs={crumbsOf(document, path)}
          instances={instancesOf(document, blueprint)}
          leaveShortcut={leaveShortcut}
          onLeaveTo={leaveTo}
          onRename={onRename}
        />
      ) : null,
    [document, blueprint, path, leaveShortcut, leaveTo, onRename],
  );

  return {
    graph,
    results: graph === "root" ? (results ?? null) : (inside ?? null),
    viewport: arrived?.kind === "leave" ? arrived.from : undefined,
    motion: arrived?.kind,
    onOpenSubgraph,
    header,
  };
}

/** A blueprint graph's results while it's on screen (the backend solves its inside only for those who ask). */
function useGraphResults(documentId: string, graph: string): AnalysisResults | undefined {
  const { results: model } = useModels();
  useEffect(() => {
    if (!documentId || graph === "root") return;
    let stop: (() => void) | undefined;
    let left = false;
    model.watchGraph(documentId, graph).then(
      (stopWatching) => {
        if (left) stopWatching();
        else stop = stopWatching;
      },
      () => undefined,
    );
    return () => {
      left = true;
      stop?.();
    };
  }, [model, documentId, graph]);
  return useStore(model.store, (state) => (graph === "root" ? undefined : state.blueprints[documentId]?.[graph]));
}
