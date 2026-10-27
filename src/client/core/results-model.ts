// The latest solve results of the documents the client shows, per document: the root graph's while the document
// is watched, and a blueprint graph's while a view looks inside it (the backend solves those only on request).
// Fed by `resultsChanged`, seeded by `analysis.getResults`.
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Backend, Events } from "../../contracts/managers";
import type { AnalysisResults } from "../../contracts/results";
import type { Subscribable } from "../../utilities/rpc";

export interface ResultsState {
  /** The root graph's results, by document. */
  results: Record<string, AnalysisResults>;
  /** Results of the blueprint graphs being looked at, by document and blueprint. */
  blueprints: Record<string, Record<string, AnalysisResults>>;
}

export type ResultsConnector = {
  analysis: Pick<Backend["analysis"], "getResults" | "watchResults" | "unwatchResults">;
} & Pick<Subscribable<Events>, "on">;

export interface ResultsModel {
  store: StoreApi<ResultsState>;
  /** Loads the document's latest results and follows them until the document closes. */
  watch(documentId: string): Promise<void>;
  /** Loads a blueprint graph's results and follows them until the returned function is called. */
  watchGraph(documentId: string, graph: string): Promise<() => void>;
  dispose(): void;
}

export function createResultsModel(connector: ResultsConnector): ResultsModel {
  const store = createStore<ResultsState>(() => ({ results: {}, blueprints: {} }));
  const watched = new Set<string>();
  /** How many views look at each blueprint graph, by `documentId/graph`. */
  const looking = new Map<string, number>();
  const key = (documentId: string, graph: string) => `${documentId}\u0000${graph}`;

  /** Keeps whichever results belong to the newer document version. */
  function offer(results: AnalysisResults | null): void {
    if (!results) return;
    const { documentId, graph } = results;
    if (graph === "root") {
      if (!watched.has(documentId)) return;
      const current = store.getState().results[documentId];
      if (current && current.version >= results.version) return;
      store.setState(({ results: all }) => ({ results: { ...all, [documentId]: results } }));
      return;
    }
    if (!looking.has(key(documentId, graph))) return;
    const current = store.getState().blueprints[documentId]?.[graph];
    if (current && current.version >= results.version) return;
    store.setState(({ blueprints }) => ({
      blueprints: { ...blueprints, [documentId]: { ...blueprints[documentId], [graph]: results } },
    }));
  }

  function forgetGraph(documentId: string, graph: string): void {
    store.setState(({ blueprints }) => {
      const graphs = { ...blueprints[documentId] };
      Reflect.deleteProperty(graphs, graph);
      const next = { ...blueprints, [documentId]: graphs };
      if (Object.keys(graphs).length === 0) Reflect.deleteProperty(next, documentId);
      return { blueprints: next };
    });
  }

  const stops = [
    connector.on("resultsChanged", offer),
    connector.on("documentsChanged", ({ documents }) => {
      const open = new Set(documents.map((document) => document.id));
      for (const documentId of [...watched]) {
        if (open.has(documentId)) continue;
        watched.delete(documentId);
        store.setState(({ results: all, blueprints }) => {
          const next = { ...all };
          const graphs = { ...blueprints };
          Reflect.deleteProperty(next, documentId);
          Reflect.deleteProperty(graphs, documentId);
          return { results: next, blueprints: graphs };
        });
      }
    }),
  ];

  return {
    store,
    async watch(documentId) {
      if (watched.has(documentId)) return;
      watched.add(documentId);
      offer(await connector.analysis.getResults({ documentId }));
    },
    async watchGraph(documentId, graph) {
      const id = key(documentId, graph);
      looking.set(id, (looking.get(id) ?? 0) + 1);
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        const count = (looking.get(id) ?? 1) - 1;
        if (count > 0) looking.set(id, count);
        else {
          looking.delete(id);
          forgetGraph(documentId, graph);
        }
        void connector.analysis.unwatchResults({ documentId, graph }).catch(() => undefined);
      };
      try {
        await connector.analysis.watchResults({ documentId, graph });
        offer(await connector.analysis.getResults({ documentId, graph }));
      } catch (error) {
        stop();
        throw error;
      }
      return stop;
    },
    dispose() {
      for (const stop of stops) stop();
    },
  };
}
