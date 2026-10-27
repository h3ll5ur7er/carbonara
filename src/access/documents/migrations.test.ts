import { describe, expect, it } from "vitest";
import { CURRENT_DOCUMENT_VERSION } from "../../contracts/document";
import { exampleDocument } from "../../contracts/document.fixture";
import { MIGRATIONS, upgradeDocument } from "./migrations";

/** The pre-release format: positions lived on the nodes. */
const versionZero = {
  format: "carbonara",
  version: 0,
  id: "doc-0",
  name: "Old",
  pack: { id: "satisfactory", version: "1.0.0", hash: "h" },
  graph: {
    nodes: {
      ore: { kind: "source", item: "iron-ore", x: 10, y: 20 },
      smelt: { kind: "recipe", recipe: "iron-ingot", x: 250, y: 20 },
    },
    edges: { e: { from: "ore", to: "smelt", item: "iron-ore" } },
  },
};

describe("upgradeDocument", () => {
  it("has one migration per version step", () => {
    expect(MIGRATIONS).toHaveLength(CURRENT_DOCUMENT_VERSION);
  });

  it("parses a current document unchanged", () => {
    const result = upgradeDocument(exampleDocument);
    expect(result.ok && result.value.graph).toEqual(exampleDocument.graph);
  });

  it("moves version 0 positions into the layout", () => {
    const result = upgradeDocument(versionZero);
    expect(result).toMatchObject({
      ok: true,
      value: {
        version: 1,
        graph: { nodes: { ore: { kind: "source", item: "iron-ore" }, smelt: { kind: "recipe" } } },
        layout: { root: { ore: { x: 10, y: 20 }, smelt: { x: 250, y: 20 } } },
      },
    });
    expect(result.ok && result.value.graph.nodes["ore"]).not.toHaveProperty("x");
  });

  it("refuses documents from a newer Carbonara", () => {
    expect(upgradeDocument({ ...exampleDocument, version: 99 })).toEqual({
      ok: false,
      error: [{ path: ["version"], message: "Made with a newer Carbonara (document version 99)" }],
    });
  });

  it.each([
    ["not an object", "hello"],
    ["another format", { format: "zip", version: 1 }],
    ["no version", { format: "carbonara" }],
  ])("refuses %s", (_name, raw) => {
    expect(upgradeDocument(raw)).toMatchObject({ ok: false, error: [{ message: "Not a Carbonara document" }] });
  });

  it("reports schema problems with their paths", () => {
    const broken = structuredClone(exampleDocument);
    broken.graph.edges.e1.item = "Iron";
    const result = upgradeDocument(broken);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error[0]?.path).toEqual(["graph", "edges", "e1", "item"]);
  });
});
