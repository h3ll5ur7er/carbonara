import { describe, expect, it, vi } from "vitest";
import type { AnalysisResults } from "../../../contracts/results";
import { createResultSlots } from "./result-slots";

function results(overrides: Partial<AnalysisResults> = {}): AnalysisResults {
  return {
    documentId: "doc",
    version: 1,
    graph: "root",
    nodes: {
      smelter: { activity: 2, inputs: { ore: 4 }, outputs: { plate: 2 } },
      press: { activity: 1, inputs: { plate: 2 }, outputs: { sheet: 1 } },
    },
    edges: { a: { perSecond: 2, capacity: 15 } },
    diagnostics: [],
    totals: { raw: {}, buildings: {} },
    ...overrides,
  };
}

describe("result slots", () => {
  it("hands each node and edge its own result", () => {
    const slots = createResultSlots();
    slots.update(results());
    expect(slots.node("smelter")?.result?.activity).toBe(2);
    expect(slots.edge("a")).toEqual({ perSecond: 2, capacity: 15, overflow: false });
    expect(slots.node("nothing")).toBeUndefined();
  });

  it("notifies only the slots whose values changed", () => {
    const slots = createResultSlots();
    slots.update(results());
    const smelter = vi.fn();
    const press = vi.fn();
    slots.subscribeNode("smelter", smelter);
    slots.subscribeNode("press", press);
    const before = slots.node("press");

    const next = results();
    next.nodes.smelter = { activity: 3, inputs: { ore: 6 }, outputs: { plate: 3 } };
    slots.update(next);

    expect(smelter).toHaveBeenCalledTimes(1);
    expect(press).not.toHaveBeenCalled();
    expect(slots.node("press")).toBe(before);
  });

  it("puts deficits on the node and overflows on the edge", () => {
    const slots = createResultSlots();
    slots.update(
      results({
        diagnostics: [
          { kind: "deficit", node: "press", item: "plate", perSecond: 0.5 },
          { kind: "overflow", edge: "a", perSecond: 1 },
        ],
      }),
    );
    expect(slots.node("press")?.deficits).toEqual({ plate: 0.5 });
    expect(slots.edge("a")?.overflow).toBe(true);
  });

  it("clears every slot when the results go away", () => {
    const slots = createResultSlots();
    slots.update(results());
    const listener = vi.fn();
    slots.subscribeEdge("a", listener);
    slots.update(null);
    expect(slots.edge("a")).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribing", () => {
    const slots = createResultSlots();
    const listener = vi.fn();
    const unsubscribe = slots.subscribeNode("smelter", listener);
    unsubscribe();
    slots.update(results());
    expect(listener).not.toHaveBeenCalled();
  });
});
