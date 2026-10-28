// The command registry: every action the app offers, registered once. The command palette, the menus and the
// keyboard shortcuts are all read from it, so an action has one title, one shortcut and one implementation.
import type { ComponentType } from "react";
import { matchesShortcut, parseShortcut, type KeyPress, type Platform } from "./commands-shortcuts";

export interface CommandDefinition {
  /** Stable and dotted by area: `view.toggleTheme`. Customised shortcuts will be keyed by it. */
  id: string;
  /** What the command does, as a menu item reads: "Toggle inspector". */
  title: string;
  /** Where the command sits in menus and the palette: "View", "Edit". */
  group: string;
  /** As `matchesShortcut` reads it: "Mod+Shift+K". */
  shortcut?: string;
  /**
   * Whether its shortcut also runs while a text field has focus (only shortcuts with a modifier ever do).
   * False leaves the field its own meaning of the keys, as with undo. True when left out.
   */
  inTextFields?: boolean;
  /** Other words people may search for. */
  keywords?: string[];
  icon?: ComponentType<{ className?: string }>;
  /**
   * For commands whose meaning depends on what they act on: the title context menus show as things stand
   * ("Remove from favourites"), or null to leave the command out of them. The palette and keys use `title`.
   */
  menuTitle?(): string | null;
  run(): void;
}

export interface CommandRegistry {
  readonly commands: readonly CommandDefinition[];
  get(id: string): CommandDefinition | undefined;
  /** The commands by group, groups in order of first appearance. */
  groups(): [group: string, commands: CommandDefinition[]][];
  /** The command a key press runs. In a text field (`editable`), only shortcuts with a modifier count. */
  forKey(press: KeyPress, platform: Platform, editable: boolean): CommandDefinition | undefined;
}

/** Duplicate ids or shortcuts are bugs in the registration, so they throw. */
export function createCommandRegistry(definitions: CommandDefinition[]): CommandRegistry {
  const byId = new Map<string, CommandDefinition>();
  const shortcuts = new Map<string, string>();
  for (const definition of definitions) {
    if (byId.has(definition.id)) throw new Error(`Command ${definition.id} is registered twice`);
    byId.set(definition.id, definition);
    if (definition.shortcut) {
      const taken = shortcuts.get(definition.shortcut);
      if (taken) throw new Error(`${definition.id} and ${taken} both use ${definition.shortcut}`);
      shortcuts.set(definition.shortcut, definition.id);
    }
  }

  return {
    commands: definitions,
    get: (id) => byId.get(id),
    groups() {
      const groups = new Map<string, CommandDefinition[]>();
      for (const definition of definitions) {
        groups.set(definition.group, [...(groups.get(definition.group) ?? []), definition]);
      }
      return [...groups];
    },
    forKey(press, platform, editable) {
      return definitions.find(
        ({ shortcut, inTextFields = true }) =>
          shortcut !== undefined &&
          (!editable || (inTextFields && parseShortcut(shortcut).mod)) &&
          matchesShortcut(shortcut, press, platform),
      );
    },
  };
}
