// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMoveTween } from "./tween";
import type { FlowNode } from "./types";

const node = (id: string, x: number, y: number): FlowNode =>
  ({ id, position: { x, y }, data: { view: {} } }) as unknown as FlowNode;

let frames: FrameRequestCallback[] = [];
let now = 0;

beforeEach(() => {
  frames = [];
  now = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => (frames = []));
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.cssText = "";
});

/** Runs the next animation frame at `time` ms. */
function frameAt(time: number) {
  now = time;
  const pending = frames;
  frames = [];
  act(() => pending.forEach((callback) => callback(time)));
}

function setup() {
  return renderHook(() => {
    const [nodes, setNodes] = useState([node("a", 0, 0), node("b", 5, 5)]);
    return { nodes, glide: useMoveTween(setNodes) };
  });
}

describe("gliding nodes to new places", () => {
  it("moves them over the motion token's duration, through places in between", () => {
    document.documentElement.style.setProperty("--duration-base", "200ms");
    document.documentElement.style.setProperty("--duration-slow", "400ms");
    const { result } = setup();
    act(() => result.current.glide(new Map([["a", { from: { x: 0, y: 0 }, to: { x: 480, y: 0 } }]])));

    frameAt(200);
    const halfway = result.current.nodes[0]?.position.x ?? 0;
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(480);
    frameAt(400);
    expect(result.current.nodes[0]?.position).toEqual({ x: 480, y: 0 });
    expect(result.current.nodes[1]?.position).toEqual({ x: 5, y: 5 });
    expect(frames).toEqual([]);
  });

  it("puts them there at once when the user prefers reduced motion", () => {
    const { result } = setup();
    act(() => result.current.glide(new Map([["a", { from: { x: 0, y: 0 }, to: { x: 480, y: 0 } }]])));
    expect(result.current.nodes[0]?.position).toEqual({ x: 480, y: 0 });
    expect(frames).toEqual([]);
  });
});
