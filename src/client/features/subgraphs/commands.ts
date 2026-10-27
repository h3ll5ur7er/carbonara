// The subgraph commands, for the app's command registry (palette, menus, shortcuts). Collapse and expand mirror
// grouping in drawing apps (Mod+G, Mod+Shift+G); open and leave mirror a file browser's folders (Mod+↓, Mod+↑).
import { ArrowDownRight, ArrowUpLeft, Group, Ungroup } from "lucide-react";
import { canvasEditActions } from "../../canvas/edit-actions";
import type { CommandDefinition } from "../../core/commands";
import { subgraphNavigation } from "./subgraph-store";

export const subgraphCommands: CommandDefinition[] = [
  {
    id: "subgraph.collapse",
    title: "Collapse into subgraph",
    group: "Subgraphs",
    shortcut: "Mod+G",
    inTextFields: false,
    keywords: ["group", "blueprint", "module", "nest", "hierarchy", "combine"],
    icon: Group,
    run: () => canvasEditActions()?.collapseSelection(),
  },
  {
    id: "subgraph.expand",
    title: "Expand subgraph",
    group: "Subgraphs",
    shortcut: "Mod+Shift+G",
    inTextFields: false,
    keywords: ["ungroup", "blueprint", "flatten", "dissolve", "explode"],
    icon: Ungroup,
    run: () => canvasEditActions()?.expandSelection(),
  },
  {
    id: "subgraph.open",
    title: "Open subgraph",
    group: "Subgraphs",
    shortcut: "Mod+ArrowDown",
    inTextFields: false,
    keywords: ["enter", "zoom into", "inside", "blueprint", "edit"],
    icon: ArrowDownRight,
    run: () => canvasEditActions()?.openSubgraph(),
  },
  {
    id: "subgraph.leave",
    title: "Leave subgraph",
    group: "Subgraphs",
    shortcut: "Mod+ArrowUp",
    inTextFields: false,
    keywords: ["exit", "up", "parent", "back", "out", "breadcrumb"],
    icon: ArrowUpLeft,
    run: () => subgraphNavigation()?.leave(),
  },
];
