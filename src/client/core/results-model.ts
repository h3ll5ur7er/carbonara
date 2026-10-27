// The latest solve results of the documents the client shows, per document (root graph only for now;
// blueprint graphs join with subgraphs). Fed by `resultsChanged`, seeded by `analysis.getResults`.
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Backend, Events } from "../../contracts/managers";
import type { AnalysisResults } from "../../contracts/results";
import type { Subscribable } from "../../utilities/rpc";

export interface ResultsState {
  results: Record<string, AnalysisResults>;
}

export type ResultsConnector = { analysis: Pick<Backend["analysis"], "getResults"> } & Pick<Subscribable<Events>, "on">;

export interface ResultsModel {
  store: StoreApi<ResultsState>;
  /** Loads the document's latest results and follows them until the document closes. */
  watch(documentId: string): Promise<void>;
  dispose(): void;
}

export function createResultsModel(connector: ResultsConnector): ResultsModel {
  const store = createStore<ResultsState>(() => ({ results: {} }));
  const watched = new Set<string>();

  /** Keeps whichever results belong to the newer document version. */
  function offer(results: AnalysisResults | null): void {
    if (!results || results.graph !== "root" || !watched.has(results.documentId)) return;
    const current = store.getState().results[results.documentId];
    if (current && current.version >= results.version) return;
    store.setState(({ results: all }) => ({ results: { ...all, [results.documentId]: results } }));
  }

  const stops = [
    connector.on("resultsChanged", offer),
    connector.on("documentsChanged", ({ documents }) => {
      const open = new Set(documents.map((document) => document.id));
      for (const documentId of [...watched]) {
        if (open.has(documentId)) continue;
        watched.delete(documentId);
        store.setState(({ results: all }) => {
          const next = { ...all };
          Reflect.deleteProperty(next, documentId);
          return { results: next };
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
    dispose() {
      for (const stop of stops) stop();
    },
  };
}
