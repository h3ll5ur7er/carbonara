// The macOS menu bar, built from the command registry so every menu item is a registered command with its title
// and shortcut. Windows and Linux keep the app's own menu (behind the wordmark) and get no native menu bar: a
// second menu there would only repeat it. macOS needs one for the app menu (Quit, Hide) and for copy and paste in
// text fields, which go through the native Edit menu.
import { Menu, type MenuItemOptions, type PredefinedMenuItemOptions } from "@tauri-apps/api/menu";
import type { CommandRegistry } from "../../client/core/commands";
import { parseShortcut } from "../../client/core/commands-shortcuts";

type Item = Omit<MenuItemOptions, "action"> | PredefinedMenuItemOptions;

export interface MenuSpec {
  text: string;
  items: Item[];
}

/**
 * The native accelerator for a registry shortcut (`Mod+Shift+K` → `CmdOrCtrl+Shift+k`; accelerators ignore case).
 * Shortcuts without a modifier stay the app's: as accelerators they would fire while someone types.
 */
export function acceleratorFor(shortcut: string): string | undefined {
  const { key, mod, shift, alt } = parseShortcut(shortcut);
  if (!mod) return undefined;
  return ["CmdOrCtrl", ...(shift ? ["Shift"] : []), ...(alt ? ["Alt"] : []), key === " " ? "Space" : key].join("+");
}

const appMenu: MenuSpec = {
  text: "Carbonara",
  items: [
    { item: { About: null } },
    { item: "Separator" },
    { item: "Services" },
    { item: "Separator" },
    { item: "Hide" },
    { item: "HideOthers" },
    { item: "ShowAll" },
    { item: "Separator" },
    { item: "Quit" },
  ],
};

const editMenu: MenuSpec = {
  text: "Edit",
  items: [
    { item: "Undo" },
    { item: "Redo" },
    { item: "Separator" },
    { item: "Cut" },
    { item: "Copy" },
    { item: "Paste" },
    { item: "SelectAll" },
  ],
};

const windowMenu: MenuSpec = {
  text: "Window",
  items: [{ item: "Minimize" }, { item: "Maximize" }, { item: "Separator" }, { item: "CloseWindow" }],
};

/** The menus in macOS order: the app menu, the registry's groups with Edit after File, then Window. */
export function menuBar(registry: CommandRegistry): MenuSpec[] {
  const groups: MenuSpec[] = registry.groups().map(([group, commands]) => ({
    text: group,
    items: commands.map(({ id, title, shortcut }) => {
      const accelerator = shortcut && acceleratorFor(shortcut);
      return { id, text: title, ...(accelerator && { accelerator }) };
    }),
  }));
  const afterFile = groups.findIndex((menu) => menu.text === "File") + 1;
  return [appMenu, ...groups.slice(0, afterFile), editMenu, ...groups.slice(afterFile), windowMenu];
}

/** Makes the menu bar the app's; each registry item runs its command. */
export async function installMenuBar(registry: CommandRegistry): Promise<void> {
  const run = (id: string) => registry.get(id)?.run();
  const menu = await Menu.new({
    items: menuBar(registry).map(({ text, items }) => ({
      text,
      items: items.map((item) => ("item" in item ? item : { ...item, action: run })),
    })),
  });
  await menu.setAsAppMenu();
}
