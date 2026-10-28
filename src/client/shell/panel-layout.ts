// Hides the geometry of the side panels: their width limits and how dragging or the keyboard resizes them.

export type PanelSide = "left" | "right";

/** Widths in CSS pixels. The left panel lists recipes and blueprints, the right one (the inspector) holds controls. */
export const panelWidths: Record<PanelSide, { min: number; default: number; max: number }> = {
  left: { min: 240, default: 304, max: 440 },
  right: { min: 280, default: 320, max: 480 },
};

/** One arrow-key press moves the edge by a grid step; Shift moves four. */
const keyStep = 16;
const largeKeyStep = 64;

export function clampPanelWidth(side: PanelSide, width: number): number {
  const { min, max } = panelWidths[side];
  return Math.round(Math.min(max, Math.max(min, width)));
}

/** The width after dragging the panel's inner edge `deltaX` pixels (positive is to the right). */
export function dragPanelWidth(side: PanelSide, startWidth: number, deltaX: number): number {
  return clampPanelWidth(side, side === "left" ? startWidth + deltaX : startWidth - deltaX);
}

export type SeparatorAction = { width: number } | { collapse: true };

/** What a key does on a panel's resize handle (the window splitter pattern); null for other keys. */
export function separatorKey(
  side: PanelSide,
  width: number,
  { key, shiftKey }: { key: string; shiftKey: boolean },
): SeparatorAction | null {
  const step = shiftKey ? largeKeyStep : keyStep;
  switch (key) {
    case "ArrowLeft":
      return { width: dragPanelWidth(side, width, -step) };
    case "ArrowRight":
      return { width: dragPanelWidth(side, width, step) };
    case "Home":
      return { width: panelWidths[side].min };
    case "End":
      return { width: panelWidths[side].max };
    case "Enter":
      return { collapse: true };
    default:
      return null;
  }
}
