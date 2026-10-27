// The solver engine's TS facade: the only code that knows the solver is WebAssembly.
import init, { irVersion } from "./wasm/solver";

let ready: Promise<unknown> | undefined;

/** Loads the WebAssembly module once; later calls reuse it. */
async function load(): Promise<void> {
  ready ??= init();
  await ready;
}

/** Version of the solver IR the loaded module understands. */
export async function solverIrVersion(): Promise<number> {
  await load();
  return irVersion();
}
