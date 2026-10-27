// Readable numbers: floating-point noise cleaned up, small fractions recognised, machine counts split
// into buildable groups. The solver's values are accurate to about 1e-8 (docs/Architecture/Solver.md).

/** Relative distance within which a value counts as equal to a fraction. Above the solver's noise. */
const TOLERANCE = 1e-7;
/** Smaller than this is zero. */
const ZERO = 1e-9;

export interface Fraction {
  numerator: number;
  denominator: number;
}

/**
 * The fraction with the smallest denominator (up to `maxDenominator`) among the continued-fraction
 * convergents of `value` that is within tolerance of it, or undefined when there is none.
 */
export function rationalise(value: number, maxDenominator = 1000): Fraction | undefined {
  if (!Number.isFinite(value)) return undefined;
  const tolerance = TOLERANCE * Math.max(1, Math.abs(value));
  // Convergents p/q from the recurrence p(k) = a(k)·p(k-1) + p(k-2), likewise q.
  let [numerator, previousNumerator] = [Math.floor(value), 1];
  let [denominator, previousDenominator] = [1, 0];
  let remainder = value - Math.floor(value);
  for (;;) {
    if (Math.abs(numerator / denominator - value) <= tolerance) {
      return { numerator: numerator + 0, denominator }; // `+ 0` turns -0 into 0
    }
    if (remainder === 0) return undefined;
    const reciprocal = 1 / remainder;
    const term = Math.floor(reciprocal);
    remainder = reciprocal - term;
    [numerator, previousNumerator] = [term * numerator + previousNumerator, numerator];
    [denominator, previousDenominator] = [term * denominator + previousDenominator, denominator];
    if (denominator > maxDenominator) return undefined;
  }
}

/** Snaps noise to zero or to the small fraction the value is meant to be; other values stay as they are. */
export function clean(value: number): number {
  if (Math.abs(value) < ZERO) return 0;
  const fraction = rationalise(value);
  return fraction ? fraction.numerator / fraction.denominator : value;
}

/** At most `digits` decimals, without trailing zeros: `12.5`, `0.6667`. */
export function formatNumber(value: number, digits = 4): string {
  const rounded = Number.parseFloat(clean(value).toFixed(digits));
  return String(rounded + 0);
}

/** `2/3` where a small fraction fits, otherwise a decimal. */
export function formatFraction(value: number): string {
  const fraction = rationalise(value, 100);
  if (!fraction) return formatNumber(value);
  return fraction.denominator === 1 ? String(fraction.numerator) : `${fraction.numerator}/${fraction.denominator}`;
}

/** A share of 1 as a percentage: `37.5%`. */
export function formatPercent(share: number): string {
  return `${formatNumber(share * 100)}%`;
}

export interface MachineGroup {
  machines: number;
  /** How hard each machine of the group runs: 1 is 100%. */
  share: number;
}

/** Whole machines at 100%, then one machine for the rest: 4.375 → 4 × 100% + 1 × 37.5%. */
export function splitMachines(count: number): MachineGroup[] {
  const cleaned = clean(count);
  if (cleaned <= 0) return [];
  const whole = Math.floor(cleaned);
  const rest = cleaned - whole;
  const groups: MachineGroup[] = [];
  if (whole > 0) groups.push({ machines: whole, share: 1 });
  if (rest > 0) groups.push({ machines: 1, share: rest });
  return groups;
}

export function formatMachines(count: number): string {
  return splitMachines(count)
    .map((group) => `${group.machines} × ${formatPercent(group.share)}`)
    .join(" + ");
}
