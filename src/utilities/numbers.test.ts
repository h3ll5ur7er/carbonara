import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  clean,
  formatFraction,
  formatMachines,
  formatNumber,
  formatPercent,
  rationalise,
  splitMachines,
} from "./numbers";

/**
 * Fractions with small denominators, the kind recipes produce (1/3 per second, 5/8 of a machine).
 * Kept below 4 in size: for larger values the relative tolerance admits other fractions as well.
 */
const fraction = fc
  .integer({ min: 1, max: 1000 })
  .chain((denominator) =>
    fc.integer({ min: -4 * denominator, max: 4 * denominator }).map((numerator) => ({ numerator, denominator })),
  );

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

describe("rationalise", () => {
  it("finds common fractions exactly", () => {
    expect(rationalise(1 / 3)).toEqual({ numerator: 1, denominator: 3 });
    expect(rationalise(2 / 3)).toEqual({ numerator: 2, denominator: 3 });
    expect(rationalise(5 / 8)).toEqual({ numerator: 5, denominator: 8 });
    expect(rationalise(-7 / 60)).toEqual({ numerator: -7, denominator: 60 });
    expect(rationalise(4)).toEqual({ numerator: 4, denominator: 1 });
  });

  it("sees through floating-point noise from the solver", () => {
    expect(rationalise(0.9999999799999998)).toEqual({ numerator: 1, denominator: 1 });
    expect(rationalise(2 / 3 + 3e-9)).toEqual({ numerator: 2, denominator: 3 });
  });

  it("gives up on values no small fraction is close to", () => {
    expect(rationalise(Math.SQRT2)).toBeUndefined();
    expect(rationalise(Number.NaN)).toBeUndefined();
  });

  it("returns every small fraction in lowest terms", () => {
    fc.assert(
      fc.property(fraction, ({ numerator, denominator }) => {
        const divisor = gcd(numerator, denominator) || 1;
        expect(rationalise(numerator / denominator)).toEqual({
          numerator: numerator / divisor + 0,
          denominator: denominator / divisor,
        });
      }),
    );
  });

  it("stays within tolerance of the true value", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (value) => {
        const found = rationalise(value);
        if (found)
          expect(Math.abs(found.numerator / found.denominator - value)).toBeLessThanOrEqual(
            1e-7 * Math.max(1, Math.abs(value)),
          );
      }),
    );
  });
});

describe("clean", () => {
  it("snaps noise to the nearby small fraction or zero", () => {
    expect(clean(0.9999999799999998)).toBe(1);
    expect(clean(1e-12)).toBe(0);
    expect(clean(-1e-12)).toBe(0);
    expect(clean(Math.SQRT2)).toBe(Math.SQRT2);
  });

  it("never moves a value by more than the tolerance", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (value) => {
        expect(Math.abs(clean(value) - value)).toBeLessThanOrEqual(1e-7 * Math.max(1, Math.abs(value)));
      }),
    );
  });
});

describe("formatting numbers", () => {
  it("shows at most four decimals, without trailing zeros", () => {
    expect(formatNumber(12.5)).toBe("12.5");
    expect(formatNumber(2 / 3)).toBe("0.6667");
    expect(formatNumber(0.99999998)).toBe("1");
    expect(formatNumber(-1e-12)).toBe("0");
    expect(formatNumber(1234.5)).toBe("1234.5");
  });

  it("shows fractions where a small one fits", () => {
    expect(formatFraction(2 / 3)).toBe("2/3");
    expect(formatFraction(-5 / 8)).toBe("-5/8");
    expect(formatFraction(7 / 3)).toBe("7/3");
    expect(formatFraction(4)).toBe("4");
    expect(formatFraction(Math.PI)).toBe("3.1416");
  });

  it("shows shares as percentages", () => {
    expect(formatPercent(0.375)).toBe("37.5%");
    expect(formatPercent(2 / 3)).toBe("66.6667%");
    expect(formatPercent(1)).toBe("100%");
  });
});

describe("splitting machine counts", () => {
  it("fills whole machines first and runs the rest in one", () => {
    expect(splitMachines(4.375)).toEqual([
      { machines: 4, share: 1 },
      { machines: 1, share: 0.375 },
    ]);
    expect(formatMachines(4.375)).toBe("4 × 100% + 1 × 37.5%");
  });

  it("runs every machine at the same clock when asked to (even)", () => {
    expect(splitMachines(4.375, "even")).toEqual([{ machines: 5, share: 0.875 }]);
    expect(formatMachines(4.375, "even")).toBe("5 × 87.5%");
    expect(formatMachines(3, "even")).toBe("3 × 100%");
    expect(formatMachines(0.5, "even")).toBe("1 × 50%");
  });

  it("handles whole, partial and zero counts", () => {
    expect(formatMachines(3)).toBe("3 × 100%");
    expect(formatMachines(2.9999999999)).toBe("3 × 100%");
    expect(formatMachines(2 / 3)).toBe("1 × 66.6667%");
    expect(splitMachines(0)).toEqual([]);
  });

  it("adds up to the machine count, with at most one partial machine", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e5, noNaN: true }), (count) => {
        const groups = splitMachines(count);
        const total = groups.reduce((sum, group) => sum + group.machines * group.share, 0);
        expect(Math.abs(total - count)).toBeLessThanOrEqual(1e-7 * Math.max(1, count));
        expect(groups.filter((group) => group.share < 1).length).toBeLessThanOrEqual(1);
        for (const group of groups) {
          expect(Number.isInteger(group.machines) && group.machines > 0).toBe(true);
          expect(group.share > 0 && group.share <= 1).toBe(true);
        }
      }),
    );
  });
});
