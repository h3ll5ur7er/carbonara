import { describe, expect, it } from "vitest";
import { createCommandRegistry, type CommandDefinition } from "../../client/core/commands";
import { acceleratorFor, menuBar } from "./menu";

const command = (id: string, group: string, shortcut?: string): CommandDefinition => ({
  id,
  title: `Title of ${id}`,
  group,
  ...(shortcut && { shortcut }),
  run: () => undefined,
});

describe("the macOS menu bar", () => {
  it("writes registry shortcuts as native accelerators", () => {
    expect(acceleratorFor("Mod+S")).toBe("CmdOrCtrl+s");
    expect(acceleratorFor("Mod+Shift+Alt+ArrowUp")).toBe("CmdOrCtrl+Shift+Alt+arrowup");
    expect(acceleratorFor("Mod+ ")).toBe("CmdOrCtrl+Space");
  });

  it("leaves shortcuts without a modifier to the app, so typing a letter never runs a menu item", () => {
    expect(acceleratorFor("F")).toBeUndefined();
    expect(acceleratorFor("Shift+F")).toBeUndefined();
  });

  it("has a menu per registry group between the app menu and the window menu, with the edit menu after File", () => {
    const registry = createCommandRegistry([
      command("file.open", "File", "Mod+O"),
      command("view.zoomToFit", "View", "F"),
    ]);
    const menus = menuBar(registry);
    expect(menus.map((menu) => menu.text)).toEqual(["Carbonara", "File", "Edit", "View", "Window"]);
    expect(menus[1]?.items).toEqual([{ id: "file.open", text: "Title of file.open", accelerator: "CmdOrCtrl+o" }]);
    expect(menus[3]?.items).toEqual([{ id: "view.zoomToFit", text: "Title of view.zoomToFit" }]);
  });

  it("keeps the native edit items, so copy and paste work in text fields", () => {
    const edit = menuBar(createCommandRegistry([])).find((menu) => menu.text === "Edit");
    expect(edit?.items).toContainEqual({ item: "Copy" });
    expect(edit?.items).toContainEqual({ item: "Paste" });
  });
});
