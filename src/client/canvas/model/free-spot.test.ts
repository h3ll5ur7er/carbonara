import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { freeSpot } from "./free-spot";
import type { Rect } from "./snap";

const grid = 24;
const rect = (x: number, y: number, width = 240, height = 120): Rect => ({ x, y, width, height });

function overlaps(a: Rect, b: Rect, margin: number) {
  return (
    a.x < b.x + b.width + margin &&
    b.x < a.x + a.width + margin &&
    a.y < b.y + b.height + margin &&
    b.y < a.y + a.height + margin
  );
}

describe("freeSpot", () => {
  it("keeps the wanted spot when it is free", () => {
    expect(freeSpot(rect(48, 72), [rect(600, 600)], grid)).toEqual({ x: 48, y: 72 });
  });

  it("moves a node off one that is in the way, as little as it can", () => {
    const spot = freeSpot(rect(0, 0), [rect(0, 0)], grid);
    expect(overlaps({ ...rect(0, 0), ...spot }, rect(0, 0), grid - 1)).toBe(false);
    // Just below the node in the way, one grid step clear of it.
    expect(spot).toEqual({ x: 0, y: 144 });
  });

  it("never lands on any node, however crowded the canvas", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: -20, max: 20 }), fc.integer({ min: -20, max: 20 })), { maxLength: 40 }),
        fc.integer({ min: -400, max: 400 }),
        fc.integer({ min: -400, max: 400 }),
        (cells, x, y) => {
          const others = cells.map(([column, row]) => rect(column * 96, row * 72, 80, 60));
          const wanted = rect(x, y, 200, 100);
          const spot = freeSpot(wanted, others, grid);
          for (const other of others) expect(overlaps({ ...wanted, ...spot }, other, grid - 1)).toBe(false);
        },
      ),
    );
  });
});
