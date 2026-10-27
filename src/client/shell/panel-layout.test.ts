import { describe, expect, it } from "vitest";
import { clampPanelWidth, dragPanelWidth, panelWidths, separatorKey } from "./panel-layout";

const left = panelWidths.left;
const right = panelWidths.right;

describe("clampPanelWidth", () => {
  it("keeps a width between the panel's minimum and maximum", () => {
    expect(clampPanelWidth("left", left.min - 50)).toBe(left.min);
    expect(clampPanelWidth("right", right.max + 50)).toBe(right.max);
    expect(clampPanelWidth("right", right.default)).toBe(right.default);
  });

  it("rounds to whole pixels so borders stay crisp", () => {
    expect(clampPanelWidth("left", left.default + 0.6)).toBe(left.default + 1);
  });
});

describe("dragPanelWidth", () => {
  it("grows the left panel when its edge is dragged right", () => {
    expect(dragPanelWidth("left", 300, 40)).toBe(340);
  });

  it("grows the right panel when its edge is dragged left", () => {
    expect(dragPanelWidth("right", 320, -40)).toBe(360);
  });

  it("stops at the limits", () => {
    expect(dragPanelWidth("right", 320, 1000)).toBe(right.min);
  });
});

describe("separatorKey", () => {
  it("moves the edge with the arrow keys, further with Shift", () => {
    expect(separatorKey("left", 300, { key: "ArrowRight", shiftKey: false })).toEqual({ width: 316 });
    expect(separatorKey("left", 300, { key: "ArrowLeft", shiftKey: true })).toEqual({ width: 236 });
  });

  it("follows the edge's direction on the right side", () => {
    expect(separatorKey("right", 320, { key: "ArrowLeft", shiftKey: false })).toEqual({ width: 336 });
    expect(separatorKey("right", 320, { key: "ArrowRight", shiftKey: false })).toEqual({ width: 304 });
  });

  it("jumps to the limits with Home and End", () => {
    expect(separatorKey("left", 300, { key: "Home", shiftKey: false })).toEqual({ width: left.min });
    expect(separatorKey("left", 300, { key: "End", shiftKey: false })).toEqual({ width: left.max });
  });

  it("collapses the panel with Enter", () => {
    expect(separatorKey("left", 300, { key: "Enter", shiftKey: false })).toEqual({ collapse: true });
  });

  it("ignores other keys", () => {
    expect(separatorKey("left", 300, { key: "a", shiftKey: false })).toBeNull();
  });
});
