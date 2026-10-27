// Which side panels are open and how wide they are, shared by the panels, the top bar and the command palette.
// Kept in memory for the session until the preferences access component can persist the layout.
import { create } from "zustand";
import { clampPanelWidth, panelWidths, type PanelSide } from "./panel-layout";

export interface PanelState {
  open: boolean;
  width: number;
}

export const usePanels = create<Record<PanelSide, PanelState>>(() => ({
  left: { open: false, width: panelWidths.left.default },
  right: { open: true, width: panelWidths.right.default },
}));

export function setPanelOpen(side: PanelSide, open: boolean): void {
  usePanels.setState((panels) => ({ [side]: { ...panels[side], open } }));
}

export function togglePanel(side: PanelSide): void {
  setPanelOpen(side, !usePanels.getState()[side].open);
}

export function setPanelWidth(side: PanelSide, width: number): void {
  usePanels.setState((panels) => ({ [side]: { ...panels[side], width: clampPanelWidth(side, width) } }));
}
