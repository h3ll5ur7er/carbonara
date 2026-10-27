---
id: CARB-63
title: Plan 2 yellow belts of steel end to end
type: chore
status: review
priority: medium
labels: [mcp, tests]
wave: "2"
milestone: "M2 It's a game"
---

The end-to-end scenario from [[Architecture/MCP server]] as an automated test.

**Done when** the scripted client produces the expected proposal and accepting it yields a deficit-free factory.

- [x] Scenario test: [[tools/mcp-scenario.test.ts]], with the Factorio pack, the real managers and the solver
- [ ] Switch to `convert_rate` once the planning manager has it (the client reads the belt's capacity from `get_pack_data` for now)
- [ ] Switch to the real `plan_production` ([[CARB-45]]); a fake planner answers for now
- [ ] Switch accepting to `apply_proposal` ([[CARB-46]]); it runs the proposal's commands through `edit_graph` for now

The places to change are marked `SWITCH` in the test. The Rust half of the trip (MCP client → server → bridge) is tested in [[crates/mcp/tests]].
