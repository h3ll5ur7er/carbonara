// The messages between the backend and a third-party pack's plugin sandbox (docs/Architecture/Plugins.md,
// Isolation and trust). Narrow on purpose: the sandbox loads one plugin, compiles documents with it, maps solutions
// back, describes the plugin and says which recipes it rules out. Nothing else crosses, and the backend treats every answer as untrusted.
import type { Document } from "../../contracts/document";
import type { PackData } from "../../contracts/pack";
import type { Result } from "../../contracts/result";
import type { Model, Solution, Unsolvable } from "../../contracts/solver";

export type SandboxCall =
  /** Loads the plugin from its module source; answers with the plugin's id. */
  | { call: "load"; source: string; data: PackData }
  /** Compiles a document; the sandbox keeps what `results` needs under the answered `compileId`. */
  | { call: "compile"; document: Document }
  /** Maps the solver's answer for a compile back to results; the compile is forgotten afterwards. */
  | { call: "results"; compileId: number; outcome: Result<Solution, Unsolvable>; version: number }
  | { call: "describe"; settings: Record<string, unknown> }
  /** The recipes the plugin rules out under these settings. */
  | { call: "unavailable"; settings: Record<string, unknown> };

export type SandboxRequest = SandboxCall & { id: number };

export type SandboxReply = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };

export interface CompileAnswer {
  compileId: number;
  model: Model;
  /** The model's items by index. */
  items: string[];
}
