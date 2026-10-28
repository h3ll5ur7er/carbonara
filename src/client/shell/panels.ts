// Which side panels are on screen and how wide they are, shared by the panels, the top bar, the canvas and the
// overlays that keep clear of them. The person opens and closes each panel; the panels show only while a factory is
// open (the welcome has no library to browse and nothing to inspect, CARB-116), and come back as the person left them.
// Kept in memory for the session until the preferences access component can persist the layout.
import { create } from "zustand";
import { clampPanelWidth, panelWidths, type PanelSide } from "./panel-layout";

export interface PanelState {
  /** Whether it's on screen. */
  open: boolean;
  width: number;
}

interface PanelsState extends Record<PanelSide, PanelState> {
  /** Whether the person wants each panel open. */
  chosen: Record<PanelSide, boolean>;
  /** Whether a factory is open for the panels to work on. */
  factoryOpen: boolean;
}

export const usePanels = create<PanelsState>(() => ({
  left: { open: true, width: panelWidths.left.default },
  right: { open: true, width: panelWidths.right.default },
  chosen: { left: true, right: true },
  factoryOpen: true,
}));

/** The panels as the person's choice and an open factory make them. */
function shown(state: PanelsState, chosen: Record<PanelSide, boolean>, factoryOpen: boolean): Partial<PanelsState> {
  return {
    chosen,
    factoryOpen,
    left: { ...state.left, open: factoryOpen && chosen.left },
    right: { ...state.right, open: factoryOpen && chosen.right },
  };
}

export function setPanelOpen(side: PanelSide, open: boolean): void {
  usePanels.setState((state) => shown(state, { ...state.chosen, [side]: open }, state.factoryOpen));
}

export function togglePanel(side: PanelSide): void {
  setPanelOpen(side, !usePanels.getState().chosen[side]);
}

/** A factory was opened, or the last one closed (the shell says). */
export function setFactoryOpen(factoryOpen: boolean): void {
  if (usePanels.getState().factoryOpen === factoryOpen) return;
  usePanels.setState((state) => shown(state, state.chosen, factoryOpen));
}

export function setPanelWidth(side: PanelSide, width: number): void {
  usePanels.setState((panels) => ({ [side]: { ...panels[side], width: clampPanelWidth(side, width) } }));
}
