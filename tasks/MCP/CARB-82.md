---
id: CARB-82
title: MCP proposals as ghosts and apply_proposal
type: feature
status: todo
priority: medium
labels: [mcp, planner]
wave: "3"
milestone: "M2 It's a game"
---

`plan_production` returns a proposal to the MCP client, but the person doesn't see it in the app. [[Architecture/MCP server]] promises a ghost with *Accept*, *Adjust* and *Discard*, as the planner card shows it ([[CARB-46]]).

- [ ] A proposal made through MCP opens in the planner card as a ghost on the active tab
- [ ] `apply_proposal` accepts a proposal by id (one undo step, "AI: …" label), or tells the model the person discarded it
- [ ] Switch [[tools/mcp-scenario.test.ts]] to it (marked `SWITCH`)
