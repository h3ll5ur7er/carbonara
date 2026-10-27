// The planner's commands, for the app's command registry (palette, menus, shortcuts).
import { WandSparkles } from "lucide-react";
import type { CommandDefinition } from "../../core/commands";
import { togglePlanner } from "./planner-store";

export const plannerCommands: CommandDefinition[] = [
  {
    id: "plan.production",
    title: "Plan production…",
    group: "Plan",
    shortcut: "P",
    keywords: ["goal", "target", "optimize", "optimise", "propose", "build", "make", "rate", "chain"],
    icon: WandSparkles,
    run: togglePlanner,
  },
];
