import { describe, expect, it } from "vitest";
import type { Edge } from "../../../contracts/document";
import { templatePack } from "../../scenes/template-pack";
import { edgeUnder, insertCommands, insertedItem } from "./insert";
import { createSceneBuilder } from "./scene";

const scene = createSceneBuilder()(
  {
    nodes: {
      ore: { kind: "source", item: "cuprite-ore" },
      smelter: { kind: "recipe", recipe: "copper-plate" },
      wire: { kind: "recipe", recipe: "copper-wire" },
      split: { kind: "junction" },
      out: { kind: "sink", item: "copper-wire" },
      ingots: { kind: "sink", item: "copper-plate" },
    },
    edges: {
      plates: { from: "smelter", to: "ingots", item: "copper-plate", logistics: "conveyor-1" },
      ore: { from: "ore", to: "ingots", item: "cuprite-ore" },
    },
  },
  {
    ore: { x: 0, y: 0 },
    smelter: { x: 400, y: 0 },
    ingots: { x: 1200, y: 64 },
    wire: { x: 600, y: 400 },
    split: { x: 900, y: 600 },
    out: { x: 0, y: 600 },
  },
  templatePack,
);
const view = (id: string) => {
  const found = scene.nodes.find((node) => node.id === id);
  if (!found) throw new Error(id);
  return found;
};
const plates: Edge = { from: "smelter", to: "ingots", item: "copper-plate", logistics: "conveyor-1" };

describe("edgeUnder", () => {
  it("finds the flow a node is dropped on", () => {
    // The plates flow runs from the smelter's right edge (712, 136) to the output's port (1200, 100).
    expect(edgeUnder({ x: 900, y: 90, width: 48, height: 48 }, scene, view("split"))).toBe("plates");
  });

  it("finds nothing over empty canvas, nor a flow the node doesn't fit, nor the node's own flows", () => {
    expect(edgeUnder({ x: 900, y: 400, width: 48, height: 48 }, scene, view("split"))).toBeUndefined();
    expect(edgeUnder({ x: 900, y: 90, width: 48, height: 48 }, scene, view("wire"))).toBeUndefined();
    expect(edgeUnder({ ...view("ingots").position, width: 264, height: 72 }, scene, view("ingots"))).toBeUndefined();
  });
});

describe("insertCommands", () => {
  it("splices a junction into a flow, keeping the belt on both sides", () => {
    expect(insertCommands("root", "plates", plates, view("split"), view("ingots"), { x: 900, y: 96 })).toEqual([
      { type: "disconnect", graph: "root", ids: ["plates"] },
      {
        type: "connect",
        graph: "root",
        edge: { from: "smelter", to: "split", item: "copper-plate", logistics: "conveyor-1" },
      },
      {
        type: "connect",
        graph: "root",
        edge: { from: "split", to: "ingots", item: "copper-plate", logistics: "conveyor-1" },
      },
      { type: "moveNodes", graph: "root", positions: { split: { x: 900, y: 96 } } },
    ]);
  });

  it("splices in a machine that takes the item, feeding on with what it makes when the consumer takes that", () => {
    const wireOut = view("out");
    const toWires: Edge = { from: "smelter", to: "out", item: "copper-plate" };
    // The output takes wire, which the wire machine makes from the plates.
    const commands = insertCommands(
      "root",
      "e",
      toWires,
      view("wire"),
      { ...wireOut, kind: "junction" },
      { x: 0, y: 0 },
    );
    expect(commands?.[1]).toMatchObject({ edge: { from: "smelter", to: "wire", item: "copper-plate" } });
    expect(commands?.[2]).toMatchObject({ edge: { from: "wire", to: "out", item: "copper-wire" } });
    expect(insertCommands("root", "e", toWires, view("wire"), wireOut, { x: 0, y: 0 })?.[2]).toMatchObject({
      edge: { from: "wire", to: "out", item: "copper-wire" },
    });
  });

  it("refuses nodes that can't take the item or can't pass anything on", () => {
    expect(insertCommands("root", "plates", plates, view("wire"), view("ingots"), { x: 0, y: 0 })).toBeUndefined();
    expect(insertCommands("root", "plates", plates, view("out"), view("ingots"), { x: 0, y: 0 })).toBeUndefined();
    expect(insertCommands("root", "plates", plates, view("ore"), view("ingots"), { x: 0, y: 0 })).toBeUndefined();
  });
});

describe("insertedItem", () => {
  it("never splices in a subgraph instance, whose flows go through ports a splice can't choose", () => {
    const instance = { ...view("smelter"), kind: "instance" as const, blueprint: "plates", title: "Plates" };
    expect(insertedItem(view("smelter"), "cuprite-ore", view("ingots"))).toBe("copper-plate");
    expect(insertedItem(instance, "cuprite-ore", view("ingots"))).toBeUndefined();
  });
});
