// The person's shortcuts and whether the cheat sheet is open. Shortcuts are kept in the browser's local storage
// until the preferences access component exists (docs/Architecture.md); a browser without it just forgets them.
import { create } from "zustand";
import { createCommandRegistry, type CommandDefinition, type CommandRegistry } from "../../core/commands";
import type { KeyPress, Platform } from "../../core/commands-shortcuts";
import { applyShortcuts, type ShortcutOverrides } from "./custom";

const STORAGE_KEY = "carbonara.shortcuts";

interface ShortcutsState {
  overrides: ShortcutOverrides;
  cheatSheetOpen: boolean;
}

function load(): ShortcutOverrides {
  try {
    const stored: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "{}");
    if (typeof stored !== "object" || stored === null) return {};
    return Object.fromEntries(
      Object.entries(stored).filter(
        (entry): entry is [string, string | null] => typeof entry[1] === "string" || entry[1] === null,
      ),
    );
  } catch {
    return {};
  }
}

export const useShortcuts = create<ShortcutsState>(() => ({ overrides: load(), cheatSheetOpen: false }));

function save(overrides: ShortcutOverrides) {
  useShortcuts.setState({ overrides });
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Private windows may refuse; the choice still holds for this session.
  }
}

/** Gives a command another shortcut, or none (null). */
export function setShortcut(id: string, shortcut: string | null): void {
  save({ ...useShortcuts.getState().overrides, [id]: shortcut });
}

/** Puts a command's registered shortcut back. */
export function resetShortcut(id: string): void {
  const { [id]: _dropped, ...rest } = useShortcuts.getState().overrides;
  save(rest);
}

export function setCheatSheetOpen(open: boolean): void {
  useShortcuts.setState({ cheatSheetOpen: open });
}

/**
 * A registry that follows the person's shortcuts. When saved choices clash with the registered ones (after an
 * update gave a command their key), the registered shortcuts win, so the app always starts.
 */
export function customisableRegistry(
  definitions: CommandDefinition[],
): CommandRegistry & { readonly registered: readonly CommandDefinition[] } {
  const build = (overrides: ShortcutOverrides) => {
    try {
      return createCommandRegistry(applyShortcuts(definitions, overrides));
    } catch {
      return createCommandRegistry(definitions);
    }
  };
  let current = build(useShortcuts.getState().overrides);
  useShortcuts.subscribe((state, previous) => {
    if (state.overrides !== previous.overrides) current = build(state.overrides);
  });
  return {
    registered: definitions,
    get commands() {
      return current.commands;
    },
    get: (id) => current.get(id),
    groups: () => current.groups(),
    forKey: (press: KeyPress, platform: Platform, editable: boolean) => current.forKey(press, platform, editable),
  };
}
