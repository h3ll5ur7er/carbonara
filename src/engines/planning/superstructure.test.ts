import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import templatePlugin from "../../../packs/_template/plugin/index";
import { CURRENT_DOCUMENT_VERSION, type Document } from "../../contracts/document";
import { PlanOptions, type PlanTarget } from "../../contracts/managers";
import { PackData } from "../../contracts/pack";
import type { Plugin } from "../../contracts/plugin";
import { buildSuperstructure, type Superstructure } from "./superstructure";

/** The template pack's data; its files hold different sections, so merging them is a plain spread. */
const folder = new URL("../../../packs/_template/data/", import.meta.url);
const pack = PackData.parse(
  Object.assign({}, ...readdirSync(folder).map((name) => parse(readFileSync(new URL(name, folder), "utf8")) as object)),
);

const empty: Document = {
  format: "carbonara",
  version: CURRENT_DOCUMENT_VERSION,
  id: "doc",
  name: "Plan",
  pack: { id: "template", version: "1.0.0", hash: "sha256-template" },
  graph: { nodes: {}, edges: {} },
  blueprints: {},
  layout: {},
  settings: { plugin: { save: "early game" } },
};

function build(targets: PlanTarget[], options: Partial<PlanOptions> = {}, plugin: Plugin = templatePlugin) {
  const result = buildSuperstructure({
    document: empty,
    pack,
    plugin,
    targets,
    options: PlanOptions.parse(options),
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const recipesOf = (built: Superstructure) =>
  Object.values(built.roles)
    .flatMap((role) => (role.kind === "recipe" ? [role.recipe] : []))
    .sort();
const rawOf = (built: Superstructure) =>
  Object.values(built.roles)
    .flatMap((role) => (role.kind === "raw" ? [role.item] : []))
    .sort();

describe("the superstructure", () => {
  it("holds every allowed recipe upstream of the targets, and nothing downstream of them", () => {
    const built = build([{ item: "iron-plate", perSecond: 1 }]);
    // Coal is made from sludge, which the washer's water loop makes: all of it can feed iron plates.
    expect(recipesOf(built)).toEqual([
      "dry-sludge",
      "iron-plate",
      "iron-plate-from-ore",
      "purify-water",
      "wash-ferrite",
    ]);
  });

  it("supplies the pack's resources and the items nothing makes as raw inputs", () => {
    const built = build([{ item: "iron-plate", perSecond: 1 }]);
    expect(rawOf(built)).toEqual(["coal", "ferrite-ore", "water"]);
  });

  it("limits raw inputs to the map's limits, in items per second", () => {
    const built = build([{ item: "iron-plate", perSecond: 1 }]);
    const ore = Object.entries(built.roles).find(([, role]) => role.kind === "raw" && role.item === "ferrite-ore");
    expect(built.document.graph.nodes[ore?.[0] ?? ""]).toEqual({
      kind: "source",
      item: "ferrite-ore",
      maxPerSecond: 500,
    });
  });

  it("asks for each target item once, with the rates added up", () => {
    const built = build([
      { item: "iron-gear", perSecond: 1 },
      { item: "iron-gear", perSecond: 0.5 },
    ]);
    const targets = Object.entries(built.document.graph.nodes).filter(([id]) => built.roles[id]?.kind === "target");
    expect(targets.map(([, node]) => node)).toEqual([{ kind: "sink", item: "iron-gear", targetPerSecond: 1.5 }]);
    expect(built.targets).toEqual([{ item: "iron-gear", perSecond: 1.5 }]);
  });

  it("joins every producer and consumer of an item through one hub, cycles included", () => {
    const built = build([{ item: "iron-plate", perSecond: 1 }]);
    const { nodes, edges } = built.document.graph;
    const hub = Object.entries(built.roles).find(([, role]) => role.kind === "hub" && role.item === "water")?.[0];
    expect(hub && nodes[hub]).toEqual({ kind: "junction" });
    const into = Object.values(edges).filter((edge) => edge.to === hub);
    const out = Object.values(edges).filter((edge) => edge.from === hub);
    const roleOf = (id: string) => built.roles[id];
    expect(into.map((edge) => roleOf(edge.from))).toEqual(
      expect.arrayContaining([
        { kind: "raw", item: "water" },
        { kind: "recipe", recipe: "purify-water" },
      ]),
    );
    expect(out.map((edge) => roleOf(edge.to))).toEqual([
      { kind: "recipe", recipe: "wash-ferrite" },
      { kind: "spill", item: "water" },
    ]);
    expect([...into, ...out].every((edge) => edge.item === "water")).toBe(true);
  });

  it("spills every item a recipe makes into a free output, byproducts included", () => {
    const built = build([{ item: "iron-plate", perSecond: 1 }]);
    const spills = Object.entries(built.roles).filter(([, role]) => role.kind === "spill");
    expect(spills.map(([, role]) => role.kind === "spill" && role.item).sort()).toEqual([
      "clean-ferrite",
      "coal",
      "dirty-water",
      "iron-plate",
      "sludge",
      "water",
    ]);
    for (const [id, role] of spills) {
      expect(built.document.graph.nodes[id]).toEqual({ kind: "sink", item: role.kind === "spill" && role.item });
    }
  });

  it("makes the targets only with the recipe it's asked to, never from a raw source", () => {
    const built = buildSuperstructure({
      document: empty,
      pack,
      plugin: templatePlugin,
      targets: [{ item: "coal", perSecond: 1 }],
      options: PlanOptions.parse({}),
      via: "dry-sludge",
    });
    if (!built.ok) throw new Error("expected a superstructure");
    expect(recipesOf(built.value)).toEqual(["dry-sludge", "purify-water", "wash-ferrite"]);
    expect(rawOf(built.value)).toEqual(["ferrite-ore", "water"]);
  });

  it("leaves out alternates when asked, and excluded recipes", () => {
    expect(recipesOf(build([{ item: "iron-plate", perSecond: 1 }], { alternates: false }))).not.toContain(
      "iron-plate-from-ore",
    );
    const without = build([{ item: "iron-plate", perSecond: 1 }], { exclude: ["iron-plate"] });
    expect(recipesOf(without)).toEqual(["dry-sludge", "iron-plate-from-ore", "purify-water", "wash-ferrite"]);
  });

  it("makes an item raw when no allowed recipe makes it", () => {
    const built = build([{ item: "iron-plate", perSecond: 1 }], { alternates: false, exclude: ["iron-plate"] });
    expect(recipesOf(built)).toEqual([]);
    expect(rawOf(built)).toEqual(["iron-plate"]);
  });

  it("asks the pack's plugin which recipes are available, with the document's settings", () => {
    const seen: unknown[] = [];
    const plugin: Plugin = {
      id: "template",
      recipeAvailable: (recipe, context) => {
        seen.push(context.settings);
        return recipe.id !== "wash-ferrite";
      },
    };
    const built = build([{ item: "iron-plate", perSecond: 1 }], {}, plugin);
    expect(recipesOf(built)).not.toContain("wash-ferrite");
    expect(seen[0]).toEqual({ save: "early game" });
  });

  it("keeps the document's id, pack and plugin settings, so it compiles like the document", () => {
    const built = build([{ item: "motor", perSecond: 0.25 }]);
    expect(built.document).toMatchObject({ id: "doc", pack: empty.pack, settings: empty.settings });
  });

  it("refuses targets the pack doesn't know", () => {
    const result = buildSuperstructure({
      document: empty,
      pack,
      plugin: templatePlugin,
      targets: [{ item: "unobtainium", perSecond: 1 }],
      options: PlanOptions.parse({}),
    });
    expect(result).toEqual({
      ok: false,
      error: [{ path: ["targets", 0, "item"], message: 'The pack has no item "unobtainium"' }],
    });
  });
});
