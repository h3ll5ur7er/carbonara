// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { focusNodeWhenShown } from "./focus";

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

function addNode(id: string): HTMLElement {
  const node = document.createElement("div");
  node.className = "react-flow__node";
  node.dataset.id = id;
  node.tabIndex = 0;
  document.body.append(node);
  return node;
}

describe("focusNodeWhenShown", () => {
  it("focuses a node that's drawn a few frames later", () => {
    focusNodeWhenShown("wire");
    nextFrame();
    nextFrame();
    const node = addNode("wire");
    nextFrame();
    expect(document.activeElement).toBe(node);
  });

  it("takes the focus back if something drops it on the body right after", () => {
    const node = addNode("wire");
    focusNodeWhenShown("wire");
    nextFrame();
    node.blur();
    nextFrame();
    expect(document.activeElement).toBe(node);
    nextFrame();
    nextFrame();
    expect(frames).toEqual([]);
  });

  it("leaves the focus alone once the person has moved it elsewhere", () => {
    const node = addNode("wire");
    const field = document.createElement("input");
    document.body.append(field);
    focusNodeWhenShown("wire");
    nextFrame();
    field.focus();
    nextFrame();
    expect(document.activeElement).toBe(field);
    expect(node).not.toBe(document.activeElement);
  });

  it("gives up when the node never appears", () => {
    focusNodeWhenShown("missing");
    for (let frame = 0; frame < 200 && frames.length > 0; frame++) nextFrame();
    expect(frames).toEqual([]);
  });

  it("without an id, focuses the first node drawn", () => {
    addNode("input");
    const second = addNode("output");
    focusNodeWhenShown();
    nextFrame();
    expect(document.activeElement).not.toBe(second);
    expect((document.activeElement as HTMLElement).dataset.id).toBe("input");
  });

  it("gives way to a newer request, so two never fight over the focus", () => {
    focusNodeWhenShown();
    focusNodeWhenShown("instance");
    addNode("first");
    const instance = addNode("instance");
    nextFrame();
    nextFrame();
    expect(document.activeElement).toBe(instance);
  });

  it("finds ids that need escaping in a selector", () => {
    const node = addNode('a"b');
    focusNodeWhenShown('a"b');
    nextFrame();
    expect(document.activeElement).toBe(node);
  });
});
