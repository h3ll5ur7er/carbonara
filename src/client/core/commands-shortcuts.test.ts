import { describe, expect, it } from "vitest";
import { formatShortcut, isEditableTarget, matchesShortcut, parseShortcut, platformOf } from "./commands-shortcuts";

const key = (
  name: string,
  modifiers: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {},
) => ({ key: name, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers });

describe("parseShortcut", () => {
  it("splits modifiers from the key", () => {
    expect(parseShortcut("Mod+Shift+K")).toEqual({ key: "k", mod: true, shift: true, alt: false });
    expect(parseShortcut("F")).toEqual({ key: "f", mod: false, shift: false, alt: false });
    expect(parseShortcut("Alt+ArrowUp")).toEqual({ key: "arrowup", mod: false, shift: false, alt: true });
  });

  it("reads a plus sign as the key when it comes last", () => {
    expect(parseShortcut("Mod++")).toEqual({ key: "+", mod: true, shift: false, alt: false });
  });
});

describe("matchesShortcut", () => {
  it("maps Mod to Ctrl, or to Cmd on a Mac", () => {
    expect(matchesShortcut("Mod+K", key("k", { ctrlKey: true }), "other")).toBe(true);
    expect(matchesShortcut("Mod+K", key("k", { metaKey: true }), "other")).toBe(false);
    expect(matchesShortcut("Mod+K", key("k", { metaKey: true }), "mac")).toBe(true);
    expect(matchesShortcut("Mod+K", key("k", { ctrlKey: true }), "mac")).toBe(false);
  });

  it("needs exactly the modifiers the shortcut names", () => {
    expect(matchesShortcut("Mod+K", key("k"), "other")).toBe(false);
    expect(matchesShortcut("Mod+K", key("K", { ctrlKey: true, shiftKey: true }), "other")).toBe(false);
    expect(matchesShortcut("Mod+Shift+K", key("K", { ctrlKey: true, shiftKey: true }), "other")).toBe(true);
    expect(matchesShortcut("F", key("f", { altKey: true }), "other")).toBe(false);
  });

  it("ignores Shift for symbols, which often need it to be typed", () => {
    expect(matchesShortcut("?", key("?", { shiftKey: true }), "other")).toBe(true);
  });

  it("compares letters without regard to case", () => {
    expect(matchesShortcut("Shift+F", key("F", { shiftKey: true }), "other")).toBe(true);
  });
});

describe("formatShortcut", () => {
  it("spells the keys out on Windows and Linux", () => {
    expect(formatShortcut("Mod+Shift+K", "other")).toEqual(["Ctrl", "Shift", "K"]);
    expect(formatShortcut("Alt+ArrowUp", "other")).toEqual(["Alt", "↑"]);
  });

  it("uses the symbols a Mac shows", () => {
    expect(formatShortcut("Mod+Shift+K", "mac")).toEqual(["⌘", "⇧", "K"]);
    expect(formatShortcut("Alt+Delete", "mac")).toEqual(["⌥", "Del"]);
  });
});

describe("platformOf", () => {
  it("recognises Apple platforms", () => {
    expect(platformOf("MacIntel")).toBe("mac");
    expect(platformOf("iPad")).toBe("mac");
    expect(platformOf("Win32")).toBe("other");
    expect(platformOf("Linux x86_64")).toBe("other");
  });
});

describe("isEditableTarget", () => {
  it("is true where typing goes into a field", () => {
    expect(isEditableTarget({ tagName: "INPUT", isContentEditable: false })).toBe(true);
    expect(isEditableTarget({ tagName: "TEXTAREA", isContentEditable: false })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("is false elsewhere", () => {
    expect(isEditableTarget({ tagName: "BUTTON", isContentEditable: false })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
