---
id: CARB-136
title: Suggest the recipes the factory needs next
type: feature
status: done
priority: low
labels: [ux, library]
wave: "4"
milestone: "M5 Daily driver"
---

A "Suggested" section in the recipe browser ([[CARB-134]]) with what is likely useful next, from the factory itself (no learning, plain rules): recipes that make an input a machine is short of, recipes that use an output nothing takes yet, and around the selected node, the recipes that connect to its open ports. Adding one from there connects it to the port it was suggested for.

- [x] Rules from the solve's diagnostics (deficits, unconnected outputs) and the selection's open ports
- [x] Ranked, deduplicated, with the reason shown ("makes the 2/s of Iron Plate the Assembler is short of")
- [x] Adding a suggestion connects it

## Decisions

- **Rules** ([[src/client/features/recipe-browser/suggest.ts]], pure, unit-tested): first the selection's open ports (inputs nothing feeds, outputs nothing takes; effective items when the solve has them, so plugin ports such as fuel count), then the last solve's deficits, then its surpluses, the largest first. Per port the best recipe: main product (or first ingredient) first, standard before alternate, the ones the factory already uses first, recycling left out; no recipe for a raw resource (a source supplies it). Each port served once, each recipe offered once (its first reason), at most five. Reasons: "Makes Iron Plate for Circuit", "Uses Copper Wire from Copper Plate" (or "Uses the Iron Gear it makes"), "Circuit lacks 0.2/s of Iron Plate" (an output or source is named as one: "Iron Gear output lacks 3/s of Iron Gear"), "Uses the 1.5/s of Slag nothing takes yet", in the document's rate unit.
- **Connecting**: a suggestion carries its port; adding it (click, Enter or drag) asks the canvas to add the node and the flow in one undo step (`addNode` with `connectTo`). Without a drop point the node goes six grid steps out from the port, its own port level with it, clear of the others (the recipe picker's placement).
- In the client like the browser's other rules: suggestions follow the selection, which only the client has. A manager method can take them over when an MCP client needs them.
- The Suggested group sits after Favourites and Recent, so the starred ones don't move when the selection changes.
