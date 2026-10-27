import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Document, Edge, Node } from "../../contracts/document";
import type { PackData } from "../../contracts/pack";
import { definePlugin } from "../../contracts/plugin";
import { compile } from "./compile";
import { templatePack, waterLoop } from "./template.fixture";

const pack = templatePack();
const noPlugin = definePlugin({ id: "template" });

function withGraph(nodes: Record<string, Node>, edges: Record<string, Edge> = {}): Document {
  return { ...waterLoop(), graph: { nodes, edges } };
}

describe("compiling a document into the solver IR", () => {
  it("turns the template's water loop into nodes, edges and items per second", () => {
    const compiled = compile({ document: waterLoop(), pack, plugin: noPlugin });
    expect(compiled.diagnostics).toEqual([]);
    // Ids sorted, items in pack order; the note isn't part of the model.
    expect(compiled.nodes).toEqual(["merge", "ore", "plates", "purify", "smelt", "wash", "water"]);
    expect(compiled.items).toEqual(["ferrite-ore", "water", "dirty-water", "sludge", "clean-ferrite", "iron-plate"]);
    expect(compiled.model).toEqual({
      items: 6,
      nodes: [
        { kind: "junction", rates: [], cost: 0 },
        { kind: "process", rates: [{ item: 0, perSecond: 1 }], cost: 1 },
        { kind: "process", rates: [{ item: 5, perSecond: -1 }], pin: 1, cost: 0 },
        {
          kind: "process",
          rates: [
            { item: 2, perSecond: -1 },
            { item: 1, perSecond: 0.75 },
            { item: 3, perSecond: 0.25 },
          ],
          cost: 0,
        },
        {
          kind: "process",
          rates: [
            { item: 4, perSecond: -1 / 3 },
            { item: 5, perSecond: 1 / 3 },
          ],
          cost: 0,
        },
        {
          kind: "process",
          rates: [
            { item: 0, perSecond: -1 },
            { item: 1, perSecond: -0.5 },
            { item: 2, perSecond: 0.5 },
            { item: 4, perSecond: 1 },
          ],
          cost: 0,
        },
        { kind: "process", rates: [{ item: 1, perSecond: 1 }], cost: 1 },
      ],
      edges: [
        { from: 0, to: 5, item: 1 },
        { from: 1, to: 5, item: 0, capacity: 15 },
        { from: 3, to: 0, item: 1 },
        { from: 4, to: 2, item: 5 },
        { from: 5, to: 3, item: 2 },
        { from: 5, to: 4, item: 4 },
        { from: 6, to: 0, item: 1, capacity: 100 },
      ],
      constraints: [],
    });
  });

  it("speeds recipes up by the building's speed", () => {
    const compiled = compile({
      document: withGraph({ gears: { kind: "recipe", recipe: "iron-gear", building: "fast-assembler" } }),
      pack,
      plugin: noPlugin,
    });
    expect(compiled.model.nodes[0]?.rates).toEqual([
      { item: 0, perSecond: -4 },
      { item: 1, perSecond: 2 },
    ]);
  });

  it("turns pins into activity pins and limits into maxima", () => {
    const compiled = compile({
      document: withGraph({
        a: { kind: "recipe", recipe: "iron-plate", pin: { type: "machines", count: 4 } },
        b: { kind: "recipe", recipe: "iron-plate", pin: { type: "rate", item: "iron-plate", perSecond: 2 } },
        c: { kind: "source", item: "coal", maxPerSecond: 5 },
      }),
      pack,
      plugin: noPlugin,
    });
    expect(compiled.model.nodes.map((node) => [node.pin, node.max])).toEqual([
      [4, undefined],
      [6, undefined],
      [undefined, 5],
    ]);
  });

  it("converts belt capacities from the pack's rate unit", () => {
    const perMinute: PackData = { ...pack, units: { rate: "per_minute" } };
    const compiled = compile({ document: waterLoop(), pack: perMinute, plugin: noPlugin });
    expect(compiled.model.edges[1]?.capacity).toBe(0.25);
  });

  it("asks the plugin for node field defaults and the effective recipe", () => {
    const overclocking = definePlugin({
      id: "clocks",
      nodeFields: () => ({ clock: { kind: "number", label: "Clock", min: 1, max: 300, default: 100 } }),
      effectiveRecipe: ({ recipe, fields }) => ({ ...recipe, time: recipe.time / (Number(fields.clock) / 100) }),
    });
    const compiled = compile({
      document: withGraph({
        fast: { kind: "recipe", recipe: "iron-plate", fields: { clock: 300 } },
        normal: { kind: "recipe", recipe: "iron-plate" },
      }),
      pack,
      plugin: overclocking,
    });
    expect(compiled.model.nodes.map((node) => node.rates[1]?.perSecond)).toEqual([1, 1 / 3]);
  });

  it("reports what it can't compile and leaves it out", () => {
    const compiled = compile({
      document: withGraph(
        {
          unknown: { kind: "recipe", recipe: "unobtainium" },
          wrong: { kind: "recipe", recipe: "iron-plate", building: "mixer" },
          odd: { kind: "source", item: "nothing" },
          missed: { kind: "recipe", recipe: "iron-plate", pin: { type: "rate", item: "coal", perSecond: 1 } },
          nested: { kind: "instance", blueprint: "rods" },
          smelt: { kind: "recipe", recipe: "iron-plate" },
          sink: { kind: "sink", item: "iron-plate" },
          memo: { kind: "note", text: "hi" },
        },
        {
          dangling: { from: "smelt", to: "ghost", item: "iron-plate" },
          toNote: { from: "smelt", to: "memo", item: "iron-plate" },
          intoInstance: { from: "smelt", to: "nested", item: "iron-plate" },
          wrongItem: { from: "smelt", to: "sink", item: "coal" },
          slowBelt: { from: "smelt", to: "sink", item: "iron-plate", logistics: "hyperloop" },
        },
      ),
      pack,
      plugin: noPlugin,
    });
    expect(compiled.diagnostics).toEqual([
      { kind: "error", node: "missed", message: 'The pin is ignored: the recipe neither makes nor uses "coal"' },
      { kind: "error", node: "nested", message: "Blueprint instances aren't solved yet" },
      { kind: "error", node: "odd", message: 'Unknown item "nothing"' },
      { kind: "error", node: "unknown", message: 'Unknown recipe "unobtainium"' },
      { kind: "error", node: "wrong", message: 'Recipe "iron-plate" can\'t run in "mixer"' },
      { kind: "error", message: 'Edge "dangling" connects "ghost", which doesn\'t exist' },
      { kind: "error", message: 'Edge "slowBelt" uses unknown belt or pipe "hyperloop"' },
      { kind: "error", message: 'Edge "toNote" connects "memo", which carries no items' },
      { kind: "error", node: "smelt", message: 'Edge "wrongItem" carries "coal", which this node doesn\'t make' },
    ]);
    expect(compiled.nodes).toEqual(["missed", "sink", "smelt"]);
    expect(compiled.edges).toEqual(["slowBelt", "wrongItem"]);
  });
});

