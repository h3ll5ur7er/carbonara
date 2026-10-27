import { describe, expect, it } from "vitest";
import type { Events } from "../../contracts/managers";
import type { AnalysisResults } from "../../contracts/results";
import { createEventBus } from "../../utilities/events";
import { createResultsModel } from "./results-model";

const results = (documentId: string, version: number, graph = "root"): AnalysisResults => ({
  documentId,
  version,
  graph,
  nodes: {},
  edges: {},
  diagnostics: [],
  totals: { raw: {}, buildings: {} },
});

function setup(initial: AnalysisResults | null = null) {
  const bus = createEventBus<Events>();
  const asked: string[] = [];
  const watches: string[] = [];
  const model = createResultsModel({
    analysis: {
      getResults: async ({ documentId, graph = "root" }) => {
        asked.push(graph === "root" ? documentId : `${documentId}/${graph}`);
        return initial && { ...initial, graph };
      },
      watchResults: async ({ documentId, graph }) => void watches.push(`watch ${documentId}/${graph}`),
      unwatchResults: async ({ documentId, graph }) => void watches.push(`unwatch ${documentId}/${graph}`),
    },
    on: bus.subscribe,
  });
  return { bus, model, asked, watches };
}

describe("createResultsModel", () => {
  it("loads the latest results when a document is watched", async () => {
    const { model, asked } = setup(results("a", 3));
    await model.watch("a");
    expect(asked).toEqual(["a"]);
    expect(model.store.getState().results["a"]?.version).toBe(3);
  });

  it("takes newer results from events and ignores older ones", async () => {
    const { model, bus } = setup(results("a", 3));
    await model.watch("a");
    bus.publish("resultsChanged", results("a", 5));
    bus.publish("resultsChanged", results("a", 4));
    expect(model.store.getState().results["a"]?.version).toBe(5);
  });

  it("keeps results that arrived while the first load was under way", async () => {
    const { model, bus } = setup(results("a", 1));
    const watching = model.watch("a");
    bus.publish("resultsChanged", results("a", 2));
    await watching;
    expect(model.store.getState().results["a"]?.version).toBe(2);
  });

  it("ignores blueprint graphs nobody looks at and documents nobody watches", async () => {
    const { model, bus } = setup();
    await model.watch("a");
    bus.publish("resultsChanged", results("a", 2, "rods"));
    bus.publish("resultsChanged", results("b", 1));
    expect(model.store.getState().results).toEqual({});
    expect(model.store.getState().blueprints).toEqual({});
  });

  it("follows a blueprint graph while it's looked at: asks the backend to publish it, then stops", async () => {
    const { model, bus, asked, watches } = setup(results("a", 3));
    const stop = await model.watchGraph("a", "rods");
    expect(asked).toEqual(["a/rods"]);
    expect(model.store.getState().blueprints["a"]?.["rods"]?.version).toBe(3);
    bus.publish("resultsChanged", results("a", 4, "rods"));
    bus.publish("resultsChanged", results("a", 2, "rods"));
    expect(model.store.getState().blueprints["a"]?.["rods"]?.version).toBe(4);
    stop();
    expect(watches).toEqual(["watch a/rods", "unwatch a/rods"]);
    expect(model.store.getState().blueprints).toEqual({});
    bus.publish("resultsChanged", results("a", 5, "rods"));
    expect(model.store.getState().blueprints).toEqual({});
  });

  it("keeps a blueprint graph while any view still looks at it", async () => {
    const { model, watches } = setup(results("a", 1));
    const first = await model.watchGraph("a", "rods");
    const second = await model.watchGraph("a", "rods");
    first();
    expect(model.store.getState().blueprints["a"]?.["rods"]).toBeDefined();
    second();
    expect(model.store.getState().blueprints).toEqual({});
    expect(watches).toEqual(["watch a/rods", "watch a/rods", "unwatch a/rods", "unwatch a/rods"]);
  });

  it("forgets closed documents", async () => {
    const { model, bus } = setup(results("a", 1));
    await model.watch("a");
    bus.publish("documentsChanged", { documents: [] });
    expect(model.store.getState().results).toEqual({});
  });

  it("stops looking at a blueprint graph the backend couldn't watch", async () => {
    const bus = createEventBus<Events>();
    const model = createResultsModel({
      analysis: {
        getResults: async () => null,
        watchResults: async () => {
          throw new Error("worker gone");
        },
        unwatchResults: async () => undefined,
      },
      on: bus.subscribe,
    });
    await expect(model.watchGraph("a", "rods")).rejects.toThrow("worker gone");
    bus.publish("resultsChanged", results("a", 1, "rods"));
    expect(model.store.getState().blueprints).toEqual({});
  });
});
