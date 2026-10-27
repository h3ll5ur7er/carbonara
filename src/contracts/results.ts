// What the analysis manager tells clients about a solved document. All rates are items per second.
import type { LocalId } from "./document";
import type { Id } from "./pack";

export interface NodeResult {
  /**
   * Machine count for recipe nodes, items per second for sources and sinks; for instances, how many times
   * they run their blueprint as designed (by its pins; 0 for a blueprint without pins).
   */
  activity: number;
  inputs: Record<Id, number>;
  outputs: Record<Id, number>;
  /** Metrics computed by the pack plugin after solving, such as power in MW. */
  derived?: Record<string, number>;
}

/** The items a recipe node takes and makes as its effective recipe has them: amounts above zero, in its order. */
export interface NodeItems {
  in: Id[];
  out: Id[];
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
  /** Errors leave something out of the solve; warnings (e.g. from the pack's plugin) don't. */
  | { kind: "error" | "warning"; message: string; node?: LocalId }
  /** Not a problem with the plan: advice, such as how to make a blueprint solve faster. */
  | { kind: "hint"; message: string; node?: LocalId };

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
  /**
   * Recipe nodes whose effective recipe (after the pack plugin's `effectiveRecipe`) takes or makes other items than
   * the pack's recipe, such as the fuel a furnace burns: the items it does use. The canvas draws these nodes' ports
   * from them, every other recipe node's from the pack's recipe. Left out when no node differs; there even when
   * nothing could be solved.
   */
  effectiveItems?: Record<LocalId, NodeItems>;
}
