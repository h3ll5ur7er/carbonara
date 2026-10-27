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
  const model = createResultsModel({
    analysis: {
      getResults: async ({ documentId }) => {
        asked.push(documentId);
        return initial;
      },
    },
    on: bus.subscribe,
  });
  return { bus, model, asked };
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

  it("ignores blueprint graphs for now and documents nobody watches", async () => {
    const { model, bus } = setup();
    await model.watch("a");
    bus.publish("resultsChanged", results("a", 2, "rods"));
    bus.publish("resultsChanged", results("b", 1));
    expect(model.store.getState().results).toEqual({});
  });

  it("forgets closed documents", async () => {
    const { model, bus } = setup(results("a", 1));
    await model.watch("a");
    bus.publish("documentsChanged", { documents: [] });
    expect(model.store.getState().results).toEqual({});
  });
});
