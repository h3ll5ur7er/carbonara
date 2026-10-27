---
id: CARB-105
title: Keep the planner's resource weights and buildings in the save profile
type: improvement
status: review
priority: low
labels: [planner]
milestone: "M3 Megafactory"
---

Follow-up of [[CARB-81]]. Resource weights and the preferred buildings live in the plan options: the planner card keeps them for the session, and MCP clients pass them with each plan. A save that never uses asteroids, or has steel furnaces everywhere, has to say so again each time.

- [x] Store them with the document (beside the save profile in `settings`), so the planner card and `plan_production` start from them
- [x] Edit them in the Save profile panel too
- [ ] A pack may suggest defaults (Factorio's asteroid chunks weighing more without Space Age's research): moved to [[CARB-130]]

**Decisions** ([[Architecture/Planning#Saved with the document]]):

- They live in `settings.planning` (`PlanningSettings`: `buildings?`, `resourceWeights?`), not in `settings.plugin`: they're the planner's, the same for every pack, and plugins never read them.
- Edited with `setSettings { planning }`, which replaces the saved object (null removes it): one undo step per change, autosaved and shared with the document. A weight of 1 and a family's default building aren't stored.
- Requests take `PlanRequestOptions`, whose `buildings` and `resourceWeights` are optional: left out, the planning manager uses the document's; given, they replace them for that plan (no merging, so a caller can still plan without them by passing `[]` or `{}`). `compare_recipes` follows the same rule.
- The planner card edits the saved values directly and no longer sends them; its session options are only the objective, alternates and exclusions. The Save profile shows the same controls under *Planner* ([[src/client/features/planner/planning-defaults.tsx]]).
- Fixed on the way: a weight typed into the card snapped to the 0.5 grid from 0.01 (5 became 5.01); weights now take any hundredth, arrows still move by 0.5.
