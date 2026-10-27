---
id: CARB-29
title: Produce the Satisfactory pack data
type: feature
status: done
priority: high
labels: [packs, satisfactory]
wave: "1"
milestone: "M2 It's a game"
---

Importer from `Docs.json` (as the pack's importer hook), icons as WebP, `CREDITS.md`. The mechanics plugin is a separate task.

**Done when** `packs/satisfactory` builds into a `.cpack` with all items, buildings, recipes (incl. alternates tagged), logistics with aliases and resources, and validates.

- [x] Importer with fixture tests
- [x] Icon sourcing + WebP pipeline
- [x] Aliases for belts and pipes
- [x] CREDITS.md
- [x] `pnpm pack:import` script (stand-in for `carbonara-pack import`, [[CARB-28]])
- [x] Sanity test of the committed data against in-game numbers
- [ ] Icons for the Biomass Burner and the Resource Well Extractor (no source found)

## Result

`packs/satisfactory` holds Satisfactory 1.1: 168 items (all with icons), 21 buildings (19 with icons), 308 recipes (110 alternates, 17 generator fuels tagged `power`), belts Mk.1–Mk.6 and pipelines Mk.1–Mk.2 with aliases, and 13 resources with map limits (water unlimited). `pnpm pack:build packs/satisfactory` validates with no issues. How to regenerate it is in the pack's README; conventions are in [[Architecture/Game packs]].

## Decisions

- **Source data:** the game's own `en-US.json` for 1.1 (UTF-16), taken from a public repository because we have no game install; the importer also reads UTF-8 copies and the pre-1.1 name `Docs.json`. Only a small excerpt is committed, as the test fixture (`packs/satisfactory/plugin/importer.fixture.ts`).
- **Scope of the data:** recipes run by machines only (no build gun, workbench or equipment workshop); items only when a machine recipe, a generator or a resource node uses them, so pickers don't offer jetpacks. Clean pipelines (same pipe without flow indicator) are left out.
- **Generators:** each fuel is a recipe tagged `power` that burns one piece or one m³ at full power, with the water it needs and its waste, so nuclear waste can feed the plutonium chain. Power output itself stays a building property for [[CARB-43]].
- **Variable-power machines** (Particle Accelerator, Converter, Quantum Encoder) get the middle of their estimated range as `power.consume`; their per-recipe power is for [[CARB-43]].
- **Clock:** every building gets `fields.clock: { min: 1, max: 250, default: 100 }`; the plugin interprets nothing yet.
- **Resource limits:** not in Docs.json; the 12 totals SatisfactoryTools uses for 1.0+ live in `MAP_LIMITS` in the importer.
- **Icons:** items are matched by the game's texture name, buildings by display name (wiki-style file names); the largest image wins and is converted to 64×64 WebP with sharp. We didn't use SatisfactoryTools' images because its licence forbids derivative use. Sources and terms are in `packs/satisfactory/CREDITS.md`; permission to ship them is [[CARB-31]].
- **Tests:** Vitest only runs tests below `tools/`, and `tsconfig` doesn't include `packs/`, so the importer's tests are `tools/pack-cli/import.satisfactory.test.ts` (they typecheck the plugin through their imports).

Reviewed by the integrator: spot-checked recipes, belts and pipes against the game; `pnpm pack:build packs/satisfactory` validates. Publishing still waits on [[CARB-31]].
