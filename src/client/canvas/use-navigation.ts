// Back, forward and viewport bookmarks for the document on screen (model/navigation.ts has the rules). Kept per
// document for the session, so switching tabs keeps each factory's places.
import { useCallback, useMemo, useRef } from "react";
import { toast } from "../shell/toasts";
import type { Viewport } from "./adapter";
import { back, bookmark, forward, freeSlot, startNavigation, visit, type Navigation } from "./model/navigation";
import { canvasActions } from "./viewport";

const navigations = new Map<string, Navigation>();

export interface NavigationActions {
  /** Saves the view in the first free bookmark slot. */
  bookmarkView(): void;
  goToBookmark(slot: number): void;
  back(): void;
  forward(): void;
}

export function useNavigation(documentId: string) {
  /** The view a jump is heading for: when it settles there, it's the jump's end, not a new place. */
  const heading = useRef<Viewport | undefined>(undefined);
  const save = useCallback((next: Navigation) => navigations.set(documentId, next), [documentId]);

  const onViewSettled = useCallback(
    (viewport: Viewport, size: { width: number; height: number }) => {
      const current = navigations.get(documentId) ?? startNavigation();
      const target = heading.current;
      heading.current = undefined;
      const arrived = target && Math.abs(target.x - viewport.x) < 1 && Math.abs(target.y - viewport.y) < 1;
      save(arrived ? { ...current, current: viewport } : visit(current, viewport, size));
    },
    [documentId, save],
  );

  const actions = useMemo((): NavigationActions => {
    const go = (step: typeof back) => {
      const { state: next, target } = step(navigations.get(documentId) ?? startNavigation());
      if (!target) return;
      save(next);
      heading.current = target;
      canvasActions()?.goTo(target);
    };
    return {
      bookmarkView() {
        const view = canvasActions()?.view();
        if (!view) return;
        const current = navigations.get(documentId) ?? startNavigation();
        const slot = freeSlot(current);
        save(bookmark(current, slot, view.viewport));
        toast({ tone: "success", title: `Saved as bookmark ${slot}`, description: `Press ${slot} to come back here.` });
      },
      goToBookmark(slot) {
        const target = (navigations.get(documentId) ?? startNavigation()).bookmarks[slot];
        if (!target) {
          toast({ title: `No bookmark ${slot} yet`, description: "Bookmark a view with Shift+B." });
          return;
        }
        canvasActions()?.goTo(target);
      },
      back: () => go(back),
      forward: () => go(forward),
    };
  }, [documentId, save]);

  return { onViewSettled, actions };
}
