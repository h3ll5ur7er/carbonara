// Whether the find panel is open; the Find command (Ctrl+F) opens it from anywhere.
import { create } from "zustand";

export const useFind = create<{ open: boolean }>(() => ({ open: false }));

export function setFindOpen(open: boolean): void {
  useFind.setState({ open });
}
