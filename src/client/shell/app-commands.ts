// The app's commands. Register every new action here (or in a registry built from these), so the palette,
// the menus and the keyboard all reach it.
import { Command, Download, FilePlus, FolderOpen, Link, PanelLeft, PanelRight, SunMoon, X } from "lucide-react";
import { createCommandRegistry, type CommandDefinition } from "../core/commands";
import { paletteCommandId } from "../features/command-palette/command-palette";
import { documentActions } from "../features/documents/actions";
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
    id: "file.new",
    title: "New factory…",
    group: "File",
    // Browsers keep Mod+N and Mod+W for themselves, and Alt changes the key on macOS, so File uses Mod+Shift.
    shortcut: "Mod+Shift+F",
    keywords: ["create", "document", "tab", "empty"],
    icon: FilePlus,
    run: documentActions.newDocument,
  },
  {
    id: "file.open",
    title: "Open factory file…",
    group: "File",
    shortcut: "Mod+O",
    keywords: ["import", "load", ".carbonara"],
    icon: FolderOpen,
    run: documentActions.openFile,
  },
  {
    id: "file.save",
    title: "Save factory file",
    group: "File",
    shortcut: "Mod+S",
    keywords: ["export", "download", ".carbonara"],
    icon: Download,
    run: documentActions.saveFile,
  },
  {
    id: "file.share",
    title: "Copy share link",
    group: "File",
    shortcut: "Mod+Shift+E",
    keywords: ["link", "url", "send"],
    icon: Link,
    run: documentActions.copyShareLink,
  },
  {
    id: "file.close",
    title: "Close factory",
    group: "File",
    shortcut: "Mod+Shift+X",
    keywords: ["tab", "document"],
    icon: X,
    run: () => documentActions.closeDocument(),
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
