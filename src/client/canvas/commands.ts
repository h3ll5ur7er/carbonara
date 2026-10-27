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
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Cable,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Factory,
  FileImage,
  Gauge,
  ChevronsDown,
  ChevronsDownUp,
  ChevronsRight,
  Focus,
  Frame,
  Lock,
  Maximize,
  MoveHorizontal,
  Redo2,
  Scissors,
  Search,
  StickyNote,
  Tag,
  Trash,
  Undo2,
} from "lucide-react";
import type { CommandDefinition } from "../core/commands";
import { setFindOpen, useFind } from "../features/find/find-store";
import { canvasEditActions } from "./edit-actions";
import type { AlignMode } from "./model/align";
import { TagColour } from "../../contracts/document";

const TAG_COLOURS = TagColour.options;
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

/**
 * Text selected on the page outside a field (a name in the inspector) is copied as text, as the browser would
 * have done if the shortcut hadn't been taken.
 */
function copiesSelectedText(): boolean {
  const selected = window.getSelection();
  if (!selected || selected.isCollapsed || selected.toString().trim() === "") return false;
  // Deprecated, but the one way to run the browser's own copy from a key handler.
  return document.execCommand("copy");
}

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
    id: "edit.copy",
    title: "Copy",
    group: "Edit",
    shortcut: "Mod+C",
    // A text field copies its own text.
    inTextFields: false,
    keywords: ["clipboard", "duplicate", "nodes", "selection", "share"],
    icon: Copy,
    run: () => {
      if (!copiesSelectedText()) canvasEditActions()?.copy();
    },
  },
  {
    id: "edit.cut",
    title: "Cut",
    group: "Edit",
    shortcut: "Mod+X",
    inTextFields: false,
    keywords: ["clipboard", "move", "nodes", "selection"],
    icon: Scissors,
    run: () => canvasEditActions()?.cut(),
  },
  {
    id: "edit.paste",
    title: "Paste",
    group: "Edit",
    shortcut: "Mod+V",
    inTextFields: false,
    keywords: ["clipboard", "insert", "ghost", "place"],
    icon: ClipboardPaste,
    run: () => canvasEditActions()?.paste(false),
  },
  {
    id: "edit.pasteWithConnections",
    title: "Paste with connections",
    group: "Edit",
    shortcut: "Mod+Shift+V",
    inTextFields: false,
    keywords: ["clipboard", "flows", "reconnect", "edges", "linked"],
    icon: ClipboardPaste,
    run: () => canvasEditActions()?.paste(true),
  },
  {
    id: "edit.duplicate",
    title: "Duplicate",
    group: "Edit",
    // Browsers bookmark the page with Mod+D, but let a page take the key.
    shortcut: "Mod+D",
    inTextFields: false,
    keywords: ["copy", "clone", "repeat", "nodes", "selection"],
    icon: CopyPlus,
    run: () => canvasEditActions()?.duplicate(),
  },
  {
    id: "edit.find",
    title: "Find in factory",
    group: "Edit",
    shortcut: "Mod+F",
    keywords: ["search", "locate", "jump", "replace", "recipe", "item", "node"],
    icon: Search,
    run: () => setFindOpen(!useFind.getState().open),
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
  ...(
    [
      ["per_second", "Show rates per second", "/s"],
      ["per_minute", "Show rates per minute", "/min"],
      ["per_hour", "Show rates per hour", "/h"],
      ["belts", "Show rates in belts", "belt"],
    ] as const
  ).map(([choice, title, word]): CommandDefinition => ({
    id: `units.${choice}`,
    title,
    group: "View",
    keywords: ["unit", "rate", word, "display"],
    icon: Gauge,
    run: () => canvasEditActions()?.showRatesIn(choice),
  })),
  {
    id: "units.roundToBuildable",
    title: "Round machines to buildable",
    group: "View",
    keywords: ["even", "clock", "underclock", "fill", "machine count", "groups"],
    icon: Factory,
    run: () => canvasEditActions()?.toggleMachineGroups(),
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
  {
    id: "arrange.frameSelection",
    title: "Frame selection",
    group: "Arrange",
    shortcut: "Shift+G",
    keywords: ["group", "box", "area", "label", "section"],
    icon: Frame,
    run: () => canvasEditActions()?.frameSelection(),
  },
  {
    id: "arrange.toggleCollapse",
    title: "Collapse or expand frame",
    group: "Arrange",
    keywords: ["fold", "unfold", "hide", "group", "minimise", "minimize", "open", "close"],
    icon: ChevronsDownUp,
    run: () => canvasEditActions()?.toggleCollapse(),
  },
  {
    id: "edit.addNote",
    title: "Add note",
    group: "Edit",
    shortcut: "N",
    keywords: ["sticky", "comment", "text", "annotate"],
    icon: StickyNote,
    run: () => canvasEditActions()?.addNote(),
  },
  ...[...TAG_COLOURS, null].map((tag): CommandDefinition => ({
    id: `tag.${tag ?? "none"}`,
    title: tag ? `Tag ${tag}` : "Remove tag",
    group: "Arrange",
    keywords: ["colour", "color", "mark", "label", ...(tag ? [tag] : ["clear", "untag"])],
    icon: Tag,
    run: () => canvasEditActions()?.tag(tag),
  })),
  {
    id: "view.bookmark",
    title: "Bookmark this view",
    group: "View",
    shortcut: "Shift+B",
    keywords: ["save", "remember", "place", "viewport"],
    icon: Bookmark,
    run: () => canvasEditActions()?.bookmarkView(),
  },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((slot): CommandDefinition => ({
    id: `view.bookmark${slot}`,
    title: `Go to bookmark ${slot}`,
    group: "View",
    shortcut: String(slot),
    keywords: ["jump", "place", "viewport"],
    icon: BookmarkCheck,
    run: () => canvasEditActions()?.goToBookmark(slot),
  })),
  {
    id: "file.exportPng",
    title: "Export picture (PNG)",
    group: "File",
    keywords: ["image", "screenshot", "png", "share", "download"],
    icon: FileImage,
    run: () => canvasEditActions()?.exportImage("png"),
  },
  {
    id: "file.exportSvg",
    title: "Export picture (SVG)",
    group: "File",
    keywords: ["image", "vector", "svg", "share", "download"],
    icon: FileImage,
    run: () => canvasEditActions()?.exportImage("svg"),
  },
  {
    id: "view.back",
    title: "Back",
    group: "View",
    shortcut: "Mod+[",
    keywords: ["previous", "history", "where I was", "return"],
    icon: ArrowLeft,
    run: () => canvasEditActions()?.back(),
  },
  {
    id: "view.forward",
    title: "Forward",
    group: "View",
    shortcut: "Mod+]",
    keywords: ["next", "history"],
    icon: ArrowRight,
    run: () => canvasEditActions()?.forward(),
  },
];
