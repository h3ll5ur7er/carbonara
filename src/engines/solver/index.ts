// The solver engine's TS facade: the only code that knows the solver is WebAssembly.
// It hides the LP formulation, the backend, decomposition and caching (docs/Architecture/Solver.md).
import type { Result } from "../../contracts/result";
import type { Model, Solution, Unsolvable } from "../../contracts/solver";
import init, { irVersion, solve as solveModel, Solver, validateModel as validate } from "./wasm/solver";

let ready: Promise<unknown> | undefined;

/**
 * Loads the WebAssembly module once; later calls reuse it. Browsers fetch it next to this file;
 * Node (tests, the pack CLI, the benchmarks) passes the module's bytes.
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

export type SolveResult = Result<Solution, Unsolvable>;

/** Solves a model from scratch. Throws on inconsistent models, which are compiler bugs. */
export async function solve(model: Model): Promise<SolveResult> {
  await loadSolver();
  return solveModel(model) as SolveResult;
}

/** Solves one document's models one after another, re-solving only the components that changed. */
export interface IncrementalSolver {
  /** Throws on inconsistent models, which are compiler bugs. */
  solve(model: Model): SolveResult;
  /** Components the last solve had to solve; the others came from the cache. */
  lastSolved(): number;
  /** Frees the cache held in WebAssembly memory. */
  dispose(): void;
}

export async function createSolver(): Promise<IncrementalSolver> {
  await loadSolver();
  const solver = new Solver();
  return {
    solve: (model) => solver.solve(model) as SolveResult,
    lastSolved: () => solver.lastSolved(),
    dispose: () => solver.free(),
  };
}
