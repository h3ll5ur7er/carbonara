---
id: CARB-40
title: Reuse blueprints from a library
type: feature
status: review
priority: medium
labels: [subgraphs, ux]
wave: "3"
milestone: "M3 Megafactory"
---

Blueprint library panel; drag a blueprint into any graph as a ghost.

**Done when** two instances share one summary and editing the blueprint updates both.

- [x] Library panel
- [x] Ghost drag (shared renderer)
- [x] Tests

## Decisions

- **The library is the left panel** (`Ctrl+B`), which was a placeholder: each blueprint of the document as a card with its port items, how often it's placed and how many nodes it holds ([[src/client/features/subgraphs/library-panel.tsx]]). A blueprint that would contain itself can't be placed (its card is disabled). Managing blueprints (rename from the card, duplicate, delete) is [[CARB-87]].
- **Placing uses the shared ghost renderer's pointer mode** unchanged: pressing a card makes the blueprint follow the pointer as a ghost. A click on the canvas places it (the ghost API's `onGhostPlace`); letting go of a drag over the canvas places it at the same spot the ghost showed, computed from the pointer with a new, additive canvas action `toFlow(screen)` (React Flow's drag-to-select pane only reports clicks for a press on the pane itself, so a drag from the panel can't end in one). `Esc` cancels; `Enter` on a card places it mid-view, clear of other nodes.
- **Shared summary:** all instances compile to the same blueprint in the model, so the solver summarises it once; [[src/managers/analysis.test.ts]] checks that, and that editing the blueprint (a pin inside) changes both instances' scale. [[e2e/subgraphs.spec.ts]] places a blueprint twice from the library, edits it inside one copy and sees both change.
