// The canvas's commands, for the app's command registry (palette, menus, shortcuts).
import { Focus, Maximize } from "lucide-react";
import type { CommandDefinition } from "../core/commands";
import { canvasActions } from "./viewport";

export const canvasCommands: CommandDefinition[] = [
  {
    id: "view.zoomToFit",
    title: "Zoom to fit",
    group: "View",
    shortcut: "F",
    keywords: ["fit", "whole", "everything", "overview", "frame"],
    icon: Maximize,
    run: () => canvasActions()?.zoomToFit(),
  },
  {
    id: "view.zoomToSelection",
    title: "Zoom to selection",
    group: "View",
    shortcut: "Shift+F",
    keywords: ["fit", "selected", "focus", "frame"],
    icon: Focus,
    run: () => canvasActions()?.zoomToSelection(),
  },
];
