import { describe, expect, it } from "vitest";
import { CURRENT_DOCUMENT_VERSION, Document } from "./document";
import { exampleDocument } from "./document.fixture";

describe("Document", () => {
  it("accepts the example document", () => {
    const parsed = Document.parse(exampleDocument);
    expect(parsed.graph.nodes["smelt"]).toMatchObject({ kind: "recipe", pin: { type: "machines", count: 4 } });
  });

  it("is at the current version", () => {
    expect(CURRENT_DOCUMENT_VERSION).toBe(1);
    expect(Document.safeParse({ ...exampleDocument, version: 2 }).success).toBe(false);
  });

  it("defaults blueprints, layout and settings for a fresh document", () => {
    const { blueprints: _b, layout: _l, settings: _s, ...fresh } = exampleDocument;
    expect(Document.parse(fresh)).toMatchObject({ blueprints: {}, layout: {}, settings: {} });
  });

  it("keeps positions out of the logical graph", () => {
    const withPosition = structuredClone(exampleDocument);
    Object.assign(withPosition.graph.nodes.ore, { x: 1, y: 2 });
    expect(Document.parse(withPosition).graph.nodes["ore"]).not.toHaveProperty("x");
  });

  it.each([
    ["an unknown node kind", ["graph", "nodes", "ore", "kind"], "furnace"],
    ["a negative machine count", ["graph", "nodes", "smelt", "pin", "count"], -1],
    ["a split ratio above 1", ["graph", "edges", "e3", "ratio"], 1.5],
    ["an item id with capitals", ["graph", "edges", "e1", "item"], "Iron"],
    ["another file format", ["format"], "factorio-blueprint"],
  ])("rejects %s", (_name, path, value) => {
    const broken = structuredClone(exampleDocument) as Record<string, unknown>;
    let target = broken;
    for (const key of path.slice(0, -1)) target = target[key] as Record<string, unknown>;
    target[path.at(-1) as string] = value;
    expect(Document.safeParse(broken).success).toBe(false);
  });
});
