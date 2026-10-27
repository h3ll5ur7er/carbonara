import { describe, expect, it, vi } from "vitest";
import type { CommandDefinition } from "../../core/commands";
import { applyShortcuts, conflictOf, shortcutOf } from "./custom";

const press = (
  key: string,
  modifiers: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>> = {},
) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

const command = (id: string, shortcut?: string): CommandDefinition => ({
  id,
  title: id,
  group: "View",
  run: vi.fn(),
  ...(shortcut && { shortcut }),
});

describe("shortcutOf", () => {
  it("writes a key press the way the registry reads it", () => {
    expect(shortcutOf(press("k", { ctrlKey: true, shiftKey: true }), "other")).toBe("Mod+Shift+K");
    expect(shortcutOf(press("k", { metaKey: true }), "mac")).toBe("Mod+K");
    expect(shortcutOf(press("F2"), "other")).toBe("F2");
    expect(shortcutOf(press("ArrowUp", { altKey: true }), "other")).toBe("Alt+ArrowUp");
  });

  it("leaves Shift out for symbols, which Shift already chose", () => {
    expect(shortcutOf(press("?", { shiftKey: true }), "other")).toBe("?");
  });

  it("waits while only modifiers are down", () => {
    expect(shortcutOf(press("Shift", { shiftKey: true }), "other")).toBeUndefined();
    expect(shortcutOf(press("Control", { ctrlKey: true }), "other")).toBeUndefined();
  });
});

describe("applyShortcuts", () => {
  it("swaps in the person's shortcuts and removes the ones they cleared", () => {
    const commands = [command("a", "F"), command("b", "G"), command("c")];
    const applied = applyShortcuts(commands, { a: "Mod+F", b: null, c: "H" });
    expect(applied.map((entry) => entry.shortcut)).toEqual(["Mod+F", undefined, "H"]);
    expect(applied[0]?.run).toBe(commands[0]?.run);
  });

  it("ignores customised commands that no longer exist", () => {
    expect(applyShortcuts([command("a", "F")], { gone: "G" }).map((entry) => entry.shortcut)).toEqual(["F"]);
  });
});

describe("conflictOf", () => {
  it("names the command that already uses a shortcut", () => {
    const commands = [command("a", "F"), command("b", "G")];
    expect(conflictOf(commands, "b", "F")?.id).toBe("a");
    expect(conflictOf(commands, "a", "F")).toBeUndefined();
    expect(conflictOf(commands, "b", "H")).toBeUndefined();
  });
});
