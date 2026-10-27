// What the analysis manager tells clients about a solved document. All rates are items per second.
import type { LocalId } from "./document";
import type { Id } from "./pack";

export interface NodeResult {
  /** Machine count for recipe nodes, items per second for sources and sinks. */
  activity: number;
  inputs: Record<Id, number>;
  outputs: Record<Id, number>;
  /** Metrics computed by the pack plugin after solving, such as power in MW. */
  derived?: Record<string, number>;
}

export interface EdgeResult {
  perSecond: number;
  /** Capacity of the edge's belt or pipe, when it has one. */
  capacity?: number;
}

export type Diagnostic =
  | { kind: "deficit" | "surplus"; node: LocalId; item: Id; perSecond: number }
  | { kind: "overflow"; edge: LocalId; perSecond: number }
  | { kind: "pinMiss"; node: LocalId; difference: number }
  | { kind: "error"; message: string; node?: LocalId };

export interface Totals {
  /** Net raw inputs taken from sources, by item. */
  raw: Record<Id, number>;
  /** Buildings by building id (machine counts rounded up per node). */
  buildings: Record<Id, number>;
}

export interface AnalysisResults {
  documentId: string;
  /** The document version these results belong to; older results are stale. */
  version: number;
  /** `root` or a blueprint id. */
  graph: string;
  nodes: Record<LocalId, NodeResult>;
  edges: Record<LocalId, EdgeResult>;
  diagnostics: Diagnostic[];
  totals: Totals;
}
