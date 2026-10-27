// Analysis manager: the use case "a document changed → solve it → tell the clients". It sequences the
// documents and packs stores, the compiler and the solver; the rules live in those engines.
// Each document gets its own incremental solver, so an edit re-solves only the components it touched.
// Blueprint graphs are solved lazily: when asked for, or after every solve while someone watches them.
import type { DocumentStore, PackStore } from "../contracts/access";
import type { Events, ManagerImplementation } from "../contracts/managers";
import type { Plugin } from "../contracts/plugin";
import type { AnalysisResults } from "../contracts/results";
import { compile, findBlueprint, toResults, type Compiled } from "../engines/compiler";
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
  /** What the latest results were solved from, for blueprint graphs asked for later. */
  solved?: { version: number; compiled: Compiled; plugin: Plugin };
  /** Results of blueprint graphs for the solved version, by graph. */
  graphs: Map<string, AnalysisResults>;
  /** Watched blueprint graphs, with how many watch each. */
  watched: Map<string, number>;
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

  function stateOf(documentId: string): DocumentState {
    let state = states.get(documentId);
    if (!state) states.set(documentId, (state = { dirty: false, graphs: new Map(), watched: new Map() }));
    return state;
  }

  /** Starts the document's analysis loop, or tells the running one to go round again. */
  function schedule(documentId: string): Promise<void> {
    const state = stateOf(documentId);
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
        unsolved(documentId, version, "root", `The pack "${document.pack.id}" isn't installed`),
      );
    const compiled = compile({ document, pack: pack.data, plugin: pack.plugin });
    state.solver ??= await createSolver();
    const results = toResults(compiled, state.solver.solve(compiled.model), pack.plugin, version);
    state.solved = { version, compiled, plugin: pack.plugin };
    state.graphs.clear();
    publish(documentId, state, results);
    for (const graph of state.watched.keys()) {
      const inside = blueprintResults(documentId, state, graph);
      if (inside) bus.publish("resultsChanged", inside);
    }
  }

  /** A blueprint graph's results for the solved version: solved once, when first asked for. */
  function blueprintResults(documentId: string, state: DocumentState, graph: string): AnalysisResults | null {
    const { solved, solver } = state;
    if (!solved || !solver || solved.version !== state.results?.version) return null;
    const known = state.graphs.get(graph);
    if (known) return known;
    const blueprint = findBlueprint(solved.compiled, graph);
    if (!blueprint) return null;
    let results: AnalysisResults;
    try {
      const outcome = solver.expand(solved.compiled.model, blueprint.index);
      results = toResults(blueprint.compiled, outcome, solved.plugin, solved.version);
    } catch (error) {
      console.error(error);
      results = unsolved(documentId, solved.version, graph, internalError(error));
    }
    state.graphs.set(graph, results);
    return results;
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
    publish(documentId, state, unsolved(documentId, version, "root", internalError(error)));
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
      for (;;) {
        const open = documents.get(documentId);
        if (!open) return null;
        const state = states.get(documentId);
        if (state?.running) await state.running;
        else if (state?.results?.version === open.version) {
          return graph === "root" ? state.results : blueprintResults(documentId, state, graph);
        } else await schedule(documentId);
      }
    },
    async watchResults({ documentId, graph }) {
      if (graph === "root" || !documents.get(documentId)) return;
      const { watched } = stateOf(documentId);
      watched.set(graph, (watched.get(graph) ?? 0) + 1);
    },
    async unwatchResults({ documentId, graph }) {
      const watched = states.get(documentId)?.watched;
      const count = watched?.get(graph) ?? 0;
      if (count > 1) watched?.set(graph, count - 1);
      else watched?.delete(graph);
    },
    lastSolved: (documentId) => states.get(documentId)?.solver?.lastSolved(),
  };
}

function internalError(error: unknown): string {
  return `Internal error while solving: ${error instanceof Error ? error.message : String(error)}`;
}

function unsolved(documentId: string, version: number, graph: string, message: string): AnalysisResults {
  return {
    documentId,
    version,
    graph,
    nodes: {},
    edges: {},
    diagnostics: [{ kind: "error", message }],
    totals: { raw: {}, buildings: {} },
  };
}
