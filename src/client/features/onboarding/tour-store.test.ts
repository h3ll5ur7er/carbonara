import { beforeEach, describe, expect, it } from "vitest";
import { TOUR_STEPS } from "./tour";
import { finishTour, loadTour, nextStep, resumeTour, skipTour, startTour, useTour } from "./tour-store";

const initial = useTour.getState();
const last = TOUR_STEPS.length - 1;

beforeEach(() => useTour.setState(initial, true));

describe("the tour's state", () => {
  it("carries on with an unfinished tour, and stays quiet once one was finished or skipped", () => {
    loadTour({ step: 2, finished: false });
    expect(useTour.getState()).toMatchObject({ loaded: true, running: true });
    loadTour({ step: 2, finished: true });
    expect(useTour.getState().running).toBe(false);
    loadTour(undefined);
    expect(useTour.getState()).toMatchObject({ loaded: true, running: false, progress: undefined });
  });

  it("walks through the steps and is finished after the last", () => {
    startTour();
    for (let step = 1; step <= last; step++) {
      nextStep();
      expect(useTour.getState().progress).toEqual({ step, finished: false });
    }
    nextStep();
    expect(useTour.getState()).toMatchObject({ running: false, progress: { step: last, finished: true } });
  });

  it("remembers where it was skipped, and resumes there", () => {
    useTour.setState({ documentOpen: true });
    startTour();
    nextStep();
    nextStep();
    skipTour();
    expect(useTour.getState()).toMatchObject({ running: false, progress: { step: 2, finished: true } });
    resumeTour();
    expect(useTour.getState()).toMatchObject({ running: true, progress: { step: 2, finished: false } });
  });

  it("starts over when resumed after it was completed", () => {
    useTour.setState({ documentOpen: true });
    finishTour();
    resumeTour();
    expect(useTour.getState().progress).toEqual({ step: 0, finished: false });
  });

  it("asks for a game first when no factory is open", () => {
    resumeTour();
    expect(useTour.getState()).toMatchObject({ pickingGame: true, running: false });
  });
});
