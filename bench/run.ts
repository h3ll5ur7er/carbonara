// `pnpm bench`: measures edit → results (compile, incremental solve, map back) on generated factories the way the
// analysis manager does it (one compiler and one incremental solver per document), with the release WebAssembly
// build, and checks the budgets from docs/Architecture/Solver.md. Exits with 1 when a budget is exceeded.
// `pnpm bench 10k` runs only the scenarios whose name contains "10k".
import { readFileSync } from "node:fs";
import templatePlugin from "../packs/_template/plugin/index";
import type { Document } from "../src/contracts/document";
import type { DocumentCompiler } from "../src/contracts/access";
import { localRuntime } from "../src/engines/compiler";
import { templatePack } from "../src/engines/compiler/template.fixture";
import { createSolver, loadSolver, type IncrementalSolver } from "../src/engines/solver";
import {
  cellsFor,
  editBlueprint,
  editMotor,
  editTarget,
  expandedNodes,
  generateFactory,
  generateSubgraphFactory,
} from "./factories";

interface Scenario {
  name: string;
  factory: Document;
  /** The document after the nth edit. */
  edit: (edit: number) => Document;
  /** Components each edit re-solves. */
  resolves: number;
  /** Median edit → results, in milliseconds. */
  budget?: number;
  edits: number;
}

/** A flat factory of production lines of about `nodesPerLine` nodes; the edit changes one motor's pin. */
function flat(name: string, lines: number, nodesPerLine: number, edits: number, budget?: number): Scenario {
  const cells = cellsFor(nodesPerLine);
  const factory = generateFactory({ lines, cellsPerLine: cells });
  const [line, cell] = [Math.floor(lines / 2), Math.floor(cells / 2)];
  return {
    name,
    factory,
    edit: (edit) => editMotor(factory, line, cell, edit),
    resolves: 1,
    edits,
    ...(budget !== undefined && { budget }),
  };
}

/** Lines of motor cells placed from one blueprint (about 19 nodes per cell once expanded). */
function subgraphs(name: string, lines: number, cells: number, edits: number, budget?: number): Scenario {
  const factory = generateSubgraphFactory({ lines, cellsPerLine: cells });
  const [line, cell] = [Math.floor(lines / 2), Math.floor(cells / 2)];
  return {
    name,
    factory,
    edit: (edit) => editTarget(factory, line, cell, edit),
    resolves: 1,
    edits,
    ...(budget !== undefined && { budget }),
  };
}

const builtFromSubgraphs = subgraphs("50k-node factory built from subgraphs, 100 lines", 100, 26, 20, 50);

const SCENARIOS: Scenario[] = [
  flat("500-node component", 1, 500, 30, 100),
  flat("1k-node factory, 2 components", 2, 500, 30),
  flat("10k-node flat graph, 20 components", 20, 500, 20, 150),
  flat("50k-node flat graph, 100 components", 100, 500, 10),
  builtFromSubgraphs,
  {
    // Every instance's summary changes, so every line re-solves: measured, not budgeted.
    factory: builtFromSubgraphs.factory,
    name: "the same, editing the blueprint",
    edit: (edit) => editBlueprint(builtFromSubgraphs.factory, edit),
    resolves: 100,
    edits: 5,
  },
];

const pack = templatePack();
const plugin = templatePlugin;

/** Edit → results, timed in its three phases (milliseconds). */
interface Timing {
  compile: number;
  /** The WebAssembly call: the model in, the incremental solve, the solution out. */
  solve: number;
  map: number;
  total: number;
  /** CPU time of the whole edit: less sensitive than wall time to other work on a shared machine. */
  cpu: number;
}

/** What the analysis manager does for an edit: compile with the document's compiler, solve, map back. */
async function analyse(
  document: Document,
  compiler: DocumentCompiler,
  solver: IncrementalSolver,
  version: number,
): Promise<Timing> {
  const start = performance.now();
  const cpuAtStart = process.cpuUsage();
  const compiled = await compiler.compile(document);
  const compiledAt = performance.now();
  const outcome = solver.solve(compiled.model);
  if (!outcome.ok) throw new Error(`The generated factory is ${outcome.error}`);
  const solvedAt = performance.now();
  const results = await compiled.results(outcome, version);
  const end = performance.now();
  const error = results.diagnostics.find((diagnostic) => diagnostic.kind === "error");
  if (error) throw new Error(`The generated factory doesn't compile: ${JSON.stringify(error)}`);
  const { user, system } = process.cpuUsage(cpuAtStart);
  const cpu = (user + system) / 1000;
  return { compile: compiledAt - start, solve: solvedAt - compiledAt, map: end - solvedAt, total: end - start, cpu };
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
};
const ms = (value: number) => `${value.toFixed(1)} ms`;

async function measure(scenario: Scenario) {
  const solver = await createSolver();
  try {
    const compiler = localRuntime(pack, plugin).compiler();
    const cold = (await analyse(scenario.factory, compiler, solver, 1)).total;
    const timings: Timing[] = [];
    for (let edit = 1; edit <= scenario.edits; edit++) {
      timings.push(await analyse(scenario.edit(edit), compiler, solver, edit + 1));
      if (solver.lastSolved() !== scenario.resolves) {
        throw new Error(`An edit re-solved ${solver.lastSolved()} components, not ${scenario.resolves}`);
      }
    }
    const phase = (name: keyof Timing) => median(timings.map((timing) => timing[name]));
    const totals = timings.map((timing) => timing.total);
    return {
      cold,
      median: median(totals),
      cpu: median(timings.map((timing) => timing.cpu)),
      p95: percentile(totals, 0.95),
      phases: `${ms(phase("compile"))} / ${ms(phase("solve"))} / ${ms(phase("map"))}`,
    };
  } finally {
    solver.dispose();
  }
}

await loadSolver(readFileSync(new URL("../src/engines/solver/wasm/solver_bg.wasm", import.meta.url)));

let exceeded = false;
console.log(
  "scenario | nodes | first solve | edit → results median | p95 | CPU median | compile / solve / map | budget",
);
const only = process.argv[2];
for (const scenario of SCENARIOS.filter(({ name }) => only === undefined || name.includes(only))) {
  const result = await measure(scenario);
  const over = scenario.budget !== undefined && result.median > scenario.budget;
  exceeded ||= over;
  const budget = scenario.budget === undefined ? "—" : `${ms(scenario.budget)} ${over ? "EXCEEDED" : "ok"}`;
  const nodes = expandedNodes(scenario.factory);
  const columns = [nodes, ms(result.cold), ms(result.median), ms(result.p95), ms(result.cpu), result.phases, budget];
  console.log([scenario.name, ...columns].join(" | "));
}
process.exitCode = exceeded ? 1 : 0;
