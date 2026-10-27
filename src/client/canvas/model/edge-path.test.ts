import { describe, expect, it } from "vitest";
import { flowPath, flowPoints, isBackward } from "./edge-path";

function numbers(path: string): number[] {
  return [...path.matchAll(/-?\d+(\.\d+)?/g)].map((match) => Number(match[0]));
}

const down = { sourceSide: "bottom", targetSide: "top" } as const;

describe("flowPath", () => {
  it("draws a forward flow as one smooth curve from port to port", () => {
    const path = flowPath({ sourceX: 0, sourceY: 0, targetX: 200, targetY: 40 });
    expect(path).toMatch(/^M0,0 C/);
    expect(path).toMatch(/200,40$/);
  });

  it("routes a flow that runs backwards below both nodes, so it never crosses them", () => {
    const path = flowPath({ sourceX: 500, sourceY: 100, targetX: 0, targetY: 60, loopAt: 300 });
    expect(path).toMatch(/^M500,100 /);
    expect(path).toMatch(/0,60$/);
    const ys = numbers(path).filter((_, index) => index % 2 === 1);
    expect(Math.max(...ys)).toBe(300);
  });

  it("leaves the source to the right and enters the target from the left", () => {
    const path = flowPath({ sourceX: 500, sourceY: 100, targetX: 0, targetY: 60, loopAt: 300 });
    const xs = numbers(path).filter((_, index) => index % 2 === 0);
    expect(Math.max(...xs)).toBeGreaterThan(500);
    expect(Math.min(...xs)).toBeLessThan(0);
  });

  it("leaves downwards and enters from above when the flow runs down", () => {
    const path = flowPath({ sourceX: 0, sourceY: 0, targetX: 40, targetY: 200, ...down });
    // The curve's handles sit straight below the source and straight above the target.
    expect(path).toBe("M0,0 C0,100 40,100 40,200");
  });

  it("routes a flow that runs back up to the right of both nodes", () => {
    const path = flowPath({ sourceX: 100, sourceY: 500, targetX: 60, targetY: 0, loopAt: 300, ...down });
    expect(path).toMatch(/^M100,500 /);
    expect(path).toMatch(/60,0$/);
    const coordinates = numbers(path);
    const xs = coordinates.filter((_, index) => index % 2 === 0);
    const ys = coordinates.filter((_, index) => index % 2 === 1);
    expect(Math.max(...xs)).toBe(300);
    expect(Math.max(...ys)).toBeGreaterThan(500);
    expect(Math.min(...ys)).toBeLessThan(0);
  });

  it("bends between a sideways port and one on top", () => {
    const path = flowPath({
      sourceX: 0,
      sourceY: 0,
      targetX: 200,
      targetY: 200,
      sourceSide: "right",
      targetSide: "top",
    });
    expect(path).toBe("M0,0 C100,0 200,100 200,200");
  });
});

describe("flowPoints", () => {
  it("follows the curve, ends included", () => {
    const points = flowPoints({ sourceX: 0, sourceY: 0, targetX: 40, targetY: 200, ...down }, 3);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[1]).toEqual({ x: 20, y: 100 });
    expect(points[2]).toEqual({ x: 40, y: 200 });
  });
});

describe("isBackward", () => {
  it("is true when the target port is left of the source port", () => {
    expect(isBackward({ sourceX: 500, sourceY: 0, targetX: 0, targetY: 0 })).toBe(true);
    expect(isBackward({ sourceX: 0, sourceY: 0, targetX: 500, targetY: 0 })).toBe(false);
  });

  it("is true when a flow that runs down goes back up", () => {
    expect(isBackward({ sourceX: 0, sourceY: 500, targetX: 0, targetY: 0, ...down })).toBe(true);
    expect(isBackward({ sourceX: 500, sourceY: 0, targetX: 0, targetY: 200, ...down })).toBe(false);
  });
});
