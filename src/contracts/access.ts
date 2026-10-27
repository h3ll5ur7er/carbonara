// What managers need from the access components that more than one manager uses.
// Each access component implements its interface; managers get it injected by the composition root.
import type { Document } from "./document";
import type { DocumentInfo, PackInfo, Proposal, ProposalStatus } from "./managers";
import type { PackData } from "./pack";
import type { Plugin, PluginDescription } from "./plugin";
import type { Result } from "./result";
import type { AnalysisResults } from "./results";
import type { Model, Solution, Unsolvable } from "./solver";

export interface OpenDocument {
  document: Document;
  /** Increases by one with every change. */
  version: number;
}

/** How an open document is listed to clients. */
export function documentInfo({ document, version }: OpenDocument): DocumentInfo {
  return { id: document.id, name: document.name, packId: document.pack.id, version };
}

/**
 * The documents open in this session (documents access). The editing and workspace managers change them;
 * the analysis manager only reads. The web store autosaves every change, so open documents survive a reload.
 */
export interface DocumentStore {
  list(): DocumentInfo[];
  get(documentId: string): OpenDocument | undefined;
  /** Stores a new or changed document and returns it with its new version. */
  put(document: Document): OpenDocument;
  remove(documentId: string): void;
}

/**
 * A pack ready to use: its data and its plugin, loaded. Built-in packs are trusted: their plugin is called right
 * here. A third-party pack's plugin runs isolated (the opaque-origin plugin sandbox, docs/Architecture/Plugins.md),
 * so only its runtime is at hand.
 */
export type LoadedPack = { info: PackInfo; data: PackData } & (
  { plugin: Plugin; isolated?: undefined } | { plugin?: undefined; isolated: PluginRuntime }
);

/** The compiler engine with a pack's plugin, run wherever that plugin lives. */
export interface PluginRuntime {
  /** Compiles the document into the solver IR (one round trip when the plugin is isolated). */
  compile(document: Document): Promise<CompiledModel>;
  /** The plugin's fields, settings and metrics under these document settings (`settings.plugin`). */
  describe(settings: Record<string, unknown>): Promise<PluginDescription>;
  /** Stops an isolated plugin; the runtime can't be used afterwards. */
  dispose?(): void;
}

export interface CompiledModel {
  model: Model;
  /** Maps the solver's answer back to the document, with the plugin's derived metrics. */
  results(outcome: Result<Solution, Unsolvable>, version: number): Promise<AnalysisResults>;
  /** The blueprint graphs that can be expanded: their index in `model.blueprints`, by blueprint id. */
  blueprints: Record<string, number>;
  /** Maps the solve of a blueprint's inside (`IncrementalSolver.expand`) back to that blueprint's graph. */
  blueprintResults(graph: string, outcome: Result<Solution, Unsolvable>, version: number): Promise<AnalysisResults>;
}

/**
 * The proposals made in this session and where each stands (proposals access). The planning manager makes,
 * replaces and discards them; the editing manager accepts them. Closing a document drops its proposals.
 */
export interface ProposalStore {
  /** Stores a new, pending proposal under the next free id. */
  add(proposal: Omit<Proposal, "id">): Proposal;
  get(proposalId: string): { proposal: Proposal; status: ProposalStatus } | undefined;
  settle(proposalId: string, status: Exclude<ProposalStatus, "pending">): void;
  /** The document's pending proposals, oldest first. */
  pending(documentId: string): Proposal[];
  /** Forgets the proposals of documents that aren't open any more. */
  keepOnly(documentIds: ReadonlySet<string>): void;
}

/** Built-in and installed packs (packs access). Installing and removing come with CARB-25 and CARB-27. */
export interface PackStore {
  list(): Promise<PackInfo[]>;
  get(packId: string): Promise<LoadedPack | undefined>;
}
