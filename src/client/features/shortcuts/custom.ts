// Customised shortcuts: how a key press is written down as a shortcut, how the person's choices replace the
// registered ones, and which command a new shortcut would clash with. Pure; the store keeps the choices.
import type { CommandDefinition } from "../../core/commands";
import type { KeyPress, Platform } from "../../core/commands-shortcuts";

/** Shortcut by command id; null removes the command's shortcut. */
export type ShortcutOverrides = Record<string, string | null>;

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "OS"]);

/** The press as the registry writes shortcuts ("Mod+Shift+K"); undefined while only modifiers are down. */
export function shortcutOf(press: KeyPress, platform: Platform): string | undefined {
  if (MODIFIER_KEYS.has(press.key)) return undefined;
  const mod = platform === "mac" ? press.metaKey : press.ctrlKey;
  const symbol = press.key.length === 1 && !/[a-z0-9]/i.test(press.key);
  const key = press.key === " " ? "Space" : press.key.length === 1 ? press.key.toUpperCase() : press.key;
  return [
    ...(mod ? ["Mod"] : []),
    ...(press.altKey ? ["Alt"] : []),
    ...(press.shiftKey && !symbol ? ["Shift"] : []),
    key,
  ].join("+");
}

/** The commands with the person's shortcuts in place of the registered ones. */
export function applyShortcuts(
  commands: readonly CommandDefinition[],
  overrides: ShortcutOverrides,
): CommandDefinition[] {
  return commands.map((command) => {
    if (!Object.hasOwn(overrides, command.id)) return command;
    const { shortcut: _registered, ...rest } = command;
    const chosen = overrides[command.id];
    return chosen ? { ...rest, shortcut: chosen } : rest;
  });
}

/** The other command that already uses `shortcut`, if any. */
export function conflictOf(
  commands: readonly CommandDefinition[],
  id: string,
  shortcut: string,
): CommandDefinition | undefined {
  const wanted = shortcut.toLowerCase();
  return commands.find((command) => command.id !== id && command.shortcut?.toLowerCase() === wanted);
}
