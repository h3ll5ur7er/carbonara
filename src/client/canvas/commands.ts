// The canvas's commands, for the app's command registry (palette, menus, shortcuts).
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  Cable,
  ChevronsDown,
  ChevronsRight,
  Focus,
  Lock,
  Maximize,
  MoveHorizontal,
  Redo2,
  Trash,
  Undo2,
} from "lucide-react";
import type { CommandDefinition } from "../core/commands";
import { canvasEditActions } from "./edit-actions";
import type { AlignMode } from "./model/align";
import { canvasActions } from "./viewport";

/** Align commands, by mode: title, icon, words people may search for. */
const ALIGN: [AlignMode, string, CommandDefinition["icon"], string[]][] = [
  ["left", "Align left edges", AlignStartVertical, ["left"]],
  ["centre", "Align centres", AlignCenterVertical, ["center", "horizontal centre", "column"]],
  ["right", "Align right edges", AlignEndVertical, ["right"]],
  ["top", "Align top edges", AlignStartHorizontal, ["top"]],
  ["middle", "Align middles", AlignCenterHorizontal, ["vertical centre", "center", "row"]],
  ["bottom", "Align bottom edges", AlignEndHorizontal, ["bottom"]],
];

/** The align, distribute and straighten commands, in the order the selection toolbar shows them. */
export const tidyCommandIds = [
  ...ALIGN.map(([mode]) => `align.${mode}`),
  "align.distributeHorizontally",
  "align.distributeVertically",
  "align.straightenChain",
];

export const canvasCommands: CommandDefinition[] = [
  {
    id: "edit.undo",
    title: "Undo",
    group: "Edit",
    shortcut: "Mod+Z",
    // A text field keeps its own undo.
    inTextFields: false,
    keywords: ["back", "revert", "history"],
    icon: Undo2,
    run: () => canvasEditActions()?.undo(),
  },
  {
    id: "edit.redo",
    title: "Redo",
    group: "Edit",
    shortcut: "Mod+Shift+Z",
    inTextFields: false,
    keywords: ["again", "history"],
    icon: Redo2,
    run: () => canvasEditActions()?.redo(),
  },
  {
    id: "edit.delete",
    title: "Delete selection",
    group: "Edit",
    // Backspace too, on the canvas (Mac keyboards have no Delete key).
    shortcut: "Delete",
    keywords: ["remove", "erase", "nodes", "flows", "edges"],
    icon: Trash,
    run: () => canvasEditActions()?.deleteSelection(false),
  },
  {
    id: "edit.deleteAndBridge",
    title: "Delete and bridge",
    group: "Edit",
    shortcut: "Mod+Shift+Delete",
    inTextFields: false,
    keywords: ["remove", "reconnect", "keep connected", "splice", "bypass"],
    icon: Cable,
    run: () => canvasEditActions()?.deleteSelection(true),
  },
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
  ...ALIGN.map(([mode, title, icon, keywords]): CommandDefinition => ({
    id: `align.${mode}`,
    title,
    group: "Arrange",
    keywords: ["line up", "tidy", ...keywords],
    ...(icon && { icon }),
    run: () => canvasEditActions()?.align(mode),
  })),
  {
    id: "align.distributeHorizontally",
    title: "Distribute horizontally",
    group: "Arrange",
    keywords: ["space", "evenly", "spacing", "gaps", "row"],
    icon: AlignHorizontalSpaceBetween,
    run: () => canvasEditActions()?.distribute("horizontal"),
  },
  {
    id: "align.distributeVertically",
    title: "Distribute vertically",
    group: "Arrange",
    keywords: ["space", "evenly", "spacing", "gaps", "column"],
    icon: AlignVerticalSpaceBetween,
    run: () => canvasEditActions()?.distribute("vertical"),
  },
  {
    id: "align.straightenChain",
    title: "Straighten chain",
    group: "Arrange",
    shortcut: "Shift+S",
    keywords: ["level", "line", "flows", "row", "straight"],
    icon: MoveHorizontal,
    run: () => canvasEditActions()?.straighten(),
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
