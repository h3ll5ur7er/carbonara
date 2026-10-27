// The goal planner's state for the session: whether it's open, the goals being written, and the proposal on
// the canvas with how far its ghost was moved. The "Plan production…" command toggles it.
import { create } from "zustand";
import type { PlanOptions, Proposal } from "../../../contracts/managers";
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

export function newGoal(): GoalRow {
  return { key: nextKey++, item: null, rate: 0 };
}

const fresh = (): Omit<PlannerState, "open"> => ({
  documentId: null,
  stage: "goals",
  goals: [newGoal()],
  options: { objective: "resources", alternates: true, exclude: [] },
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
