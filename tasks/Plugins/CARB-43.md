---
id: CARB-43
title: Model Satisfactory mechanics
type: feature
status: done
priority: urgent
labels: [plugins, satisfactory]
wave: "2"
milestone: "M2 It's a game"
---

Clock speed, power shards, somersloops, alternates with a save profile panel, and the power curve.

**Done when** reference factories from the game produce the in-game numbers (fixtures with expected values).

- [x] Fixture factories with expected numbers first ([[tools/pack-cli/satisfactory.mechanics.test.ts]])
- [x] Each mechanic: clock speed (1–250 %), power shards (100 % + 50 % per shard, up to 3), somersloops (output × (1 + filled / slots), budget as a plugin constraint), alternates via `recipeAvailable`, power curve and generator output in `derive`
- [x] Save profile panel ([[src/client/features/save-profile/save-profile.tsx]]), shown in the inspector when nothing is selected
- [x] E2E: [[e2e/plugins.spec.ts]]

Decisions:

- Formulas and numbers come from the game's own Docs file (1.1): exponent 1.321929 (`mPowerConsumptionExponent`), boost exponent 2, shard +50 %, slots per building. The Smelter gets 1 somersloop slot although Docs says 0 (see [[Architecture/Plugins]], Satisfactory).
- A clock above what the node's shards allow runs at the limit, with a warning; shards aren't derived from the clock.
- No save profile (`settings.plugin.unlocked` absent) means every alternate is unlocked.
- The somersloop budget is opt-in (`limitSomersloops` + `somersloops`), so a plain number field never has to mean "unlimited".
- Fractional machine counts draw power like the game builds them: whole machines plus one underclocked machine.
- Document settings change through a new `setPluginSettings` command (one undo step).

Open:

- Variable-power machines (Particle Accelerator, Converter, Quantum Encoder) still use the middle of their power range; per-recipe power needs the importer to read each recipe's `mVariablePowerConsumptionConstant` and `…Factor`.
- The somersloop budget counts fractional machines linearly.
- Recipe pickers don't filter locked alternates yet (they could use `unlockedRecipes`).
