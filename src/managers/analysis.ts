// Analysis manager: the use case "a document changed → solve it → tell the clients". It sequences the
// documents and packs stores, the compiler and the solver; the rules live in those engines.
// Each document gets its own incremental solver, so an edit re-solves only the components it touched.
import type { DocumentStore, PackStore } from "../contracts/access";
import type { Events, ManagerImplementation } from "../contracts/managers";
import type { AnalysisResults } from "../contracts/results";
import { runtimeOf } from "../engines/compiler";
import { createSolver, type IncrementalSolver } from "../engines/solver";
import type { EventBus } from "../utilities/events";

export interface AnalysisDependencies {
  bus: EventBus<Events>;
  documents: Pick<DocumentStore, "get">;
  packs: Pick<PackStore, "get">;
}

interface DocumentState {
  solver?: IncrementalSolver;
  results?: AnalysisResults;
  /** The analysis loop, while it runs. */
  running?: Promise<void>;
  /** Another change arrived since the loop last read the document. */
  dirty: boolean;
}

export type AnalysisManager = ManagerImplementation<"analysis"> & {
  /** Components the last solve of a document had to solve (the rest came from its cache). */
  lastSolved(documentId: string): number | undefined;
};

export function createAnalysisManager({ bus, documents, packs }: AnalysisDependencies): AnalysisManager {
  const states = new Map<string, DocumentState>();

  /** Starts the document's analysis loop, or tells the running one to go round again. */
  function schedule(documentId: string): Promise<void> {
    let state = states.get(documentId);
    if (!state) states.set(documentId, (state = { dirty: false }));
    state.dirty = true;
    state.running ??= run(documentId, state);
    return state.running;
  }

  // One solve at a time per document; edits that arrive meanwhile collapse into one more round.
  async function run(documentId: string, state: DocumentState): Promise<void> {
    try {
      while (state.dirty) {
        state.dirty = false;
        await analyse(documentId, state).catch((error: unknown) => failed(documentId, state, error));
      }
    } finally {
      delete state.running;
    }
  }

  async function analyse(documentId: string, state: DocumentState): Promise<void> {
    const open = documents.get(documentId);
    if (!open) return forget(documentId);
    const { document, version } = open;
    const pack = await packs.get(document.pack.id);
    const current = documents.get(documentId)?.version;
    if (current !== version) return; // stale: the loop goes round again for the newer version

    if (!pack)
      return publish(
        documentId,
        state,
        unsolved(documentId, version, `The pack "${document.pack.id}" isn't installed`),
      );
    // Built-in plugins compile right here; third-party ones in their sandbox, in one round trip.
    const compiled = await runtimeOf(pack).compile(document);
    state.solver ??= await createSolver();
    publish(documentId, state, await compiled.results(state.solver.solve(compiled.model), version));
  }

  function publish(documentId: string, state: DocumentState, results: AnalysisResults) {
    if (states.get(documentId) !== state) return; // closed meanwhile
    state.results = results;
    bus.publish("resultsChanged", results);
  }

  /** A bug in an engine: show it on the document instead of leaving the old numbers up. */
  function failed(documentId: string, state: DocumentState, error: unknown) {
    console.error(error);
    const version = documents.get(documentId)?.version;
    if (version === undefined) return;
    const message = `Internal error while solving: ${error instanceof Error ? error.message : String(error)}`;
    publish(documentId, state, unsolved(documentId, version, message));
  }

  function forget(documentId: string) {
    states.get(documentId)?.solver?.dispose();
    states.delete(documentId);
  }

  bus.subscribe("documentChanged", ({ documentId }) => void schedule(documentId));
  bus.subscribe("documentsChanged", ({ documents: open }) => {
    const ids = new Set(open.map((info) => info.id));
    for (const documentId of states.keys()) if (!ids.has(documentId)) forget(documentId);
  });

  return {
    async getResults({ documentId, graph }) {
      // Blueprints are solved with subgraphs (Wave 2).
      if (graph !== "root") return null;
      for (;;) {
        const open = documents.get(documentId);
        if (!open) return null;
        const state = states.get(documentId);
        if (state?.running) await state.running;
        else if (state?.results?.version === open.version) return state.results;
        else await schedule(documentId);
      }
    },
    lastSolved: (documentId) => states.get(documentId)?.solver?.lastSolved(),
  };
}

function unsolved(documentId: string, version: number, message: string): AnalysisResults {
  return {
    documentId,
    version,
    graph: "root",
    nodes: {},
    edges: {},
    diagnostics: [{ kind: "error", message }],
    totals: { raw: {}, buildings: {} },
  };
}
