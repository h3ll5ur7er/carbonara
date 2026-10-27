import { beforeEach, describe, expect, it } from "vitest";
import type { Events, Proposal } from "../../../contracts/managers";
import { followProposals, resetPlanner, usePlanner } from "./planner-store";

const proposal = (id: string, documentId = "doc"): Proposal => ({
  id,
  documentId,
  targets: [{ item: "steel-plate", perSecond: 30 }],
  commands: [],
  results: { nodes: {}, edges: {} },
  summary: { buildings: {}, raw: {}, byproducts: {}, shortfalls: {}, powerMW: 0 },
});

/** The planning manager's events, played by hand, and the tabs the planner brought up. */
function following() {
  let listener: (change: Events["proposalChanged"]) => void = () => undefined;
  const activated: string[] = [];
  followProposals({ on: (_event, next) => ((listener = next as typeof listener), () => undefined) }, (id) =>
    activated.push(id),
  );
  return { send: (change: Events["proposalChanged"]) => listener(change), activated };
}

beforeEach(() => {
  usePlanner.setState({ open: false });
  resetPlanner("doc");
});

describe("the planner following proposals", () => {
  it("opens a proposal made elsewhere (an MCP client) on its document's tab", () => {
    const { send, activated } = following();
    send({ proposal: proposal("proposal-1", "other"), status: "pending" });
    expect(usePlanner.getState()).toMatchObject({
      open: true,
      documentId: "other",
      stage: "proposal",
      proposal: { id: "proposal-1" },
    });
    expect(activated).toEqual(["other"]);
  });

  it("keeps the goals of the same document, and starts afresh for another", () => {
    const { send } = following();
    usePlanner.setState({ goals: [{ key: 1, item: "steel-plate", rate: 30 }] });
    send({ proposal: proposal("proposal-1"), status: "pending" });
    expect(usePlanner.getState().goals).toEqual([{ key: 1, item: "steel-plate", rate: 30 }]);
    send({ proposal: proposal("proposal-2", "other"), status: "pending" });
    expect(usePlanner.getState().goals).toMatchObject([{ item: null }]);
  });

  it("says the shown proposal was added once it's accepted, wherever that happened", () => {
    const { send } = following();
    send({ proposal: proposal("proposal-1"), status: "pending" });
    usePlanner.setState({ offset: { x: 24, y: 0 } });
    send({ proposal: proposal("proposal-1"), status: "accepted" });
    expect(usePlanner.getState()).toMatchObject({ stage: "accepted", proposal: null, offset: { x: 0, y: 0 } });
  });

  it("drops the shown proposal when it's discarded or replaced, and ignores the others", () => {
    const { send } = following();
    send({ proposal: proposal("proposal-1"), status: "pending" });
    send({ proposal: proposal("proposal-0"), status: "discarded" });
    expect(usePlanner.getState().proposal?.id).toBe("proposal-1");
    send({ proposal: proposal("proposal-1"), status: "replaced" });
    expect(usePlanner.getState()).toMatchObject({ open: true, stage: "goals", proposal: null });
  });
});
