---
id: CARB-78
title: Factorio productivity research and quality of machines
type: feature
status: done
priority: low
labels: [plugins, factorio]
wave: "3"
milestone: "M3 Megafactory"
---

Follow-ups of [[CARB-44]].

- [x] Productivity research per recipe as a save setting, capped at the recipe's `maximum_productivity`
- [x] Quality of machines, modules and beacons themselves
- [x] Fuel as an input of burner buildings instead of a `fuel` metric (done with [[CARB-77]]: the node's `fuel` field)

## Decisions

- **Research is a save setting per technology**, not per recipe: the importer tags each recipe with the research that improves it (`research:steel-plate-productivity=0.1`, from the technologies' `change-recipe-productivity` effects), and the plugin offers one level field per technology the pack names (0 up to the level that reaches +300 %). Research counts where the building allows no productivity modules (scrap recycling in a recycler), and the total stops at `maximum_productivity` (+300 %, or a `maximum-productivity:<x>` tag; no 2.1.14 recipe sets one).
- **Quality of equipment is four node fields** (`machineQuality`, `moduleQuality`, `beaconModuleQuality`, `beaconQuality`) beside `quality`, the quality a node crafts at. +30 % per level (legendary is level 5): crafting speed at the same energy use; what modules are for, rounded down to 1 % (0.1 % for quality), drawbacks unchanged; generators make and burn more; beacons pass on 1.5 + 0.2 per level for a sixth less power per level.
- Reference numbers and sources are in [[Architecture/Plugins]] (Factorio) and `packs/factorio/CREDITS.md`.
