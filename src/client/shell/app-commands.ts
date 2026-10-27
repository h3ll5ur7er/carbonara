// The app's commands. Register every new action here (or in a registry built from these), so the palette,
// the menus and the keyboard all reach it.
import { Command, PanelLeft, PanelRight, SunMoon } from "lucide-react";
import { createCommandRegistry, type CommandDefinition } from "../core/commands";
import { paletteCommandId } from "../features/command-palette/command-palette";
import { togglePalette } from "../features/command-palette/palette-store";
import { toggleThemePreference } from "../ui/use-theme";
import { togglePanel } from "./panels";

export const appCommands: CommandDefinition[] = [
  {
    id: paletteCommandId,
    title: "Command palette",
    group: "General",
    shortcut: "Mod+K",
    keywords: ["search", "find", "add"],
    icon: Command,
    run: togglePalette,
  },
  {
    id: "view.toggleLibrary",
    title: "Toggle library",
    group: "View",
    shortcut: "Mod+B",
    keywords: ["panel", "left", "sidebar", "show", "hide"],
    icon: PanelLeft,
    run: () => togglePanel("left"),
  },
  {
    id: "view.toggleInspector",
    title: "Toggle inspector",
    group: "View",
    shortcut: "Mod+I",
    keywords: ["panel", "right", "properties", "settings", "show", "hide"],
    icon: PanelRight,
    run: () => togglePanel("right"),
  },
  {
    id: "view.toggleTheme",
    title: "Switch light and dark theme",
    group: "View",
    shortcut: "Mod+Shift+L",
    keywords: ["appearance", "dark mode", "light mode", "colour"],
    icon: SunMoon,
    run: toggleThemePreference,
  },
];

export const appRegistry = createCommandRegistry(appCommands);
