// The solver engine's TS facade: the only code that knows the solver is WebAssembly.
// It hides the LP formulation, the backend, decomposition and caching (docs/Architecture/Solver.md).
// Models and solutions cross into WebAssembly as JSON text: much faster than JS objects for big models.
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
  validate(JSON.stringify(model));
}

export type SolveResult = Result<Solution, Unsolvable>;

/** Solves a model from scratch. Throws on inconsistent models, which are compiler bugs. */
export async function solve(model: Model): Promise<SolveResult> {
  await loadSolver();
  return JSON.parse(solveModel(JSON.stringify(model))) as SolveResult;
}

/**
 * Solves one document's models one after another, re-solving only the components that changed and
 * re-summarising only the blueprints that changed (docs/Architecture/Subgraphs.md).
 */
export interface IncrementalSolver {
  /** Throws on inconsistent models, which are compiler bugs. */
  solve(model: Model): SolveResult;
  /**
   * The inside of the instances of `model.blueprints[blueprint]`, solved for the boundary flows they get
   * in the model's solution (all instances together; the blueprint as designed when it has none). Indices
   * are the blueprint's. Reuses the model's cached solution.
   */
  expand(model: Model, blueprint: number): SolveResult;
  /** Components the last solve had to solve; the others came from the cache. */
  lastSolved(): number;
  /** Blueprint summaries the last solve had to compute; the others came from the cache. */
  lastSummarised(): number;
  /** Frees the caches held in WebAssembly memory. */
  dispose(): void;
}

export async function createSolver(): Promise<IncrementalSolver> {
  await loadSolver();
  const solver = new Solver();
  return {
    solve: (model) => JSON.parse(solver.solve(JSON.stringify(model))) as SolveResult,
    expand: (model, blueprint) => JSON.parse(solver.expand(JSON.stringify(model), blueprint)) as SolveResult,
    lastSolved: () => solver.lastSolved(),
    lastSummarised: () => solver.lastSummarised(),
    dispose: () => solver.free(),
  };
}
