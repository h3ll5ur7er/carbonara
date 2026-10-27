---
id: CARB-105
title: Keep the planner's resource weights and buildings in the save profile
type: improvement
status: backlog
priority: low
labels: [planner]
milestone: "M3 Megafactory"
---

Follow-up of [[CARB-81]]. Resource weights and the preferred buildings live in the plan options: the planner card keeps them for the session, and MCP clients pass them with each plan. A save that never uses asteroids, or has steel furnaces everywhere, has to say so again each time.

- [ ] Store them with the document (beside the save profile in `settings`), so the planner card and `plan_production` start from them
- [ ] Edit them in the Save profile panel too
- [ ] A pack may suggest defaults (Factorio's asteroid chunks weighing more without Space Age's research)
