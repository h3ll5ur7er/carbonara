// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rememberFocus } from "./focus-return";

let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  frames = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function nextFrame() {
  const pending = frames;
  frames = [];
  for (const callback of pending) callback(0);
}

function button(name: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.textContent = name;
  document.body.append(element);
  return element;
}

describe("rememberFocus", () => {
  it("gives the focus back when what closed took it with it", () => {
    const opener = button("Plan");
    opener.focus();
    const giveBack = rememberFocus();
    const inside = button("Done");
    inside.focus();
    inside.remove();
    giveBack();
    nextFrame();
    expect(document.activeElement).toBe(opener);
  });

  it("leaves the focus where the person put it", () => {
    button("Plan").focus();
    const giveBack = rememberFocus();
    const elsewhere = button("Inspector field");
    elsewhere.focus();
    giveBack();
    nextFrame();
    expect(document.activeElement).toBe(elsewhere);
  });

  it("does nothing when what had the focus is gone too", () => {
    const opener = button("Plan");
    opener.focus();
    const giveBack = rememberFocus();
    opener.remove();
    giveBack();
    nextFrame();
    expect(document.activeElement).toBe(document.body);
  });
});
