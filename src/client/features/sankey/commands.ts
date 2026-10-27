// The Sankey overview's command, for the app's command registry (palette, menus, shortcuts).
import { Waves } from "lucide-react";
import type { CommandDefinition } from "../../core/commands";
import { toggleSankey } from "./sankey-view";

export const sankeyCommands: CommandDefinition[] = [
  {
    id: "view.sankey",
    title: "Sankey overview",
    group: "View",
    shortcut: "S",
    keywords: ["flows", "overview", "whole factory", "diagram", "bands"],
    icon: Waves,
    run: toggleSankey,
  },
];
