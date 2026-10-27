import { describe, expect, it } from "vitest";
import { formatMachines, formatRate } from "./format";

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
