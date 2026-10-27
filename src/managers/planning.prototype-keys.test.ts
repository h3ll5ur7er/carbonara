// Ids named after Object.prototype's keys (CARB-83): the planner plans the same factories under the new names, and
// they solve as planned once accepted (their node ids come from those names).
import fc from "fast-check";
import { readFileSync } from "node:fs";
import ELK from "elkjs/lib/elk.bundled.js";
import { beforeAll, describe, expect, it } from "vitest";
import templatePlugin from "../../packs/_template/plugin/index";
import { createMemoryDocumentStore } from "../access/documents/memory";
import { createMemoryProposalStore } from "../access/proposals/memory";
import type { LoadedPack } from "../contracts/access";
import type { Document } from "../contracts/document";
import { DEFAULT_PLAN_OPTIONS, type Events, type PlanOptions, type Proposal } from "../contracts/managers";
import type { Id, PackData } from "../contracts/pack";
import { compile, toResults } from "../engines/compiler";
import {
  type Names,
  namesOf,
  original,
  renameKeys,
  renameNode,
  renamePack,
  renamings,
} from "../engines/compiler/prototype-keys.fixture";
import { waterLoop } from "../engines/compiler/template.fixture";
import { applyCommands, type ResolvedCommand } from "../engines/editing/commands";
import { loadSolver, solve } from "../engines/solver";
import { createEventBus } from "../utilities/events";
import { createPlanningManager } from "./planning";

function loaded(data: PackData): LoadedPack {
  const manifest = { id: "template", name: "Template", version: "1.0.0", engine: "^1", data: "data/", plugin: "p.js" };
  return { info: { manifest, hash: "sha256-template", builtIn: true }, data, plugin: templatePlugin };
}

const empty = (): Document => ({ ...waterLoop(), graph: { nodes: {}, edges: {} } });
const options: PlanOptions = DEFAULT_PLAN_OPTIONS;

async function plan(item: Id, data: PackData): Promise<Proposal> {
  const documents = createMemoryDocumentStore();
  const { id } = documents.put(empty()).document;
  const planning = createPlanningManager({
    documents,
    packs: { get: async () => loaded(data) },
    proposals: createMemoryProposalStore(),
    events: createEventBus<Events>(),
    layout: new ELK(),
  });
  const proposal = await planning.planProduction({
    documentId: id,
    graph: "root",
    targets: [{ item, perSecond: 1 }],
    options,
  });
  if (!proposal.ok) throw new Error(JSON.stringify(proposal.error));
  return proposal.value;
}

/** A proposal as the renamed pack should make it: its summary, and the nodes it adds (their ids are made up). */
function planned(proposal: Proposal, to?: Names) {
  const { buildings, raw, byproducts, shortfalls, powerMW } = proposal.summary;
  const same = (id: string) => id;
  const nodes = proposal.commands.flatMap((command) => (command.type === "addNode" ? [command.node] : []));
  return {
    summary: {
      buildings: renameKeys(buildings, to?.building ?? same),
      raw: renameKeys(raw, to?.item ?? same),
      byproducts: renameKeys(byproducts, to?.item ?? same),
      shortfalls: renameKeys(shortfalls, to?.item ?? same),
      powerMW,
    },
    nodes: expect.arrayContaining(to ? nodes.map((node) => renameNode(node, to)) : nodes),
  };
}

/** The proposal accepted into an empty document, solved. */
async function accept(proposal: Proposal, data: PackData) {
  const applied = applyCommands(empty(), proposal.commands as ResolvedCommand[]);
  if (!applied.ok) throw new Error(JSON.stringify(applied.error));
  const compiled = compile({ document: applied.value.document, pack: data, plugin: templatePlugin });
  return toResults(compiled, await solve(compiled.model), templatePlugin, 1);
}

beforeAll(async () => {
  await loadSolver(readFileSync(new URL("../engines/solver/wasm/solver_bg.wasm", import.meta.url)));
});

describe("planning with ids named after Object.prototype's keys", () => {
  it("plans the same factories under the new names, which solve as planned", async () => {
    const targets = ["iron-plate", "motor", "concrete"];
    const expected = await Promise.all(targets.map((item) => plan(item, original)));
    await fc.assert(
      fc.asyncProperty(renamings, async (renaming) => {
        const to = namesOf(renaming);
        const pack = renamePack(original, to);
        for (const [index, item] of targets.entries()) {
          const proposal = await plan(to.item(item), pack);
          expect(planned(proposal)).toEqual(planned(expected[index] as Proposal, to));
          const results = await accept(proposal, pack);
          expect(results.diagnostics.filter((diagnostic) => diagnostic.kind !== "surplus")).toEqual([]);
          expect(results.totals.buildings).toEqual(proposal.summary.buildings);
        }
      }),
      { numRuns: 30 },
    );
    // Each run plans, lays out with ELK and solves three factories: about 4 s alone, more on a loaded runner.
  }, 30_000);
});
