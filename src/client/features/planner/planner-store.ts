// The goal planner's state for the session: whether it's open, the goals being written, and the proposal on
// the canvas with how far its ghost was moved. The "Plan production…" command toggles it. It follows the planning
// manager's proposals (`proposalChanged`): one made anywhere, by the planner itself or an MCP client, opens here.
import { create } from "zustand";
import { DEFAULT_PLAN_OPTIONS, type Events, type PlanOptions, type Proposal } from "../../../contracts/managers";
import type { Subscribable } from "../../../utilities/rpc";
import type { Point } from "../../canvas/adapter";
import type { GoalRow } from "./plan";

export type PlannerStage =
  /** Writing goals; a proposal may still be shown from before ("Adjust"). */
  | "goals"
  | "planning"
  | "proposal"
  /** The proposal was added to the document; it can be undone from the card. */
  | "accepted";

export interface PlannerState {
  open: boolean;
  /** The document the goals and the proposal belong to. */
  documentId: string | null;
  stage: PlannerStage;
  goals: GoalRow[];
  options: PlanOptions;
  proposal: Proposal | null;
  /** How far the proposal's ghost was dragged from where the planner put it. */
  offset: Point;
  /** Why the last plan failed. */
  error: string | null;
}

let nextKey = 1;

/** A key for a goal row, unique in the session. */
export function newGoalKey(): number {
  return nextKey++;
}

export function newGoal(): GoalRow {
  return { key: newGoalKey(), item: null, rate: 0 };
}

const fresh = (): Omit<PlannerState, "open"> => ({
  documentId: null,
  stage: "goals",
  goals: [newGoal()],
  options: DEFAULT_PLAN_OPTIONS,
  proposal: null,
  offset: { x: 0, y: 0 },
  error: null,
});

export const usePlanner = create<PlannerState>(() => ({ open: false, ...fresh() }));

export function togglePlanner(): void {
  const { open } = usePlanner.getState();
  if (open) closePlanner();
  else usePlanner.setState({ open: true });
}

/** Closes the planner and drops its proposal; the goals stay for next time. */
export function closePlanner(): void {
  usePlanner.setState({ open: false, stage: "goals", proposal: null, offset: { x: 0, y: 0 }, error: null });
}

/** The planner, emptied for another document. */
export function resetPlanner(documentId: string | null): void {
  usePlanner.setState((state) => ({ ...fresh(), open: state.open, documentId }));
}

/**
 * Follows the planning manager's proposals until the returned function is called. A new proposal opens in the
 * planner, on its document's tab (`activate`); the one shown leaves when it's accepted (the card says so),
 * discarded or replaced.
 */
export function followProposals(
  events: Pick<Subscribable<Events>, "on">,
  activate: (documentId: string) => void,
): () => void {
  return events.on("proposalChanged", ({ proposal, status }) => {
    const shown = usePlanner.getState();
    if (status === "pending") {
      // Set first, so the planner already belongs to the document when its tab comes up.
      usePlanner.setState({
        ...(shown.documentId !== proposal.documentId && fresh()),
        open: true,
        documentId: proposal.documentId,
        stage: "proposal",
        proposal,
        offset: { x: 0, y: 0 },
        error: null,
      });
      activate(proposal.documentId);
    } else if (shown.proposal?.id === proposal.id) {
      usePlanner.setState({
        stage: status === "accepted" ? "accepted" : shown.stage === "proposal" ? "goals" : shown.stage,
        proposal: null,
        offset: { x: 0, y: 0 },
      });
    }
  });
}
