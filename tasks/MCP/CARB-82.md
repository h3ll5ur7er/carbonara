---
id: CARB-82
title: MCP proposals as ghosts and apply_proposal
type: feature
status: done
priority: medium
labels: [mcp, planner]
wave: "3"
milestone: "M2 It's a game"
---

`plan_production` returns a proposal to the MCP client, but the person doesn't see it in the app. [[Architecture/MCP server]] promises a ghost with *Accept*, *Adjust* and *Discard*, as the planner card shows it ([[CARB-46]]).

- [x] A proposal made through MCP opens in the planner card as a ghost on the active tab
- [x] `apply_proposal` accepts a proposal by id (one undo step, "AI: …" label), or tells the model the person discarded it
- [x] `convert_rate` ("2 full yellow belts" → 30/s with the pack's logistics)
- [x] Switch [[tools/mcp-scenario.test.ts]] to it (marked `SWITCH`)

## Decisions

- **Proposal state lives behind the planning manager**, in a `ProposalStore` (proposals access, in memory). Planning makes, replaces and discards proposals; editing accepts them (`editing.applyProposal`), since adding the commands and the undo step is its use case. The store is shared like the `DocumentStore`, so the managers never call each other; `proposalChanged { proposal, status }` tells the UI. See [[Architecture/Planning#Proposals]].
- **One pending proposal per document:** a newer plan replaces it (`replaced`), so the card and the model never disagree about which ghost is on screen.
- **`apply_proposal` is in the *Edit* group**, not *Plan*: it changes the factory without the person's click, which is what *Edit* opts into; *Plan* promises proposals only. With *Plan* alone the person accepts in the app.
- **The model names the undo step** (`label`, required; the bridge prefixes `AI: `), as with `edit_graph`.
- **A proposal opens on its document's tab:** the planner switches tabs to it, so a proposal for a document in the background isn't lost.
- *Adjust* now loads the proposal's targets as the goals, so an AI proposal can be adjusted like the person's own.
- `convert_rate` is a *Read* tool on the planning manager (pure rule in the planning engine, [[src/engines/planning/rates.ts]]); it reads belts and pipes by id, name or alias (plural and "full" allowed) at full capacity, or plain rate units.

Known limit: when the model accepts a proposal whose ghost the person dragged, it lands where it was planned (the offset lives in the card).
