import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { snapDrag, type Rect } from "./snap";

const options = { grid: 24, threshold: 6 };
const rect = (x: number, y: number, width = 100, height = 60): Rect => ({ x, y, width, height });

describe("snapDrag", () => {
  it("snaps to the grid when nothing is near enough to align with", () => {
    expect(snapDrag(rect(50, 70), [], options)).toMatchObject({ x: 48, y: 72, guides: [], gaps: [] });
  });

  it("lines a node's left edge up with a neighbour's, and shows a guide through both", () => {
    const other = rect(203, 0);
    const snapped = snapDrag(rect(205, 312), [other], options);
    expect(snapped.x).toBe(203);
    expect(snapped.guides).toContainEqual({ axis: "x", at: 203, from: 0, to: 372 });
  });

  it("aligns centres and opposite edges too", () => {
    const other = rect(0, 101, 100, 80); // centre y 141
    expect(snapDrag(rect(400, 112), [other], options).y).toBe(111); // centre 141
    expect(snapDrag(rect(102, 500), [rect(0, 0)], options).x).toBe(100); // left onto right
  });

  it("prefers the nearest alignment over the grid", () => {
    expect(snapDrag(rect(205, 300), [rect(203, 0)], options).x).toBe(203);
    expect(snapDrag(rect(205, 300), [rect(213, 0)], options).x).toBe(216);
  });

  it("spaces a node evenly between two neighbours in its row and shows both gaps", () => {
    const left = rect(0, 0);
    const right = rect(300, 0);
    const snapped = snapDrag(rect(147, 5), [left, right], options); // even: x = 150, gaps of 50
    expect(snapped.x).toBe(150);
    expect(snapped.gaps).toEqual([
      { axis: "x", from: 100, to: 150, at: expect.any(Number) },
      { axis: "x", from: 250, to: 300, at: expect.any(Number) },
    ]);
  });

  it("repeats the gap between the two neighbours before it", () => {
    const first = rect(0, 0);
    const second = rect(140, 0); // gap 40
    const snapped = snapDrag(rect(283, 0), [first, second], options);
    expect(snapped.x).toBe(280);
    expect(snapped.gaps).toHaveLength(2);
  });

  it("ignores nodes outside the row for spacing", () => {
    const snapped = snapDrag(rect(147, 500), [rect(0, 0), rect(300, 0)], options);
    expect(snapped.gaps).toEqual([]);
  });

  it("never moves a node further than the threshold or half a grid step", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -2000, max: 2000 }),
        fc.integer({ min: -2000, max: 2000 }),
        fc.array(fc.record({ x: fc.integer({ min: -2000, max: 2000 }), y: fc.integer({ min: -2000, max: 2000 }) }), {
          maxLength: 8,
        }),
        (x, y, others) => {
          const snapped = snapDrag(
            rect(x, y),
            others.map((other) => rect(other.x, other.y)),
            options,
          );
          const limit = Math.max(options.threshold, options.grid / 2);
          expect(Math.abs(snapped.x - x)).toBeLessThanOrEqual(limit);
          expect(Math.abs(snapped.y - y)).toBeLessThanOrEqual(limit);
        },
      ),
    );
  });
});
