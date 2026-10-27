import { describe, expect, it } from "vitest";
import { CURRENT_DOCUMENT_VERSION, type Document } from "../../../contracts/document";
import { templatePack } from "../../scenes/template-pack";
import { alternativesFor, findInFactory, recipeChangeCommands } from "./find";

const factory: Document = {
  format: "carbonara",
  version: CURRENT_DOCUMENT_VERSION,
  id: "doc",
  name: "Gears",
  pack: { id: "template", version: "1", hash: "x" },
  graph: {
    nodes: {
      ore: { kind: "source", item: "ferrite-ore" },
      wash: { kind: "recipe", recipe: "wash-ferrite" },
      smelt: { kind: "recipe", recipe: "iron-plate" },
      gears: { kind: "recipe", recipe: "iron-gear" },
      plates: { kind: "instance", blueprint: "line" },
      memo: { kind: "note", text: "Upgrade the gear line later" },
    },
    edges: {
      a: { from: "ore", to: "wash", item: "ferrite-ore" },
      b: { from: "wash", to: "smelt", item: "clean-ferrite" },
      c: { from: "smelt", to: "gears", item: "iron-plate" },
    },
  },
  blueprints: {
    line: {
      name: "Plate line",
      graph: { nodes: { inner: { kind: "recipe", recipe: "iron-plate" } }, edges: {} },
    },
  },
  layout: {},
  settings: {},
};

describe("findInFactory", () => {
  it("finds nodes by recipe, item, building and alias, in every graph", () => {
    expect(findInFactory(factory, templatePack, "iron plate").map((result) => [result.graph, result.nodeId])).toEqual([
      ["root", "smelt"],
      ["root", "gears"],
      ["line", "inner"],
    ]);
    expect(findInFactory(factory, templatePack, "gear").map((result) => result.nodeId)).toEqual(["gears", "memo"]);
    expect(findInFactory(factory, templatePack, "furnace").map((result) => result.nodeId)).toEqual(["smelt", "inner"]);
  });

  it("says where each one is and what it is", () => {
    const [inner] = findInFactory(factory, templatePack, "plate line");
    expect(inner).toMatchObject({ graph: "root", nodeId: "plates", title: "Plate line", where: "Gears" });
    const [nested] = findInFactory(factory, templatePack, "furnace").slice(1);
    expect(nested).toMatchObject({ title: "Iron Plate", detail: "Furnace", where: "Plate line", recipe: "iron-plate" });
  });

  it("finds nothing for an empty search", () => {
    expect(findInFactory(factory, templatePack, "  ")).toEqual([]);
  });
});

describe("replacing a recipe", () => {
  it("offers the recipes that make the same main product", () => {
    expect(alternativesFor(templatePack, "iron-plate").map((recipe) => recipe.id)).toEqual(["iron-plate-from-ore"]);
  });

  it("swaps the recipe in every graph and drops the flows the new one can't take, in one batch", () => {
    // The coal smelting recipe takes ferrite ore and coal: the washed ferrite flow no longer fits.
    expect(
      recipeChangeCommands(factory, templatePack, { root: ["smelt"], line: ["inner"] }, "iron-plate-from-ore"),
    ).toEqual([
      { type: "setRecipe", graph: "root", ids: ["smelt"], recipe: "iron-plate-from-ore" },
      { type: "disconnect", graph: "root", ids: ["b"] },
      { type: "setRecipe", graph: "line", ids: ["inner"], recipe: "iron-plate-from-ore" },
    ]);
  });
});
