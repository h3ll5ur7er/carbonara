// `pnpm bench`: measures edit → results (compile, incremental solve, map back) on generated factories,
// with the release WebAssembly build, and checks the budgets from docs/Architecture/Solver.md.
// Exits with 1 when a budget is exceeded.
import { readFileSync } from "node:fs";
import templatePlugin from "../packs/_template/plugin/index";
import type { Document } from "../src/contracts/document";
import { compile, toResults } from "../src/engines/compiler";
import { templatePack } from "../src/engines/compiler/template.fixture";
import { createSolver, loadSolver, type IncrementalSolver } from "../src/engines/solver";
import { cellsFor, editMotor, generateFactory } from "./factories";

interface Scenario {
  name: string;
  lines: number;
  nodesPerLine: number;
  /** Median edit → results, in milliseconds. */
  budget?: number;
  edits: number;
}

const SCENARIOS: Scenario[] = [
  { name: "500-node component", lines: 1, nodesPerLine: 500, budget: 16, edits: 30 },
  { name: "1k-node factory, 2 components", lines: 2, nodesPerLine: 500, edits: 30 },
  { name: "10k-node flat graph, 20 components", lines: 20, nodesPerLine: 500, budget: 150, edits: 20 },
  // The 50k budget is for factories built from subgraphs (Wave 2); a flat one is measured for reference.
  { name: "50k-node flat graph, 100 components", lines: 100, nodesPerLine: 500, edits: 10 },
];

const pack = templatePack();
const plugin = templatePlugin;

function analyse(document: Document, solver: IncrementalSolver, version: number) {
  const compiled = compile({ document, pack, plugin });
  if (compiled.diagnostics.length > 0) {
    throw new Error(`The generated factory doesn't compile: ${JSON.stringify(compiled.diagnostics[0])}`);
  }
  const outcome = solver.solve(compiled.model);
  if (!outcome.ok) throw new Error(`The generated factory is ${outcome.error}`);
  return toResults(compiled, outcome, plugin, version);
}

function time(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
const ms = (value: number) => `${value.toFixed(1)} ms`;

async function measure(scenario: Scenario) {
  const cells = cellsFor(scenario.nodesPerLine);
  const document = generateFactory({ lines: scenario.lines, cellsPerLine: cells });
  const nodes = Object.keys(document.graph.nodes).length;
  const solver = await createSolver();
  try {
    const cold = time(() => analyse(document, solver, 1));
    const line = Math.floor(scenario.lines / 2);
    const cell = Math.floor(cells / 2);
    const times: number[] = [];
    for (let edit = 1; edit <= scenario.edits; edit++) {
      const edited = editMotor(document, line, cell, edit);
      times.push(time(() => analyse(edited, solver, edit + 1)));
      if (solver.lastSolved() !== 1) throw new Error(`An edit re-solved ${solver.lastSolved()} components, not 1`);
    }
    times.sort((a, b) => a - b);
    return { nodes, cold, median: percentile(times, 0.5), p95: percentile(times, 0.95) };
  } finally {
    solver.dispose();
  }
}

await loadSolver(readFileSync(new URL("../src/engines/solver/wasm/solver_bg.wasm", import.meta.url)));

let exceeded = false;
console.log("scenario | nodes | first solve | edit → results median | p95 | budget");
for (const scenario of SCENARIOS) {
  const result = await measure(scenario);
  const over = scenario.budget !== undefined && result.median > scenario.budget;
  exceeded ||= over;
  const budget = scenario.budget === undefined ? "—" : `${ms(scenario.budget)} ${over ? "EXCEEDED" : "ok"}`;
  console.log([scenario.name, result.nodes, ms(result.cold), ms(result.median), ms(result.p95), budget].join(" | "));
}
process.exitCode = exceeded ? 1 : 0;
