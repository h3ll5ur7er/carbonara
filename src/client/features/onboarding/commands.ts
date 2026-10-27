// The welcome tour's command, for the app's command registry (palette, menus).
import { GraduationCap } from "lucide-react";
import type { CommandDefinition } from "../../core/commands";
import { resumeTour } from "./tour-store";

export const onboardingCommands: CommandDefinition[] = [
  {
    id: "help.tour",
    title: "Take the tour",
    group: "Help",
    keywords: ["welcome", "onboarding", "tutorial", "learn", "guide", "resume", "start", "help"],
    icon: GraduationCap,
    run: resumeTour,
  },
];
