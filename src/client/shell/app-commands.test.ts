import { describe, expect, it } from "vitest";
import { createCommandRegistry } from "../core/commands";
import { appCommands } from "./app-commands";

describe("appCommands", () => {
  it("register without clashing ids or shortcuts", () => {
    expect(() => createCommandRegistry(appCommands)).not.toThrow();
  });

  it("each have an icon and a shortcut, so menus, the palette and tooltips can show them", () => {
    for (const command of appCommands) {
      expect(command.icon, command.id).toBeDefined();
      expect(command.shortcut, command.id).toBeDefined();
    }
  });
});
