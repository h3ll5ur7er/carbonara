import { describe, expect, it } from "vitest";
import { templatePack } from "../../scenes/template-pack";
import { choiceOf, formatMachines, formatRate, rateChoices, rateDisplayOf, settingsFor } from "./format";

describe("formatRate", () => {
  it("converts items per second to the display unit", () => {
    expect(formatRate(1.25, "per_minute")).toEqual({ value: "75", unit: "/min" });
    expect(formatRate(2, "per_second")).toEqual({ value: "2", unit: "/s" });
    expect(formatRate(0.5, "per_hour")).toEqual({ value: "1,800", unit: "/h" });
  });

  it("keeps about three significant figures and drops trailing zeros", () => {
    expect(formatRate(0.15625, "per_minute").value).toBe("9.38");
    expect(formatRate(0.4, "per_minute").value).toBe("24");
    expect(formatRate(1 / 3, "per_second").value).toBe("0.33");
    expect(formatRate(12.345, "per_second").value).toBe("12.3");
    expect(formatRate(123.45, "per_second").value).toBe("123");
  });

  it("hides float noise", () => {
    expect(formatRate(0.1 + 0.2, "per_second").value).toBe("0.3");
    expect(formatRate(1e-12, "per_second").value).toBe("0");
  });
});

describe("formatMachines", () => {
  it("splits a fractional count into full machines and one partial machine", () => {
    expect(formatMachines(2.5)).toEqual({ text: "2 × 100% + 1 × 50%", efficiency: 2.5 / 3, count: "2.5" });
    expect(formatMachines(3.75).text).toBe("3 × 100% + 1 × 75%");
  });

  it("shows a single partial machine without a full group", () => {
    expect(formatMachines(0.4375).text).toBe("1 × 43.75%");
  });

  it("shows whole counts as one group running at full speed", () => {
    expect(formatMachines(4)).toEqual({ text: "4 × 100%", efficiency: 1, count: "4" });
    expect(formatMachines(2.9999999999).text).toBe("3 × 100%");
  });

  it("calls a node without machines idle", () => {
    expect(formatMachines(0)).toEqual({ text: "Idle", efficiency: 0, count: "0" });
  });
});

describe("rates in belts", () => {
  const display = {
    unit: "per_minute" as const,
    belt: { name: "Fast Conveyor", form: "solid" as const, perSecond: 0.5 },
  };

  it("counts the belts of the document's chosen tier that the rate fills", () => {
    expect(formatRate(1, display, "solid")).toEqual({ value: "2", unit: " × Fast Conveyor" });
    expect(formatRate(0.125, display, "solid")).toEqual({ value: "0.25", unit: " × Fast Conveyor" });
  });

  it("takes the belt's capacity from the pack, in the pack's unit", () => {
    expect(rateDisplayOf({ belt: "conveyor-2" }, templatePack)).toEqual({
      unit: "per_second",
      belt: { name: "Fast Conveyor", form: "solid", perSecond: 30 },
    });
    expect(rateDisplayOf({ rateUnit: "per_hour", belt: "gone" }, templatePack)).toEqual({ unit: "per_hour" });
  });

  it("keeps the rate unit for items the belt doesn't carry, or when the item's form isn't known", () => {
    expect(formatRate(1, display, "fluid")).toEqual({ value: "60", unit: "/min" });
    expect(formatRate(1, display)).toEqual({ value: "60", unit: "/min" });
  });
});

describe("choosing the unit", () => {
  it("offers the rate units and every belt and pipe of the pack", () => {
    expect(rateChoices(templatePack).map((choice) => choice.label)).toEqual([
      "/s",
      "/min",
      "/h",
      "× Conveyor",
      "× Fast Conveyor",
      "× Pipe",
    ]);
  });

  it("turns a choice into settings and back", () => {
    expect(settingsFor("per_hour")).toEqual({ rateUnit: "per_hour", belt: null });
    expect(settingsFor("belt:conveyor-2")).toEqual({ belt: "conveyor-2" });
    expect(choiceOf({ rateUnit: "per_hour" }, templatePack)).toBe("per_hour");
    expect(choiceOf({ belt: "pipe" }, templatePack)).toBe("belt:pipe");
    expect(choiceOf({}, templatePack)).toBe("per_second");
  });
});

describe("machines rounded to buildable", () => {
  it("spreads the work evenly over the machines that have to be built", () => {
    expect(formatMachines(4.375, "even")).toEqual({ text: "5 × 87.5%", efficiency: 0.875, count: "4.38" });
    expect(formatMachines(4, "even").text).toBe("4 × 100%");
    expect(formatMachines(0.5, "even").text).toBe("1 × 50%");
  });
});
