// Whether the find panel is open, what it's looking for and which result is highlighted; the Find command (Ctrl+F)
// opens it from anywhere. They live here rather than in the panel, so they stay when a jump takes the canvas into
// another graph (each graph is a canvas of its own, with a panel of its own).
import { create } from "zustand";

export interface FindState {
  open: boolean;
  query: string;
  /** The highlighted result's key (`graph/node`). */
  active: string;
}

export const useFind = create<FindState>(() => ({ open: false, query: "", active: "" }));

export function setFindOpen(open: boolean): void {
  useFind.setState(open ? { open } : { open, query: "", active: "" });
}

export function setFindQuery(query: string): void {
  useFind.setState({ query });
}

export function setFindActive(active: string): void {
  useFind.setState({ active });
}
