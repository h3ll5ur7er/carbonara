import { describe, expect, it } from "vitest";
import type { Proposal } from "../../contracts/managers";
import { createMemoryProposalStore } from "./memory";

const content = (documentId: string): Omit<Proposal, "id"> => ({
  documentId,
  targets: [{ item: "steel-plate", perSecond: 30 }],
  commands: [],
  results: { nodes: {}, edges: {} },
  summary: { buildings: {}, raw: {}, byproducts: {}, shortfalls: {}, powerMW: 0 },
});

describe("the proposals in memory", () => {
  it("stores new proposals as pending, under ids a model can read back", () => {
    const store = createMemoryProposalStore();
    const first = store.add(content("doc"));
    const second = store.add(content("doc"));
    expect([first.id, second.id]).toEqual(["proposal-1", "proposal-2"]);
    expect(store.get("proposal-1")).toEqual({ proposal: first, status: "pending" });
    expect(store.pending("doc")).toEqual([first, second]);
    expect(store.get("proposal-3")).toBeUndefined();
  });

  it("settles a proposal once: it's no longer pending", () => {
    const store = createMemoryProposalStore();
    const proposal = store.add(content("doc"));
    store.settle(proposal.id, "accepted");
    expect(store.get(proposal.id)?.status).toBe("accepted");
    expect(store.pending("doc")).toEqual([]);
  });

  it("forgets the proposals of closed documents, and keeps counting ids", () => {
    const store = createMemoryProposalStore();
    const kept = store.add(content("open"));
    store.add(content("closed"));
    store.keepOnly(new Set(["open"]));
    expect(store.get("proposal-2")).toBeUndefined();
    expect(store.get(kept.id)?.status).toBe("pending");
    expect(store.add(content("open")).id).toBe("proposal-3");
  });
});
