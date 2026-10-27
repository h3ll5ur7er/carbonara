---
id: CARB-54
title: Balance machine counts and choose units
type: feature
status: done
priority: medium
labels: [qol]
wave: "2"
milestone: "M2 It's a game"
---

Fit to demand or supply, round to buildable, per-document units including belts.

**Done when** tests cover each balance action and unit conversion with pack logistics.

- [x] Balance actions: "Fit to demand" / "Fit to supply" in the inspector, from [[src/client/shell/inspector/balance.ts]] (unit tests), pinning the count
- [x] Round to buildable: `settings.machineGroups` ("fill" or "even"), shown on every machine card
- [x] Units incl. belts: `settings.belt`, converted with the pack's logistics capacities ([[src/client/canvas/model/format.ts]], unit tests); units picker on the canvas and "Show rates …" commands
- [x] `setSettings` command (engine and property tests); e2e in [[e2e/qol-units.spec.ts]]

Round to buildable is a per-document display choice, not per node: both forms are buildable, and a factory is usually planned one way. Rules on [[Design/Editor quality of life]] (Balance and units).

Open: terminal pills truncate long belt names ("0.73 × Fast Conv…"); the inspector's subtitle still reads machine counts the "fill" way (it uses `utilities/numbers`).
