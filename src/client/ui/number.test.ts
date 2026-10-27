import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  commitNumber,
  decimalsOf,
  formatNumber,
  nudgeIncrement,
  numberKeyAction,
  parseNumber,
  stepNumber,
} from "./number";

const clock = { min: 1, max: 250, step: 0.0001 };

describe("decimalsOf", () => {
  it("counts the decimals a step allows", () => {
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(5)).toBe(0);
    expect(decimalsOf(0.5)).toBe(1);
    expect(decimalsOf(0.25)).toBe(2);
    expect(decimalsOf(0.0001)).toBe(4);
    expect(decimalsOf(1e-7)).toBe(7);
  });
});

describe("formatNumber", () => {
  it("shows as many decimals as the value needs, up to the step's precision", () => {
    expect(formatNumber(100, 0.0001)).toBe("100");
    expect(formatNumber(37.5, 0.0001)).toBe("37.5");
    expect(formatNumber(1 / 3, 0.01)).toBe("0.33");
    expect(formatNumber(2, 0.5)).toBe("2");
  });

  it("hides floating-point noise", () => {
    expect(formatNumber(0.1 + 0.2, 0.0001)).toBe("0.3");
  });

  it("never writes a negative zero", () => {
    expect(formatNumber(-0.00001, 0.01)).toBe("0");
  });
});

describe("parseNumber", () => {
  it("reads plain and signed decimals", () => {
    expect(parseNumber("42")).toBe(42);
    expect(parseNumber(" -3.25 ")).toBe(-3.25);
    expect(parseNumber(".5")).toBe(0.5);
  });

  it("accepts a decimal comma", () => {
    expect(parseNumber("37,5")).toBe(37.5);
  });

  it("ignores a unit typed after the number", () => {
    expect(parseNumber("150 %")).toBe(150);
    expect(parseNumber("2.5/min")).toBe(2.5);
  });

  it("reads exponents, which is how very large and very small numbers print", () => {
    expect(parseNumber("1e-7")).toBe(1e-7);
    expect(parseNumber("2.5e+21")).toBe(2.5e21);
  });

  it("rejects text that does not start with a number", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("%5")).toBeNull();
  });
});

describe("nudgeIncrement", () => {
  it("moves about a hundredth of the range per key press, rounded to a power of ten", () => {
    expect(nudgeIncrement(clock)).toBe(1);
    expect(nudgeIncrement({ min: 0, max: 1, step: 0.01 })).toBe(0.01);
    expect(nudgeIncrement({ min: 0, max: 10000, step: 1 })).toBe(100);
  });

  it("never moves less than the step", () => {
    expect(nudgeIncrement({ min: 0, max: 10, step: 0.5 })).toBe(0.5);
  });
});

describe("stepNumber", () => {
  it("moves by the nudge increment, ten times as far for a large step", () => {
    expect(stepNumber(100, 1, clock, false)).toBe(101);
    expect(stepNumber(100, -1, clock, true)).toBe(90);
  });

  it("stays within the range", () => {
    expect(stepNumber(249.5, 1, clock, true)).toBe(250);
    expect(stepNumber(1.5, -1, clock, false)).toBe(1);
  });

  it("lands on the step grid", () => {
    expect(stepNumber(0.3, 1, { min: 0, max: 10, step: 0.25 }, false)).toBe(0.5);
  });
});

describe("numberKeyAction", () => {
  it("steps with the arrow keys, further with Shift or Page Up and Down", () => {
    expect(numberKeyAction({ key: "ArrowUp", shiftKey: false })).toEqual({ type: "step", direction: 1, large: false });
    expect(numberKeyAction({ key: "ArrowDown", shiftKey: true })).toEqual({ type: "step", direction: -1, large: true });
    expect(numberKeyAction({ key: "PageUp", shiftKey: false })).toEqual({ type: "step", direction: 1, large: true });
    expect(numberKeyAction({ key: "PageDown", shiftKey: false })).toEqual({ type: "step", direction: -1, large: true });
  });

  it("commits with Enter and reverts with Escape", () => {
    expect(numberKeyAction({ key: "Enter", shiftKey: false })).toEqual({ type: "commit" });
    expect(numberKeyAction({ key: "Escape", shiftKey: false })).toEqual({ type: "revert" });
  });

  it("leaves every other key to the text field, including Home and End for the caret", () => {
    expect(numberKeyAction({ key: "5", shiftKey: false })).toBeNull();
    expect(numberKeyAction({ key: "ArrowLeft", shiftKey: false })).toBeNull();
    expect(numberKeyAction({ key: "Home", shiftKey: false })).toBeNull();
  });
});

describe("commitNumber", () => {
  it("clamps and snaps what was typed", () => {
    expect(commitNumber("300", clock)).toBe(250);
    expect(commitNumber("0", clock)).toBe(1);
    expect(commitNumber("37.51234", clock)).toBe(37.5123);
  });

  it("returns null for text that isn't a number", () => {
    expect(commitNumber("fast", clock)).toBeNull();
  });

  it("always yields a value inside the range on the step grid", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (typed) => {
        const value = commitNumber(String(typed), clock);
        expect(value).not.toBeNull();
        expect(value).toBeGreaterThanOrEqual(clock.min);
        expect(value).toBeLessThanOrEqual(clock.max);
        expect(formatNumber(value ?? 0, clock.step)).toBe(String(value));
      }),
    );
  });
});
