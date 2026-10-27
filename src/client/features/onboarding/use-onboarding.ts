// Wires the welcome tour to the live app: loads how far it got from the person's preferences, saves every change
// there, and moves the tour on when the person does what a step asks in the factory on screen.
import { useEffect, useMemo } from "react";
import { useConnector } from "../../core/connector";
import type { ActiveDocument } from "../../core/models";
import { usePlanner } from "../planner/planner-store";
import { stepDone, tourSnapshot, TOUR_STEPS } from "./tour";
import { currentStep, loadTour, nextStep, useTour } from "./tour-store";

/**
 * Automated browsers (Playwright sets `navigator.webdriver`) skip the first run's game picker, so end-to-end tests
 * start at the usual welcome; `?first-run` in the address brings it back for the tests of the first run.
 */
export function firstRunSuppressed(): boolean {
  return navigator.webdriver && !new URLSearchParams(location.search).has("first-run");
}

export function useOnboarding({ info, document }: ActiveDocument): void {
  const connector = useConnector();

  useEffect(() => {
    let current = true;
    connector.workspace
      .getPreferences({})
      .then((preferences) => current && loadTour(preferences.tour))
      // Without preferences (storage unavailable) there's no telling a first run: don't interrupt.
      .catch(() => current && loadTour({ step: 0, finished: true }));
    return () => {
      current = false;
    };
  }, [connector]);

  useEffect(
    () =>
      useTour.subscribe((state, previous) => {
        if (!previous.loaded || !state.progress || state.progress === previous.progress) return;
        connector.workspace.setPreferences({ preferences: { tour: state.progress } }).catch(() => undefined);
      }),
    [connector],
  );

  const open = info !== null;
  useEffect(() => useTour.setState({ documentOpen: open }), [open]);

  const running = useTour((state) => state.running);
  const step = useTour(currentStep);
  const base = useTour((state) => state.base);
  const plannerOpen = usePlanner((state) => state.open);
  const snapshot = useMemo(
    () => (info && document ? tourSnapshot(info.id, document, plannerOpen) : null),
    [info, document, plannerOpen],
  );
  useEffect(() => {
    if (!running || !snapshot) return;
    const { start } = useTour.getState();
    // The factory when the tour (or the step) began, on the document it runs on.
    if (start?.documentId !== snapshot.documentId) {
      useTour.setState({ start: snapshot, base: snapshot });
      return;
    }
    if (base?.documentId !== snapshot.documentId) {
      useTour.setState({ base: snapshot });
      return;
    }
    const id = TOUR_STEPS[step];
    if (id && stepDone(id, start, base, snapshot)) nextStep();
  }, [running, snapshot, step, base]);
}