/** Random graphs over the template pack, with ids that may collide with nothing in particular. */
const id = fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/);
const item = fc.constantFrom(...pack.items.map((entry) => entry.id), "nothing");
const node: fc.Arbitrary<Node> = fc.oneof(
  fc.record({ kind: fc.constant("recipe" as const), recipe: fc.constantFrom(...pack.recipes.map((r) => r.id)) }),
  fc.record({ kind: fc.constant("source" as const), item }),
  fc.record({ kind: fc.constant("sink" as const), item, targetPerSecond: fc.double({ min: 0, max: 10, noNaN: true }) }),
  fc.constant({ kind: "junction" as const }),
  fc.constant({ kind: "note" as const, text: "note" }),
);
const document = fc
  .uniqueArray(id, { minLength: 1, maxLength: 12 })
  .chain((ids) =>
    fc.tuple(
      fc.constant(ids),
      fc.array(node, { minLength: ids.length, maxLength: ids.length }),
      fc.array(fc.tuple(id, fc.constantFrom(...ids), fc.constantFrom(...ids), item), { maxLength: 16 }),
    ),
  )
  .map(([ids, nodes, edges]) =>
    withGraph(
      Object.fromEntries(ids.map((nodeId, index) => [nodeId, nodes[index] as Node])),
      Object.fromEntries(edges.map(([edgeId, from, to, edgeItem]) => [edgeId, { from, to, item: edgeItem }])),
    ),
  );

function reversed<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).reverse());
}

describe("compiling deterministically", () => {
  it("gives byte-identical IR for the same document", () => {
    fc.assert(
      fc.property(document, (doc) => {
        const copy = structuredClone(doc);
        expect(JSON.stringify(compile({ document: copy, pack, plugin: noPlugin }))).toBe(
          JSON.stringify(compile({ document: doc, pack, plugin: noPlugin })),
        );
      }),
    );
  });

  it("doesn't depend on the order nodes and edges were added in", () => {
    fc.assert(
      fc.property(document, (doc) => {
        const reordered = { ...doc, graph: { nodes: reversed(doc.graph.nodes), edges: reversed(doc.graph.edges) } };
        expect(JSON.stringify(compile({ document: reordered, pack, plugin: noPlugin }))).toBe(
          JSON.stringify(compile({ document: doc, pack, plugin: noPlugin })),
        );
      }),
    );
  });

  it("always builds a model whose indices are in range", () => {
    fc.assert(
      fc.property(document, (doc) => {
        const { model } = compile({ document: doc, pack, plugin: noPlugin });
        const inRange = (index: number, length: number) => Number.isInteger(index) && index >= 0 && index < length;
        for (const edge of model.edges) {
          expect(inRange(edge.from, model.nodes.length) && inRange(edge.to, model.nodes.length)).toBe(true);
          expect(inRange(edge.item, model.items)).toBe(true);
        }
        for (const modelNode of model.nodes)
          for (const rate of modelNode.rates) expect(inRange(rate.item, model.items)).toBe(true);
      }),
    );
  });
});
