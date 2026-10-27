import { describe, expect, it } from "vitest";
import { visibleCentre } from "./view";

describe("visibleCentre", () => {
  it("is the flow position under the middle of the canvas", () => {
    const centre = visibleCentre({ x: 100, y: 50, zoom: 2 }, { width: 800, height: 600 }, { left: 0, right: 0 });
    expect(centre).toEqual({ x: 150, y: 125 });
  });

  it("leaves out what the side panels cover", () => {
    const centre = visibleCentre({ x: 0, y: 0, zoom: 1 }, { width: 1000, height: 600 }, { left: 0, right: 200 });
    expect(centre).toEqual({ x: 400, y: 300 });
  });
});
