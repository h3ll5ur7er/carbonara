// The canvas's geometry in flow units: node sizes and where their ports sit. Fixed per node kind and port
// count, so every level of detail and every renderer puts ports, and so edges, in the same place.

/** Grid pitch; the dot grid, snapping and nudging all use it. */
export const GRID = 24;

export const RECIPE_WIDTH = 312;
/** Recipe header: building tile, title, building, machine count. */
export const RECIPE_HEADER = 64;
/** The strip below the header with the machine groups ("4 × 100% + 1 × 37.5%"). */
export const MACHINE_STRIP = 24;
export const PORT_ROW = 28;
/** Space above the first and below the last port row. */
export const PORT_PADDING = 6;

export const TERMINAL_WIDTH = 264;
export const TERMINAL_HEIGHT = 72;

export const JUNCTION_SIZE = 48;

export const NOTE_SIZE = { width: 240, height: 120 };
export const FRAME_SIZE = { width: 480, height: 312 };
/** A collapsed frame: its label bar, two grid steps high. */
export const COLLAPSED_FRAME_HEIGHT = 48;

/** A recipe card with one row per port: its inputs, then its outputs. */
export function recipeHeight(rows: number): number {
  return RECIPE_HEADER + MACHINE_STRIP + PORT_PADDING * 2 + Math.max(rows, 1) * PORT_ROW;
}

/** Vertical centre of a recipe's port row. */
export function portRowCentre(row: number): number {
  return RECIPE_HEADER + MACHINE_STRIP + PORT_PADDING + row * PORT_ROW + PORT_ROW / 2;
}
