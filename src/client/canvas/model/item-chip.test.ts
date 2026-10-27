import { describe, expect, it } from "vitest";
import { hueOf, monogram } from "./item-chip";

describe("monogram", () => {
  it("takes the initials of the first two words", () => {
    expect(monogram("Iron Plate")).toBe("IP");
    expect(monogram("Ferrite Ore")).toBe("FO");
    expect(monogram("Fast Conveyor Belt")).toBe("FC");
  });

  it("takes two letters of a single word", () => {
    expect(monogram("Coal")).toBe("Co");
    expect(monogram("water")).toBe("Wa");
  });

  it("ignores qualifiers in parentheses and punctuation", () => {
    expect(monogram("Iron Plate (Coal Smelting)")).toBe("IP");
    expect(monogram("Mk.2 belt")).toBe("MB");
  });

  it("falls back to a question mark for names without letters or digits", () => {
    expect(monogram("—")).toBe("?");
  });
});

describe("hueOf", () => {
  it("is a stable angle in degrees", () => {
    const hue = hueOf("iron-plate");
    expect(hue).toBe(hueOf("iron-plate"));
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });

  it("tells similar ids apart", () => {
    const ids = ["iron-plate", "copper-plate", "iron-gear", "copper-wire", "circuit", "motor", "ferrite-ore"];
    expect(new Set(ids.map(hueOf)).size).toBe(ids.length);
  });
});
