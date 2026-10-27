// The solver engine's TS facade: the only code that knows the solver is WebAssembly.
// It hides the LP formulation, the backend, decomposition and caching (docs/Architecture/Solver.md).
// Models and solutions cross into WebAssembly as JSON text: much faster than JS objects for big models. An
// incremental solver sends only what changed since the last model, and gets back only what changed in the solution.
import type { Result } from "../../contracts/result";
import type { Changes, Model, ModelChanges, Solution, SolutionChanges, Unsolvable } from "../../contracts/solver";
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
 * re-summarising only the blueprints that changed (docs/Architecture/Subgraphs.md). Models are immutable: it tells
 * what changed since the last model by identity (nodes, edges, constraints and blueprints), as the compiler keeps
 * the objects of what didn't change. A solution keeps the objects of instances whose numbers didn't change.
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
  /** What the WebAssembly side holds: the last model sent, and the solution it last answered with. */
  let sent: Model = { items: 0, nodes: [], edges: [], constraints: [] };
  let answered: Solution = { activity: [], flow: [], surplus: [], deficit: [], overflow: [], pinMisses: [] };

  /** Brings the WebAssembly side's model up to `model`, then calls it. */
  function call<T>(model: Model, run: (changes: string) => string): T {
    const changes: ModelChanges = {
      items: model.items,
      nodes: changed(sent.nodes, model.nodes),
      edges: changed(sent.edges, model.edges),
      constraints: changed(sent.constraints, model.constraints),
      blueprints: changed(sent.blueprints ?? [], model.blueprints ?? []),
    };
    try {
      const answer = JSON.parse(run(JSON.stringify(changes))) as T;
      sent = model;
      return answer;
    } catch (error) {
      // A bug: start over with the whole model next time rather than trust what either side holds.
      sent = { items: 0, nodes: [], edges: [], constraints: [] };
      answered = { activity: [], flow: [], surplus: [], deficit: [], overflow: [], pinMisses: [] };
      solver.forget();
      throw error;
    }
  }

  return {
    solve(model) {
      const answer = call<Result<SolutionChanges, Unsolvable>>(model, (changes) => solver.solveChanges(changes));
      if (!answer.ok) return answer;
      answered = applied(answered, answer.value);
      return { ok: true, value: answered };
    },
    expand: (model, blueprint) => call<SolveResult>(model, (changes) => solver.expandChanges(changes, blueprint)),
    lastSolved: () => solver.lastSolved(),
    lastSummarised: () => solver.lastSummarised(),
    dispose: () => solver.free(),
  };
}

/** What changed from `before` to `after`, by identity. */
function changed<T>(before: T[], after: T[]): Changes<T> {
  const set: [number, T][] = [];
  after.forEach((element, index) => {
    if (before[index] !== element) set.push([index, element]);
  });
  return { length: after.length, set };
}

/** The solution `changes` were made to: a new solution, which keeps the objects of what didn't change. */
function applied(before: Solution, changes: SolutionChanges): Solution {
  const apply = <T>(list: T[], { length, set }: Changes<T>): T[] => {
    const next = list.slice(0, length);
    for (const [index, element] of set) next[index] = element;
    return next;
  };
  const instances = apply(before.instances ?? [], changes.instances);
  const inlined = changes.inlined ?? before.inlined ?? [];
  return {
    activity: apply(before.activity, changes.activity),
    flow: apply(before.flow, changes.flow),
    surplus: changes.surplus ?? before.surplus,
    deficit: changes.deficit ?? before.deficit,
    overflow: changes.overflow ?? before.overflow,
    pinMisses: changes.pinMisses ?? before.pinMisses,
    ...(instances.length > 0 && { instances }),
    ...(inlined.length > 0 && { inlined }),
  };
}
