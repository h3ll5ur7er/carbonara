// Which subgraph each open document shows (the path of instances opened from its root graph), kept for the session
// so switching tabs comes back to the same place, and the open and leave actions the app's commands run.
import { create } from "zustand";
import type { Viewport } from "../../canvas/adapter";
import type { Crumb } from "./path";

/** An opened instance, with the views to animate between when it's left again. */
export interface Opened extends Crumb {
  /** The view of the graph above before diving in. */
  above?: Viewport | undefined;
  /** The view of the graph above zoomed into the instance: where leaving starts from. */
  into?: Viewport | undefined;
}

const NONE: readonly Opened[] = [];

export const useSubgraphs = create<{ paths: Record<string, readonly Opened[]> }>(() => ({ paths: {} }));

export function pathOf(documentId: string): readonly Opened[] {
  return useSubgraphs.getState().paths[documentId] ?? NONE;
}

export function setPath(documentId: string, path: readonly Opened[]): void {
  useSubgraphs.setState(({ paths }) => ({ paths: { ...paths, [documentId]: path } }));
}

/** What the commands reach of the subgraphs on screen; set by the live app while a document is shown. */
export interface SubgraphNavigation {
  /** Goes up one level. */
  leave(): void;
}

let navigation: SubgraphNavigation | undefined;

export function subgraphNavigation(): SubgraphNavigation | undefined {
  return navigation;
}

export function setSubgraphNavigation(next: SubgraphNavigation | undefined): void {
  navigation = next;
}
