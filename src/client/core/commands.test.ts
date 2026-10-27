import { describe, expect, it, vi } from "vitest";
import { createCommandRegistry, type CommandDefinition } from "./commands";

const press = (key: string, modifiers: Partial<{ ctrlKey: boolean; shiftKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

function command(id: string, extra: Partial<CommandDefinition> = {}): CommandDefinition {
  return { id, title: id, group: "View", run: vi.fn(), ...extra };
}

describe("createCommandRegistry", () => {
  it("lists the commands in the order they were registered", () => {
    const registry = createCommandRegistry([command("b"), command("a")]);
    expect(registry.commands.map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("finds a command by id", () => {
    const theme = command("view.theme");
    expect(createCommandRegistry([theme]).get("view.theme")).toBe(theme);
    expect(createCommandRegistry([theme]).get("nope")).toBeUndefined();
  });

  it("refuses two commands with the same id", () => {
    expect(() => createCommandRegistry([command("a"), command("a")])).toThrow(/a/);
  });

  it("refuses two commands with the same shortcut, which one key press can't run both of", () => {
    expect(() =>
      createCommandRegistry([command("a", { shortcut: "Mod+K" }), command("b", { shortcut: "Mod+K" })]),
    ).toThrow(/Mod\+K/);
  });

  it("groups commands for menus, keeping the order of first appearance", () => {
    const registry = createCommandRegistry([
      command("a", { group: "View" }),
      command("b", { group: "Edit" }),
      command("c", { group: "View" }),
    ]);
    expect(registry.groups().map(([group, entries]) => [group, entries.map((entry) => entry.id)])).toEqual([
      ["View", ["a", "c"]],
      ["Edit", ["b"]],
    ]);
  });
});

describe("forKey", () => {
  const palette = command("palette", { shortcut: "Mod+K" });
  const fit = command("fit", { shortcut: "F" });
  const registry = createCommandRegistry([palette, fit, command("plain")]);

  it("finds the command whose shortcut was pressed", () => {
    expect(registry.forKey(press("k", { ctrlKey: true }), "other", false)).toBe(palette);
    expect(registry.forKey(press("f"), "other", false)).toBe(fit);
    expect(registry.forKey(press("x"), "other", false)).toBeUndefined();
  });

  it("leaves plain keys to a text field that has focus, but not shortcuts with a modifier", () => {
    expect(registry.forKey(press("f"), "other", true)).toBeUndefined();
    expect(registry.forKey(press("k", { ctrlKey: true }), "other", true)).toBe(palette);
  });

  it("leaves a text field its own keys, such as undo, when a command says so", () => {
    const undo = command("undo", { shortcut: "Mod+Z", inTextFields: false });
    const withUndo = createCommandRegistry([undo]);
    expect(withUndo.forKey(press("z", { ctrlKey: true }), "other", true)).toBeUndefined();
    expect(withUndo.forKey(press("z", { ctrlKey: true }), "other", false)).toBe(undo);
  });
});
