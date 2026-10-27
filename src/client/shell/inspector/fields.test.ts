import { describe, expect, it } from "vitest";
import type { FieldDescriptor } from "../../../contracts/plugin";
import { fieldControl, fieldEditLabel } from "./fields";

const clock: FieldDescriptor = {
  kind: "number",
  label: "Clock",
  min: 1,
  max: 250,
  step: 0.0001,
  unit: "%",
  default: 100,
};
const tier: FieldDescriptor = {
  kind: "choice",
  label: "Module tier",
  options: ["none", "speed-1", "speed-2"],
  default: "none",
};
const sloop: FieldDescriptor = { kind: "toggle", label: "Somersloop", default: false };

describe("fieldControl", () => {
  it("renders a number as a slider with a stepper, keeping its range, step and unit", () => {
    expect(fieldControl(clock, 150)).toEqual({
      control: "range",
      value: 150,
      range: { min: 1, max: 250, step: 0.0001 },
      unit: "%",
    });
  });

  it("renders a choice as a select of its options", () => {
    expect(fieldControl(tier, "speed-1")).toEqual({
      control: "select",
      value: "speed-1",
      options: [
        { value: "none", label: "none" },
        { value: "speed-1", label: "speed-1" },
        { value: "speed-2", label: "speed-2" },
      ],
    });
  });

  it("renders a toggle as a switch", () => {
    expect(fieldControl(sloop, true)).toEqual({ control: "switch", value: true });
  });

  it("shows the default when the node has no value yet", () => {
    expect(fieldControl(clock, undefined)).toMatchObject({ value: 100 });
    expect(fieldControl(tier, undefined)).toMatchObject({ value: "none" });
    expect(fieldControl(sloop, undefined)).toMatchObject({ value: false });
  });

  it("shows the default for a value of the wrong kind or a choice that no longer exists", () => {
    expect(fieldControl(clock, "fast")).toMatchObject({ value: 100 });
    expect(fieldControl(tier, "speed-9")).toMatchObject({ value: "none" });
    expect(fieldControl(sloop, 1)).toMatchObject({ value: false });
  });

  it("keeps a stored number inside the range the plugin allows now", () => {
    expect(fieldControl(clock, 400)).toMatchObject({ value: 250 });
  });

  it("leaves out the unit when the field has none", () => {
    expect(fieldControl({ kind: "number", label: "Count", min: 0, max: 10, default: 1 }, 2)).toEqual({
      control: "range",
      value: 2,
      range: { min: 0, max: 10 },
    });
  });
});

describe("fieldEditLabel", () => {
  it("names the undo step after the field and its new value", () => {
    expect(fieldEditLabel(clock, 150)).toBe("Set Clock to 150 %");
    expect(fieldEditLabel(tier, "speed-2")).toBe("Set Module tier to speed-2");
    expect(fieldEditLabel(sloop, true)).toBe("Turn on Somersloop");
    expect(fieldEditLabel(sloop, false)).toBe("Turn off Somersloop");
  });
});
