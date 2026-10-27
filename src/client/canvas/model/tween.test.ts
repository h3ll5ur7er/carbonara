import { describe, expect, it } from "vitest";
import { tweenAt, tweenDuration } from "./tween";

const durations = { base: 220, slow: 360 };

describe("tweens", () => {
  it("start where the node was and end where the edit put it, easing in between", () => {
    const move = { from: { x: 0, y: 0 }, to: { x: 100, y: -50 } };
    expect(tweenAt(move, 0)).toEqual({ x: 0, y: 0 });
    expect(tweenAt(move, 1)).toEqual({ x: 100, y: -50 });
    expect(tweenAt(move, 0.5)).toEqual({ x: 50, y: -25 });
    expect(tweenAt(move, 0.1).x).toBeLessThan(10);
    expect(tweenAt(move, 2)).toEqual({ x: 100, y: -50 });
  });

  it("take the base duration for short moves, the slow one for long moves, none without a move", () => {
    expect(tweenDuration([{ from: { x: 0, y: 0 }, to: { x: 24, y: 0 } }], durations)).toBe(220);
    expect(tweenDuration([{ from: { x: 0, y: 0 }, to: { x: 400, y: 300 } }], durations)).toBe(360);
    expect(tweenDuration([], durations)).toBe(0);
  });

  it("are instant when the user prefers reduced motion", () => {
    expect(tweenDuration([{ from: { x: 0, y: 0 }, to: { x: 400, y: 0 } }], { base: 0, slow: 0 })).toBe(0);
  });
});
