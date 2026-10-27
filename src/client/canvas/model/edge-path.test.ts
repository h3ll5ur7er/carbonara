import { describe, expect, it } from "vitest";
import { flowPath, isBackward } from "./edge-path";

function numbers(path: string): number[] {
  return [...path.matchAll(/-?\d+(\.\d+)?/g)].map((match) => Number(match[0]));
}

describe("flowPath", () => {
  it("draws a forward flow as one smooth curve from port to port", () => {
    const path = flowPath({ sourceX: 0, sourceY: 0, targetX: 200, targetY: 40 });
    expect(path).toMatch(/^M0,0 C/);
    expect(path).toMatch(/200,40$/);
  });

  it("routes a flow that runs backwards below both nodes, so it never crosses them", () => {
    const path = flowPath({ sourceX: 500, sourceY: 100, targetX: 0, targetY: 60, below: 300 });
    expect(path).toMatch(/^M500,100 /);
    expect(path).toMatch(/0,60$/);
    const ys = numbers(path).filter((_, index) => index % 2 === 1);
    expect(Math.max(...ys)).toBe(300);
  });

  it("leaves the source to the right and enters the target from the left", () => {
    const path = flowPath({ sourceX: 500, sourceY: 100, targetX: 0, targetY: 60, below: 300 });
    const xs = numbers(path).filter((_, index) => index % 2 === 0);
    expect(Math.max(...xs)).toBeGreaterThan(500);
    expect(Math.min(...xs)).toBeLessThan(0);
  });
});

describe("isBackward", () => {
  it("is true when the target port is left of the source port", () => {
    expect(isBackward(500, 0)).toBe(true);
    expect(isBackward(0, 500)).toBe(false);
  });
});
