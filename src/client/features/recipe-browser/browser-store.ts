// How the library panel is set up for this session: its tab, the recipe browser's search, grouping, filters and the
// groups the person opened or closed. The recipes people reach for are kept in the preferences instead (memory.ts).
import { create } from "zustand";
import { own } from "../../../utilities/records";
import type { GroupBy } from "./browse";

export type LibraryTab = "recipes" | "blueprints";

interface BrowserState {
  tab: LibraryTab;
  query: string;
  /** The grouping chosen per pack. */
  groupBy: Record<string, GroupBy>;
  /** Groups opened or closed by hand, per pack and grouping (`template/unlock`): the opposite of how they start. */
  toggled: Record<string, string[]>;
  alternates: boolean;
  recycling: boolean;
  /** Counts requests to put the focus in the search field ("Find a recipe"). */
  searchFocus: number;
}

export const useBrowser = create<BrowserState>(() => ({
  tab: "recipes",
  query: "",
  groupBy: {},
  toggled: {},
  alternates: true,
  recycling: false,
  searchFocus: 0,
}));

export function setLibraryTab(tab: LibraryTab): void {
  useBrowser.setState({ tab });
}

export function setQuery(query: string): void {
  useBrowser.setState({ query });
}

export function setGroupBy(packId: string, by: GroupBy): void {
  useBrowser.setState((state) => ({ groupBy: { ...state.groupBy, [packId]: by } }));
}

/** Opens a closed group or closes an open one. */
export function toggleGroup(key: string, id: string): void {
  useBrowser.setState((state) => ({ toggled: { ...state.toggled, [key]: flip(own(state.toggled, key) ?? [], id) } }));
}

export function setFilters(filters: Partial<Pick<BrowserState, "alternates" | "recycling">>): void {
  useBrowser.setState(filters);
}

/** Shows the recipes tab and asks the browser to focus its search field. */
export function findRecipe(): void {
  useBrowser.setState((state) => ({ tab: "recipes", searchFocus: state.searchFocus + 1 }));
}

function flip(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];
}
