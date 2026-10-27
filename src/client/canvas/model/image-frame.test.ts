import { describe, expect, it } from "vitest";
import { imageFrame } from "./image-frame";

describe("imageFrame", () => {
  it("shows the whole graph at real size with a margin", () => {
    expect(imageFrame({ x: 100, y: -50, width: 800, height: 400 }, 48, 4096)).toEqual({
      width: 896,
      height: 496,
      viewport: { x: -52, y: 98, zoom: 1 },
    });
  });

  it("scales a large graph down so its longest side fits", () => {
    const frame = imageFrame({ x: 0, y: 0, width: 8000, height: 2000 }, 0, 4000);
    expect(frame).toEqual({ width: 4000, height: 1000, viewport: { x: 0, y: 0, zoom: 0.5 } });
  });

  it("makes a small image for an empty graph", () => {
    expect(imageFrame({ x: 0, y: 0, width: 0, height: 0 }, 48, 4096)).toMatchObject({ width: 96, height: 96 });
  });
});
