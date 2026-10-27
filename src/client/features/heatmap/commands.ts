// The bottleneck heatmap's command, for the app's command registry (palette, menus, shortcuts).
import { Flame } from "lucide-react";
import type { CommandDefinition } from "../../core/commands";
import { toggleHeatmap } from "./heatmap";

export const heatmapCommands: CommandDefinition[] = [
  {
    id: "view.heatmap",
    title: "Bottleneck heatmap",
    group: "View",
    shortcut: "H",
    keywords: ["bottleneck", "congestion", "overloaded", "deficit", "short", "capacity", "heat"],
    icon: Flame,
    run: toggleHeatmap,
  },
];
