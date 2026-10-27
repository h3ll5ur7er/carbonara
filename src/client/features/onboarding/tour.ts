// The welcome tour's steps and when each one is done. Most steps wait for the person to do the thing they
// describe in the factory on screen (add a recipe, connect it, set a target, open the planner); the tour compares
// what the document looks like now with how it looked when the step (and the tour) began.
import type { Document } from "../../../contracts/document";

export const TOUR_STEPS = ["welcome", "add", "connect", "target", "solve", "plan", "done"] as const;
export type TourStepId = (typeof TOUR_STEPS)[number];

/** The steps counted as "Step 1 of 5": the ones between the welcome and the end. */
export const COUNTED_STEPS = TOUR_STEPS.length - 2;

/** What the tour watches in the factory on screen. */
export interface TourSnapshot {
  documentId: string;
  /** Ids of the recipe nodes. */
  recipes: string[];
  edges: { from: string; to: string }[];
  /** Every target and pin, as one string: it changes whenever one is set, changed or removed. */
  targets: string;
  /** How many targets and pins there are. */
  targetCount: number;
  plannerOpen: boolean;
}

export function tourSnapshot(documentId: string, document: Document, plannerOpen: boolean): TourSnapshot {
  const nodes = Object.entries(document.graph.nodes);
  const targets = nodes
    .flatMap(([id, node]): [string, unknown][] => {
      if (node.kind === "sink" && node.targetPerSecond !== undefined) return [[id, node.targetPerSecond]];
      if (node.kind === "recipe" && node.pin) return [[id, node.pin]];
      return [];
    })
    .sort(([a], [b]) => a.localeCompare(b));
  return {
    documentId,
    recipes: nodes.filter(([, node]) => node.kind === "recipe").map(([id]) => id),
    edges: Object.values(document.graph.edges).map(({ from, to }) => ({ from, to })),
    targets: JSON.stringify(targets),
    targetCount: targets.length,
    plannerOpen,
  };
}

/**
 * Whether the person did what `step` asks: `start` is the factory when the tour began, `base` when the step
 * began, `now` as it is. Steps that only explain something are done when the person moves on.
 */
export function stepDone(step: TourStepId, start: TourSnapshot, base: TourSnapshot, now: TourSnapshot): boolean {
  if (now.documentId !== base.documentId) return false;
  switch (step) {
    case "add":
      return now.recipes.some((id) => !base.recipes.includes(id));
    case "connect": {
      // The recipes added during the tour, connected on both sides; any new flow when none was added.
      const added = now.recipes.filter((id) => !start.recipes.includes(id));
      if (added.length === 0 || start.documentId !== now.documentId) return now.edges.length > base.edges.length;
      return added.some((id) => now.edges.some(({ to }) => to === id) && now.edges.some(({ from }) => from === id));
    }
    case "target":
      return now.targets !== base.targets && now.targetCount > 0;
    case "plan":
      return now.plannerOpen;
    default:
      return false;
  }
}
