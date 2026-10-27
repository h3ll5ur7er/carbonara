---
id: CARB-130
title: Let a pack suggest the planner's defaults
type: improvement
status: backlog
priority: low
labels: [planner, packs]
milestone: "M3 Megafactory"
---

Follow-up of [[CARB-105]], which saves the preferred buildings and resource weights with the document (`settings.planning`). A pack knows sensible starting points the person would otherwise have to find: Factorio's asteroid chunks weighing more until Space Age's research is in the save, so "fewest raw items" for steel doesn't plan asteroid crushing ([[Architecture/Planning]], Limits).

**Done when** a pack can suggest default resource weights (and perhaps buildings) that a document without its own uses, the save profile shows them as suggested, and saving one keeps the person's value.

- [ ] Decide where suggestions come from: pack data (a `weight` on `resources` entries) or a plugin hook that depends on the save profile (Space Age on or off)
- [ ] The planning manager falls back request → document → pack suggestion
- [ ] Factorio suggests weights for the asteroid chunks
