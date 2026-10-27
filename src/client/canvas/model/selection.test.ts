import { describe, expect, it } from "vitest";
import { insideLasso, nudgeOffset } from "./selection";

describe("insideLasso", () => {
  const triangle = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 0, y: 200 },
  ];

  it("selects nodes whose centre lies inside the drawn shape", () => {
    const nodes = [
      { id: "in", x: 10, y: 10, width: 40, height: 40 },
      { id: "out", x: 150, y: 150, width: 40, height: 40 },
      { id: "straddling", x: 80, y: 80, width: 60, height: 60 }, // centre 110,110: outside the hypotenuse
    ];
    expect(insideLasso(nodes, triangle)).toEqual(["in"]);
  });

  it("selects nothing with fewer than three points", () => {
    expect(insideLasso([{ id: "a", x: 0, y: 0, width: 10, height: 10 }], triangle.slice(0, 2))).toEqual([]);
  });
});

describe("nudgeOffset", () => {
  const plain = { shiftKey: false, altKey: false };

  it("moves one grid step per arrow key", () => {
    expect(nudgeOffset("ArrowRight", plain, 24)).toEqual({ x: 24, y: 0 });
    expect(nudgeOffset("ArrowUp", plain, 24)).toEqual({ x: 0, y: -24 });
  });

  it("moves four steps with Shift and one unit with Alt", () => {
    expect(nudgeOffset("ArrowLeft", { shiftKey: true, altKey: false }, 24)).toEqual({ x: -96, y: 0 });
    expect(nudgeOffset("ArrowDown", { shiftKey: false, altKey: true }, 24)).toEqual({ x: 0, y: 1 });
  });

  it("ignores other keys", () => {
    expect(nudgeOffset("a", plain, 24)).toBeUndefined();
  });
});
