// Hides how the theme on screen follows from the user's choice and the system preference,
// and how a pack's accent reaches the accent tokens.
import type { CSSProperties } from "react";

export type Theme = "dark" | "light";

/** An explicit choice, or "system" to follow `prefers-color-scheme`. */
export type ThemePreference = Theme | "system";

export function resolveTheme(preference: ThemePreference, system: Theme): Theme {
  return preference === "system" ? system : preference;
}

/** The explicit choice that flips the theme currently on screen. */
export function toggleTheme(preference: ThemePreference, system: Theme): Theme {
  return resolveTheme(preference, system) === "dark" ? "light" : "dark";
}

/** Styles that give a subtree a pack's accent (`theme.accent`); without one, the inherited accent stays. */
export function packAccentStyle(accent: string | undefined): CSSProperties {
  return accent ? ({ "--pack-accent": accent } as CSSProperties) : {};
}
