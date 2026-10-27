// The theme the user chose for this session, shared by the theme toggle and the command palette.
// It lives in memory until the preferences access component can persist it.
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { resolveTheme, toggleTheme, type Theme, type ThemePreference } from "./theme";

const prefersLight = "(prefers-color-scheme: light)";

const usePreference = create<{ preference: ThemePreference }>(() => ({ preference: "system" }));

function subscribeToSystemTheme(onChange: () => void) {
  const query = window.matchMedia(prefersLight);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function systemTheme(): Theme {
  return window.matchMedia(prefersLight).matches ? "light" : "dark";
}

/** The theme on screen, following the system until the user makes a choice. */
export function useTheme(): Theme {
  const system = useSyncExternalStore(subscribeToSystemTheme, systemTheme);
  return resolveTheme(
    usePreference((state) => state.preference),
    system,
  );
}

export function setThemePreference(preference: ThemePreference): void {
  usePreference.setState({ preference });
  const root = document.documentElement;
  if (preference === "system") delete root.dataset.theme;
  else root.dataset.theme = preference;
}

/** Switches to the theme opposite to the one on screen. */
export function toggleThemePreference(): void {
  setThemePreference(toggleTheme(usePreference.getState().preference, systemTheme()));
}
