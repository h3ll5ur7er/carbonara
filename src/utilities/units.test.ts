import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatRate, fromPerSecond, toPerSecond } from "./units";

describe("rate units", () => {
  it("converts a pack's rates to items per second", () => {
    expect(toPerSecond(60, "per_minute")).toBe(1);
    expect(toPerSecond(3600, "per_hour")).toBe(1);
    expect(toPerSecond(15, "per_second")).toBe(15);
  });

  it("converts items per second to the unit the user reads", () => {
    expect(fromPerSecond(0.5, "per_minute")).toBe(30);
    expect(fromPerSecond(1 / 3, "per_hour")).toBeCloseTo(1200, 9);
  });

  it("round-trips", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e6, noNaN: true }),
        fc.constantFrom("per_second", "per_minute", "per_hour" as const),
        (value, unit) => {
          expect(fromPerSecond(toPerSecond(value, unit), unit)).toBeCloseTo(value, 6);
        },
      ),
    );
  });

  it("formats rates with their unit", () => {
    expect(formatRate(12.5 / 60, "per_minute")).toBe("12.5/min");
    expect(formatRate(1 / 3, "per_second")).toBe("0.3333/s");
    expect(formatRate(20 / 60, "per_minute")).toBe("20/min");
    expect(formatRate(1, "per_hour")).toBe("3600/h");
  });
});
