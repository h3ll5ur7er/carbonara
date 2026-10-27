// The totals card's commands, for the app's command registry (palette, menus, shortcuts).
import { Sigma } from "lucide-react";
import type { CommandDefinition } from "../../core/commands";
import { toggleTotals } from "./totals-panel";

export const totalsCommands: CommandDefinition[] = [
  {
    id: "view.toggleTotals",
    title: "Toggle totals",
    group: "View",
    shortcut: "T",
    keywords: ["dashboard", "summary", "power", "resources", "limits", "buildings", "machines", "sum"],
    icon: Sigma,
    run: toggleTotals,
  },
];
