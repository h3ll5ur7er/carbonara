// The messages between the backend and a third-party pack's plugin sandbox (docs/Architecture/Plugins.md,
// Isolation and trust). Narrow on purpose: the sandbox loads one plugin, compiles documents with it, maps solutions
// back (the document's graph and its blueprints' insides) and describes the plugin. Nothing else crosses, and the backend treats every answer as untrusted.
import type { Document } from "../../contracts/document";
import type { PackData } from "../../contracts/pack";
import type { Result } from "../../contracts/result";
import type { Model, Solution, Unsolvable } from "../../contracts/solver";

export type SandboxCall =
  /** Loads the plugin from its module source; answers with the plugin's id. */
  | { call: "load"; source: string; data: PackData }
  /** Compiles a document; the sandbox keeps what `results` needs under the answered `compileId`. */
  | { call: "compile"; document: Document }
  /** Maps the solver's answer for a compile back to results. The latest compile of each document is kept. */
  | { call: "results"; compileId: number; outcome: Result<Solution, Unsolvable>; version: number }
  /** Maps the solve of a blueprint's inside (for the same compile) back to that blueprint's graph. */
  | {
      call: "blueprintResults";
      compileId: number;
      graph: string;
      outcome: Result<Solution, Unsolvable>;
      version: number;
    }
  | { call: "describe"; settings: Record<string, unknown> };

export type SandboxRequest = SandboxCall & { id: number };

export type SandboxReply = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };

export interface CompileAnswer {
  compileId: number;
  model: Model;
  /** The blueprint graphs that can be expanded: their index in `model.blueprints`, by blueprint id. */
  blueprints: Record<string, number>;
}
