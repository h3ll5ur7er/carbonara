---
id: CARB-8
title: Create the template pack and the first pack build
type: feature
status: done
priority: high
labels: [packs]
wave: "0"
---

`packs/_template`: a small original example game (about 15 items, 12 recipes, with a loop and a byproduct) and a no-op plugin. It's the authoring template and our test fixture. Plus the minimal `pack-cli build` that zips a folder into a `.cpack`.

**Done when** `pnpm pack:build packs/_template` produces a `.cpack` that the pack schemas accept.

- [x] Original items, buildings, recipes, logistics (no game assets)
- [x] At least one cycle and one byproduct, for solver tests
- [x] No-op plugin using `definePlugin()`
- [x] Minimal `pack-cli build` (validate + bundle + zip), tests first

**What's in it:** *Template Works*, 15 items, 6 buildings and 12 recipes in [[packs/_template]]: a water loop (wash ⇄ purify), byproducts (slag, sludge), an alternate recipe, recipes two buildings can run (one at speed 2), and recycling with an expected-value output.

**Decision:** reading a pack's files (parse, validate, merge the data files in name order, check references) is the `packs` engine's pure `readPackFiles` ([[src/engines/packs/files.ts]]). The CLI uses it now and the app's loader ([[CARB-25]]) will use it on unzipped archives, so there is one definition of a valid pack. The minimal build in [[tools/pack-cli/build.ts]] calls the engine directly; [[CARB-28]] turns the CLI into a proper client of the `packs` manager.
