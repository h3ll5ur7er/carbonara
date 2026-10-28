// What Carbonara remembers about the person across sessions (the workspace manager's preferences), stored by the
// preferences access component. Every preference is optional: a fresh install has none.
import { z } from "zod";
import { Id } from "./ids";

export const TourProgress = z.object({
  /** The step the tour is at, or was left at. */
  step: z.number().int().nonnegative(),
  /** Completed or skipped: the tour no longer starts by itself (the command palette resumes it). */
  finished: z.boolean(),
});
export type TourProgress = z.infer<typeof TourProgress>;

/** The recipes of one pack the person reaches for: the recipe browser's Favourites and Recent, first in quick-add. */
export const RecipeMemory = z.object({
  /** Starred recipes, in the order they were starred. */
  favourites: z.array(Id).default([]),
  /** The recipes added to factories of the pack lately, newest first, at most a few. */
  recent: z.array(Id).default([]),
});
export type RecipeMemory = z.infer<typeof RecipeMemory>;

export const Preferences = z.object({
  tour: TourProgress.optional().describe("How far the welcome tour got. None yet means this is the first run."),
  recipes: z
    .record(Id, RecipeMemory)
    .optional()
    .describe("Favourite and recently added recipes, by pack id (read with `own`: ids are the games' own names)."),
});
export type Preferences = z.infer<typeof Preferences>;
