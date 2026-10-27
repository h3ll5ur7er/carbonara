import { describe, expect, it } from "vitest";
import { createCommandRegistry } from "../core/commands";
import { appCommands } from "./app-commands";

describe("appCommands", () => {
  it("register without clashing ids or shortcuts", () => {
    expect(() => createCommandRegistry(appCommands)).not.toThrow();
  });

  it("each have an icon, so menus and the palette can show them", () => {
    for (const command of appCommands) expect(command.icon, command.id).toBeDefined();
  });

  it("have a shortcut, except the rarer ones, which the palette and the menus reach", () => {
    // Aligning and distributing are also on the selection toolbar.
    const paletteOnly = new Set([
      "arrange.topToBottom",
      "align.left",
      "align.centre",
      "align.right",
      "align.top",
      "align.middle",
      "align.bottom",
      "align.distributeHorizontally",
      "align.distributeVertically",
    ]);
    for (const command of appCommands) {
      if (!paletteOnly.has(command.id)) expect(command.shortcut, command.id).toBeDefined();
    }
  });
});
