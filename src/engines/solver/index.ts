// The solver engine's TS facade: the only code that knows the solver is WebAssembly.
import type { Model } from "../../contracts/solver";
import init, { irVersion, validateModel as validate } from "./wasm/solver";

let ready: Promise<unknown> | undefined;

/**
 * Loads the WebAssembly module once; later calls reuse it. Browsers fetch it next to this file;
 * Node (tests, the pack CLI) passes the module's bytes.
 */
export async function loadSolver(bytes?: BufferSource): Promise<void> {
  ready ??= bytes ? init({ module_or_path: bytes }) : init();
  await ready;
}

/** Version of the solver IR the loaded module understands. */
export async function solverIrVersion(): Promise<number> {
  await loadSolver();
  return irVersion();
}

/** Throws when the model doesn't match the IR or isn't internally consistent (a compiler bug). */
export async function validateModel(model: Model): Promise<void> {
  await loadSolver();
  validate(model);
}
