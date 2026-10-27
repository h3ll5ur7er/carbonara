// The app's commands. Register every new action here (or in a registry built from these), so the palette,
// the menus and the keyboard all reach it.
import {
  Bot,
  Command,
  Download,
  Keyboard,
  FilePlus,
  FolderOpen,
  Link,
  PanelLeft,
  PanelRight,
  PencilLine,
  SunMoon,
  X,
} from "lucide-react";
import { canvasCommands } from "../canvas/commands";
import type { CommandDefinition } from "../core/commands";
import { plannerCommands } from "../features/planner/commands";
import { totalsCommands } from "../features/totals/commands";
import { sankeyCommands } from "../features/sankey/commands";
import { heatmapCommands } from "../features/heatmap/commands";
import { subgraphCommands } from "../features/subgraphs/commands";
import { onboardingCommands } from "../features/onboarding/commands";
import { customisableRegistry, setCheatSheetOpen, useShortcuts } from "../features/shortcuts/store";
import { paletteCommandId } from "../features/command-palette/command-palette";
import { documentActions } from "../features/documents/actions";
import { setMcpDialogOpen } from "../features/mcp/host-store";
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
    id: "file.rename",
    title: "Rename factory…",
    group: "File",
    shortcut: "F2",
    keywords: ["name", "title", "tab", "document"],
    icon: PencilLine,
    run: () => documentActions.renameDocument(),
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
  ...canvasCommands,
  ...subgraphCommands,
  ...plannerCommands,
  ...totalsCommands,
  ...sankeyCommands,
  ...heatmapCommands,
  {
    id: "ai.access",
    title: "AI access and activity…",
    group: "AI",
    shortcut: "Mod+Shift+A",
    keywords: ["mcp", "assistant", "claude", "permissions", "log", "connect"],
    icon: Bot,
    run: () => setMcpDialogOpen(true),
  },
  {
    id: "help.shortcuts",
    title: "Keyboard shortcuts",
    group: "Help",
    shortcut: "?",
    keywords: ["keys", "cheat sheet", "customise", "customize", "rebind", "help"],
    icon: Keyboard,
    run: () => setCheatSheetOpen(!useShortcuts.getState().cheatSheetOpen),
  },
  ...onboardingCommands,
];

/** The registry the app uses: the commands above, with the shortcuts the person chose. */
export const appRegistry = customisableRegistry(appCommands);
