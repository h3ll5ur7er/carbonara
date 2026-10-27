// The analysis manager with a plugin that uses every compile hook: each hook changes the solve as it should.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { LoadedPack, OpenDocument } from "../contracts/access";
import type { Document } from "../contracts/document";
import type { Events } from "../contracts/managers";
import { PackManifest } from "../contracts/pack";
import { fixturePlugin, smeltingWith } from "../engines/compiler/hooks.fixture";
import { templatePack } from "../engines/compiler/template.fixture";
import { loadSolver } from "../engines/solver";
import { createEventBus } from "../utilities/events";
import { createAnalysisManager } from "./analysis";

const pack: LoadedPack = {
  info: {
    manifest: PackManifest.parse({
      id: "template",
      name: "Template Works",
      version: "1.0.0",
      engine: "^1",
      plugin: "p.js",
    }),
    hash: "sha256-template",
    builtIn: true,
  },
  data: templatePack(),
  plugin: fixturePlugin,
};

async function solve(document: Document) {
  const open = new Map<string, OpenDocument>([[document.id, { document, version: 1 }]]);
  const analysis = createAnalysisManager({
    bus: createEventBus<Events>(),
    documents: { get: (documentId) => open.get(documentId) },
    packs: { get: async () => pack },
  });
  const results = await analysis.getResults({ documentId: document.id, graph: "root" });
  if (!results) throw new Error("no results");
  return results;
}

beforeAll(async () => {
  await loadSolver(readFileSync(new URL("../engines/solver/wasm/solver_bg.wasm", import.meta.url)));
});

describe("solving with a plugin's hooks", () => {
  it("runs nodes at the speed their fields ask for, defaults included", async () => {
    // One iron plate per second: three furnaces at the default 100 %, two at 150 %.
    expect((await solve(smeltingWith({}))).nodes.smelt?.activity).toBeCloseTo(3, 9);
    expect((await solve(smeltingWith({ fields: { speed: 150 } }))).nodes.smelt?.activity).toBeCloseTo(2, 9);
  });

  it("meets the plugin's constraints even when that leaves a target short", async () => {
    // Boosted furnaces make twice as much: 1.5 of them would do, but only one booster is available.
    const unconstrained = await solve(smeltingWith({ fields: { boosted: true } }, { boosters: 5 }));
    expect(unconstrained.nodes.smelt?.activity).toBeCloseTo(1.5, 9);
    const constrained = await solve(smeltingWith({ fields: { boosted: true } }, { boosters: 1 }));
    // Slacks hold to about 1e-8 (docs/Architecture/Solver.md).
    expect(constrained.nodes.smelt?.activity).toBeCloseTo(1, 6);
    expect(constrained.diagnostics).toContainEqual({
      kind: "deficit",
      node: "plates",
      item: "iron-plate",
      perSecond: expect.closeTo(1 / 3, 6),
    });
  });

  it("reports the plugin's warnings and locked recipes with the results", async () => {
    const results = await solve(smeltingWith({ recipe: "iron-plate-from-ore", fields: { mode: "eager", speed: 50 } }));
    expect(results.diagnostics).toEqual(
      expect.arrayContaining([
        { kind: "warning", node: "smelt", message: "Iron Plate (Coal Smelting) isn't unlocked" },
        { kind: "warning", node: "smelt", message: "Eager furnaces want at least 100 %" },
      ]),
    );
  });

  it("gives recipe nodes the plugin's derived metrics", async () => {
    // Three furnaces of 0.5 MW at 100 %.
    expect((await solve(smeltingWith({}))).nodes.smelt?.derived).toEqual({ power: expect.closeTo(1.5, 9) });
  });
});
