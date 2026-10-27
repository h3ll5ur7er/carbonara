---
id: CARB-8
title: Create the template pack and the first pack build
type: feature
status: todo
priority: high
labels: [packs]
wave: "0"
---

`packs/_template`: a small original example game (about 15 items, 12 recipes, with a loop and a byproduct) and a no-op plugin. It's the authoring template and our test fixture. Plus the minimal `pack-cli build` that zips a folder into a `.cpack`.

**Done when** `pnpm pack:build packs/_template` produces a `.cpack` that the pack schemas accept.

- [ ] Original items, buildings, recipes, logistics (no game assets)
- [ ] At least one cycle and one byproduct, for solver tests
- [ ] No-op plugin using `definePlugin()`
- [ ] Minimal `pack-cli build` (validate + bundle + zip), tests first
