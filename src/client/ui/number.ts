// Hides how numbers are typed, nudged and shown in number fields: parsing, precision, clamping and step snapping.

/** The values a number field accepts. Without a step, any value is kept to four decimals. */
export interface NumberRange {
  min: number;
  max: number;
  step?: number;
  /** How far an arrow-key press moves, for fields whose range is open-ended; derived from the range otherwise. */
  nudge?: number;
}

const anyStep = 0.0001;

/** How many decimals a step allows: 0.25 → 2, 1e-7 → 7. */
export function decimalsOf(step: number): number {
  const [mantissa = "", exponent] = String(step).split("e");
  const decimals = mantissa.split(".")[1]?.length ?? 0;
  return Math.max(0, decimals - Number(exponent ?? 0));
}

/** A value as the user reads and types it: no trailing zeros, no float noise, at most the step's decimals. */
export function formatNumber(value: number, step = anyStep): string {
  const rounded = roundTo(value, decimalsOf(step));
  return String(rounded === 0 ? 0 : rounded);
}

const leadingNumber = /^[+-]?(?:\d+[.,]?\d*|[.,]\d+)(?:e[+-]?\d+)?/i;

/** The number at the start of the text, ignoring a unit typed after it; null when there is none. */
export function parseNumber(text: string): number | null {
  const match = leadingNumber.exec(text.trim());
  return match ? Number(match[0].replace(",", ".")) : null;
}

/** How far one arrow-key press moves: about a hundredth of the range, a power of ten, and at least the step. */
export function nudgeIncrement({ min, max, step = anyStep, nudge }: NumberRange): number {
  if (nudge !== undefined) return Math.max(step, nudge);
  const span = max - min;
  return span > 0 ? Math.max(step, 10 ** Math.floor(Math.log10(span / 100))) : step;
}

/** The value one press up or down away; `large` (Shift, Page Up/Down) moves ten times as far. */
export function stepNumber(value: number, direction: 1 | -1, range: NumberRange, large: boolean): number {
  return fit(value + direction * nudgeIncrement(range) * (large ? 10 : 1), range);
}

/** What typed text becomes once committed: inside the range, on the step grid; null when it isn't a number. */
export function commitNumber(text: string, range: NumberRange): number | null {
  const value = parseNumber(text);
  return value === null ? null : fit(value, range);
}

export type NumberKeyAction =
  { type: "step"; direction: 1 | -1; large: boolean } | { type: "commit" } | { type: "revert" };

/** What a key does in a number field (the spinbutton pattern); null leaves the key to the text field. */
export function numberKeyAction({ key, shiftKey }: { key: string; shiftKey: boolean }): NumberKeyAction | null {
  switch (key) {
    case "ArrowUp":
      return { type: "step", direction: 1, large: shiftKey };
    case "ArrowDown":
      return { type: "step", direction: -1, large: shiftKey };
    case "PageUp":
      return { type: "step", direction: 1, large: true };
    case "PageDown":
      return { type: "step", direction: -1, large: true };
    case "Enter":
      return { type: "commit" };
    case "Escape":
      return { type: "revert" };
    default:
      return null;
  }
}

/** Clamps a value into the range and snaps it to the step grid, which starts at `min`. */
export function fit(value: number, { min, max, step = anyStep }: NumberRange): number {
  const clamped = clamp(value, min, max);
  const snapped = min + Math.round((clamped - min) / step) * step;
  return roundTo(clamp(snapped, min, max), Math.max(decimalsOf(step), decimalsOf(min)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  return Number(value.toFixed(Math.min(decimals, 100)));
}
