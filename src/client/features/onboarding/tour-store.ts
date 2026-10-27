// The welcome tour's state: how far it got (saved in the person's preferences, so it never starts by itself once
// finished or skipped), whether it's running, and whether the welcome screen asks which game to play. The live
// app loads the saved progress and saves every change (use-onboarding.ts); the command palette resumes the tour.
import { create } from "zustand";
import type { TourProgress } from "../../../contracts/preferences";
import { TOUR_STEPS, type TourSnapshot } from "./tour";

export interface TourState {
  /** False until the saved progress is known, so the welcome screen doesn't flash the wrong content. */
  loaded: boolean;
  /** None saved yet: this is the first run. */
  progress: TourProgress | undefined;
  running: boolean;
  /** Whether a factory is open: the tour runs on one, and without one "Take the tour" asks for a game first. */
  documentOpen: boolean;
  /** The welcome screen asks which game to play (the first run, or "Take the tour" with nothing open). */
  pickingGame: boolean;
  /** The factory when the tour began, and when the current step began; taken by the live app. */
  start: TourSnapshot | null;
  base: TourSnapshot | null;
  /** Set when the person moved on with the card's buttons, so the next card takes the focus. */
  focusCard: boolean;
}

const LAST = TOUR_STEPS.length - 1;

export const useTour = create<TourState>(() => ({
  loaded: false,
  progress: undefined,
  running: false,
  documentOpen: false,
  pickingGame: false,
  start: null,
  base: null,
  focusCard: false,
}));

/** The step the tour is at. */
export function currentStep(state: TourState): number {
  return Math.min(state.progress?.step ?? 0, LAST);
}

/** The saved progress arrived: an unfinished tour carries on. */
export function loadTour(progress: TourProgress | undefined): void {
  useTour.setState({ loaded: true, progress, running: progress !== undefined && !progress.finished });
}

export function startTour(step = 0): void {
  useTour.setState({
    progress: { step, finished: false },
    running: true,
    pickingGame: false,
    start: null,
    base: null,
    focusCard: true,
  });
}

/** "Take the tour": where it was left, or from the start once it was completed; a game first if nothing is open. */
export function resumeTour(): void {
  const state = useTour.getState();
  if (!state.documentOpen) {
    useTour.setState({ pickingGame: true, running: false });
    return;
  }
  const step = currentStep(state);
  startTour(state.progress && step < LAST ? step : 0);
}

/** On to the next step; `byCard` when the person used the card, which then keeps the focus. */
export function nextStep(byCard = false): void {
  const step = currentStep(useTour.getState()) + 1;
  if (step > LAST) {
    finishTour();
    return;
  }
  useTour.setState({ progress: { step, finished: false }, base: null, focusCard: byCard });
}

export function finishTour(): void {
  useTour.setState({ progress: { step: LAST, finished: true }, running: false, focusCard: false });
}

/** Stops the tour where it is; the command palette resumes it from there. */
export function skipTour(): void {
  const step = currentStep(useTour.getState());
  useTour.setState({ progress: { step, finished: true }, running: false, pickingGame: false, focusCard: false });
}

export function setPickingGame(pickingGame: boolean): void {
  useTour.setState({ pickingGame });
}
