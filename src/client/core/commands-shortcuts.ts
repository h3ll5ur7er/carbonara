// Hides how shortcuts are written ("Mod+Shift+K"), matched against key presses and shown on each platform.
// `Mod` is Ctrl on Windows and Linux and Cmd on a Mac.

export type Platform = "mac" | "other";

export interface Shortcut {
  /** `KeyboardEvent.key`, lowercased. */
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function parseShortcut(shortcut: string): Shortcut {
  // The last part is the key; a trailing "+" (as in "Mod++") is the key itself.
  const parts = shortcut.endsWith("++") ? [...shortcut.slice(0, -2).split("+"), "+"] : shortcut.split("+");
  const key = parts.pop() ?? "";
  return {
    key: key.toLowerCase(),
    mod: parts.includes("Mod"),
    shift: parts.includes("Shift"),
    alt: parts.includes("Alt"),
  };
}

/** Letters, digits and named keys (ArrowUp, F2); anything else is a symbol, typed with or without Shift. */
function isSymbol(key: string): boolean {
  return key.length === 1 && !/[a-z0-9]/.test(key);
}

export function matchesShortcut(shortcut: string, press: KeyPress, platform: Platform): boolean {
  const wanted = parseShortcut(shortcut);
  const mod = platform === "mac" ? press.metaKey : press.ctrlKey;
  const other = platform === "mac" ? press.ctrlKey : press.metaKey;
  return (
    press.key.toLowerCase() === wanted.key &&
    mod === wanted.mod &&
    !other &&
    press.altKey === wanted.alt &&
    (isSymbol(wanted.key) || press.shiftKey === wanted.shift)
  );
}

const keyNames: Record<string, string> = {
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  delete: "Del",
  escape: "Esc",
  enter: "↵",
  backspace: "⌫",
  " ": "Space",
};

/** The keys as `Kbd` shows them: `["Ctrl", "Shift", "K"]`, or `["⌘", "⇧", "K"]` on a Mac. */
export function formatShortcut(shortcut: string, platform: Platform): string[] {
  const { key, mod, shift, alt } = parseShortcut(shortcut);
  const mac = platform === "mac";
  return [
    ...(mod ? [mac ? "⌘" : "Ctrl"] : []),
    ...(alt ? [mac ? "⌥" : "Alt"] : []),
    ...(shift ? [mac ? "⇧" : "Shift"] : []),
    keyNames[key] ?? (key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1)),
  ];
}

/** From `navigator.platform`. */
export function platformOf(navigatorPlatform: string): Platform {
  return /Mac|iPhone|iPad|iPod/.test(navigatorPlatform) ? "mac" : "other";
}

/** Whether key presses on the target type text, so plain-key shortcuts must leave them alone. */
export function isEditableTarget(target: { tagName: string; isContentEditable: boolean } | null): boolean {
  if (!target) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
