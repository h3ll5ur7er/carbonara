// Switches between dark and light; until the user picks one, the system preference decides.
import { Moon, Sun } from "lucide-react";
import { IconButton } from "./button";
import { toggleThemePreference, useTheme } from "./use-theme";

export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <IconButton
      label={`Switch to ${next} theme`}
      icon={theme === "dark" ? <Moon /> : <Sun />}
      onClick={toggleThemePreference}
    />
  );
}
