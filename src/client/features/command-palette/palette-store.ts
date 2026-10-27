// Whether the command palette is open; the `palette.toggle` command and the top bar's search button change it.
import { create } from "zustand";

export const usePalette = create<{ open: boolean }>(() => ({ open: false }));

export function setPaletteOpen(open: boolean): void {
  usePalette.setState({ open });
}

export function togglePalette(): void {
  setPaletteOpen(!usePalette.getState().open);
}
