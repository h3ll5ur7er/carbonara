import { describe, expect, it } from "vitest";
import type { Clipboard } from "../../../contracts/clipboard";
import { PackData } from "../../../contracts/pack";
import { clipboardFromText, clipboardText, nodeCount, packWarning } from "./clipboard";

const clipboard: Clipboard = {
  format: "carbonara-clipboard",
  version: 1,
  pack: { id: "factorio", version: "2.0.0" },
  source: { documentId: "doc-1", graph: "root" },
  graph: {
    nodes: {
      ore: { kind: "source", item: "iron-ore" },
      smelt: { kind: "recipe", recipe: "iron-plate", building: "stone-furnace" },
      gears: { kind: "recipe", recipe: "iron-gear-wheel" },
      note: { kind: "note", text: "Hi" },
    },
    edges: {
      a: { from: "ore", to: "smelt", item: "iron-ore", logistics: "transport-belt" },
      b: { from: "smelt", to: "gears", item: "iron-plate" },
    },
  },
  layout: { ore: { x: 0, y: 0 }, smelt: { x: 240, y: 0 }, gears: { x: 480, y: 0 }, note: { x: 0, y: 200 } },
  connections: {},
};

const pack = PackData.parse({
  items: [
    { id: "iron-ore", name: "Iron Ore", form: "solid" },
    { id: "iron-plate", name: "Iron Plate", form: "solid" },
  ],
  buildings: [{ id: "stone-furnace", name: "Stone Furnace" }],
  recipes: [
    {
      id: "iron-plate",
      name: "Iron Plate",
      in: { "iron-ore": 1 },
      out: { "iron-plate": 1 },
      time: 3.2,
      buildings: ["stone-furnace"],
    },
  ],
});

describe("the clipboard's text", () => {
  it("round-trips a copy", () => {
    expect(clipboardFromText(clipboardText(clipboard))).toEqual(clipboard);
  });

  it("is nothing for other text, other JSON, or a damaged copy", () => {
    expect(clipboardFromText("hello")).toBeNull();
    expect(clipboardFromText('{"format":"carbonara"}')).toBeNull();
    expect(clipboardFromText(clipboardText(clipboard).replace('"version":1', '"version":7'))).toBeNull();
    expect(clipboardFromText("")).toBeNull();
  });

  it("allows whitespace around it, as chats add", () => {
    expect(clipboardFromText(`\n  ${clipboardText(clipboard)}  \n`)).toEqual(clipboard);
  });
});

describe("pasting from another pack", () => {
  it("says nothing within the same pack", () => {
    expect(packWarning({ ...clipboard, pack: { id: "satisfactory", version: "1" } }, "satisfactory", pack)).toBeNull();
  });

  it("counts the recipes, items, buildings and belts this pack doesn't have", () => {
    expect(packWarning(clipboard, "satisfactory", pack)).toEqual({
      tone: "error",
      title: "These nodes come from the factorio pack",
      description: "1 recipe and 1 belt don't exist in satisfactory and will show as missing.",
    });
  });

  it("only mentions where they come from when everything exists here too", () => {
    const known = { ...clipboard, graph: { nodes: { ore: { kind: "source" as const, item: "iron-ore" } }, edges: {} } };
    expect(packWarning(known, "satisfactory", pack)).toEqual({
      tone: "info",
      title: "These nodes come from the factorio pack",
      description: "Everything they use exists in satisfactory too.",
    });
  });
});

describe("counting", () => {
  it("reads naturally", () => {
    expect(nodeCount(1)).toBe("1 node");
    expect(nodeCount(5)).toBe("5 nodes");
  });
});
