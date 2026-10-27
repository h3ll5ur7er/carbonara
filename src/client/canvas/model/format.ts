// Hides how rates and machine counts read on the canvas. A stand-in until the rational display and the
// buildable-group splitting of CARB-13 exist as utilities; the canvas then swaps these for them.
import type { RateUnit } from "../../../contracts/pack";

const SECONDS_PER: Record<RateUnit, number> = { per_second: 1, per_minute: 60, per_hour: 3600 };
const SUFFIX: Record<RateUnit, string> = { per_second: "/s", per_minute: "/min", per_hour: "/h" };

/** Values this close to an integer are that integer: solver results carry float noise. */
const EPSILON = 1e-6;

export interface FormattedRate {
  value: string;
  unit: string;
}

/** Items per second in the document's display unit, with about three significant figures. */
export function formatRate(perSecond: number, unit: RateUnit): FormattedRate {
  return { value: formatNumber(perSecond * SECONDS_PER[unit]), unit: SUFFIX[unit] };
}

export interface FormattedMachines {
  /** "4 × 100% + 1 × 37.5%". */
  text: string;
  /** How busy the machines that have to be built are, 0–1: drives the efficiency ring. */
  efficiency: number;
  /** The plain count, for compact cards. */
  count: string;
}

export function formatMachines(count: number): FormattedMachines {
  const rounded = Math.round(count);
  const whole = Math.abs(count - rounded) < EPSILON ? rounded : Math.floor(count);
  const partial = Math.abs(count - rounded) < EPSILON ? 0 : count - whole;
  if (whole === 0 && partial === 0) return { text: "Idle", efficiency: 0, count: "0" };

  const groups = [];
  if (whole > 0) groups.push(`${whole} × 100%`);
  if (partial > 0) groups.push(`1 × ${trimZeros((partial * 100).toFixed(2))}%`);
  const built = whole + (partial > 0 ? 1 : 0);
  return { text: groups.join(" + "), efficiency: (whole + partial) / built, count: formatNumber(count) };
}

/** About three significant figures, thousands separated, no trailing zeros. */
export function formatNumber(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude < EPSILON) return "0";
  const decimals = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2;
  const fixed = trimZeros(value.toFixed(decimals));
  const [integer = "0", fraction] = fixed.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function trimZeros(fixed: string): string {
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}
