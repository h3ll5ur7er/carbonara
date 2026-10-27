// What Carbonara remembers about the person across sessions (the workspace manager's preferences), stored by the
// preferences access component. Every preference is optional: a fresh install has none.
import { z } from "zod";

export const TourProgress = z.object({
  /** The step the tour is at, or was left at. */
  step: z.number().int().nonnegative(),
  /** Completed or skipped: the tour no longer starts by itself (the command palette resumes it). */
  finished: z.boolean(),
});
export type TourProgress = z.infer<typeof TourProgress>;

export const Preferences = z.object({
  tour: TourProgress.optional().describe("How far the welcome tour got. None yet means this is the first run."),
});
export type Preferences = z.infer<typeof Preferences>;
