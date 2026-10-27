// Hides how the theme on screen follows from the user's choice and the system preference.

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
