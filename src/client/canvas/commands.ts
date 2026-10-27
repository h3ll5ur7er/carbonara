// The canvas's commands, for the app's command registry (palette, menus, shortcuts).
import { ChevronsDown, ChevronsRight, Focus, Lock, Maximize } from "lucide-react";
import type { CommandDefinition } from "../core/commands";
import { canvasEditActions } from "./edit-actions";
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
  {
    id: "arrange.leftToRight",
    title: "Arrange left to right",
    group: "Arrange",
    shortcut: "Shift+A",
    keywords: ["auto", "layout", "tidy", "organise", "organize", "clean up", "selection"],
    icon: ChevronsRight,
    run: () => canvasEditActions()?.arrange("right"),
  },
  {
    id: "arrange.topToBottom",
    title: "Arrange top to bottom",
    group: "Arrange",
    keywords: ["auto", "layout", "tidy", "organise", "organize", "clean up", "vertical", "selection"],
    icon: ChevronsDown,
    run: () => canvasEditActions()?.arrange("down"),
  },
  {
    id: "arrange.toggleLock",
    title: "Lock or unlock selection",
    group: "Arrange",
    shortcut: "Shift+L",
    keywords: ["pin", "fix", "freeze", "keep", "position"],
    icon: Lock,
    run: () => canvasEditActions()?.toggleLock(),
  },
];
