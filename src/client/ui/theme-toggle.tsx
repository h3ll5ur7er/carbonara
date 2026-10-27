// Switches between dark and light; until the user picks one, the system preference decides.
import { useEffect, useState, useSyncExternalStore } from "react";
import { resolveTheme, toggleTheme, type Theme, type ThemePreference } from "./theme";

const prefersLight = "(prefers-color-scheme: light)";

function subscribeToSystemTheme(onChange: () => void) {
  const query = window.matchMedia(prefersLight);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function systemTheme(): Theme {
  return window.matchMedia(prefersLight).matches ? "light" : "dark";
}

export function ThemeToggle() {
  const system = useSyncExternalStore(subscribeToSystemTheme, systemTheme);
  const [preference, setPreference] = useState<ThemePreference>("system");
  const theme = resolveTheme(preference, system);

  useEffect(() => {
    const root = document.documentElement;
    if (preference === "system") delete root.dataset.theme;
    else root.dataset.theme = preference;
  }, [preference]);

  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setPreference(toggleTheme(preference, system))}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="grid size-8 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg active:bg-surface-4"
    >
      {theme === "dark" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      className="size-4"
      aria-hidden
    >
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      <path d="M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1Z" />
    </svg>
  );
}
