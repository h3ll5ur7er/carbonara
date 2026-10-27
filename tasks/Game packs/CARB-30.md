---
id: CARB-30
title: Produce the Factorio pack data
type: feature
status: review
priority: medium
labels: [packs, factorio]
wave: "1"
milestone: "M3 Megafactory"
---

Importer from the `--dump-data` output, icons as WebP, `CREDITS.md`. The mechanics plugin is a separate task.

**Done when** `packs/factorio` builds and validates, including fluids and Space Age items where present.

- [x] Importer with fixture tests
- [x] Icons
- [x] Aliases (yellow/red/blue belt …)
- [x] CREDITS.md
- [x] `pack:import` takes the 64 px square of Factorio's mipmapped icons
- [x] Sanity tests of the committed data against in-game numbers
- [ ] Icon for the Pistol (FactorioLab has none; only its own recycling recipe uses it)

## Result

`packs/factorio` holds Factorio 2.1.14 with Space Age: 304 items (21 fluids, all but the Pistol with icons), 24 buildings (all with icons), 612 recipes (224 tagged `space-age`, 282 recycling), yellow to turbo belts with colour aliases, pipes, and 23 resources with their extractors. Rates are per second. `pnpm pack:build packs/factorio` validates with no issues. All 612 recipes (times, ingredients, products, machines) and the item names match FactorioLab's 2.1.20 Space Age data. How to regenerate the pack is in its README; conventions are in [[Architecture/Game packs]]; sources in `packs/factorio/CREDITS.md`.

## Decisions

- **Version:** the task asked for 2.0, but the only real `--dump-data` outputs in public repositories are 2.1 (2.1.14, documented, with Space Age; the current version). The importer reads both: 2.1 recipes have `categories`, 2.0 recipes one `category` (tested).
- **Source data:** the dump from alecraso/factorio-mcp-server plus the game's English locale files from Midnighttigger/en-gb. The locale is optional; without it names come from the ids. Only an excerpt is committed, as the test fixture (`packs/factorio/plugin/importer.fixture.ts`).
- **Space Age tagging:** recipes are tagged with every expansion mod they need (`space-age`, `quality`, `recycler`, `elevated-rails`): the mod of their icon and items, and of their machines when no base machine runs them. Buildings from an expansion have `fields.mod.name`. The dump doesn't record a prototype's mod, so the icon path (`__space-age__/…`) decides. Items and resources carry no mark (the contract has no field for it); filtering recipes and buildings is enough to keep a base-game plan base-game.
- **Recipes:** every recipe a crafting machine runs, with every machine whose categories match; base machines first, slower before faster (the first is the default: stone furnace, assembling machine 1). Recycling recipes are in (tagged `recycling`; scrap recycling matters on Fulgora); other hidden recipes, parameters and recipes of hidden or spawnable items are out. Probabilistic results are expected values; catalysts stay on both sides.
- **Buildings:** crafting speed as `speed` (mining speed for drills); `power.consume` in MW with electric drain (1/30 for crafting machines: assembling machine 1 is 77.5 kW). For CARB-44, `fields` keeps `modules` (slots, accepted effects), `base-effect` (foundry, electromagnetic plant, biochamber +50% productivity) and `energy` (burner fuel categories). Recipes that accept productivity are tagged `productivity`.
- **Resources:** no `limit` (Factorio's are infinite). Extractors: drills by resource category, offshore pumps for tile fluids (water, lava, heavy oil, ammoniacal solution), agricultural towers for plant products, asteroid collectors for chunks.
- **Logistics:** belt capacity `speed × 480` (15/30/45/60 per second), aliases from a table (yellow/red/blue/green). Pipes: 6000/s, a constant (2.x fluid segments; not in the data).
- **Icons:** cut from FactorioLab's 2.1.20 sprite sheet by `packs/factorio/scripts/factoriolab-icons.ts`; matched by prototype name, then by the dump's icon file name. `pack:import` now treats an image wider than tall as a mipmap strip and uses its left square, so the game's own `graphics/icons` folders work too.
- **Tests:** `tools/pack-cli/import.factorio.test.ts` (importer against the fixture, committed data against in-game numbers) and a mipmap test in `tools/pack-cli/import.test.ts`.

## Left for CARB-44 and later

The importer drops, and can be extended to keep: fluid temperatures (one `steam` item; recipe temperature limits), heat and all power generation (boilers, engines, turbines, reactors, solar, fusion; steam is a raw input for now), `ignored_by_productivity`/`maximum_productivity`, beacons and modules themselves, quality levels, surface conditions (which planet or space), spoilage, plant seeds and growth, the sulfuric acid uranium mining needs, mining rates and belt stacking. See the pack's README.
