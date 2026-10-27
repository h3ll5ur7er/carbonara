---
id: CARB-67
title: Document pack and plugin authoring
type: docs
status: review
priority: medium
labels: [docs, packs]
wave: "3"
milestone: "M4 Ship"
---

Guide pages for pack authors: from `carbonara-pack new` to a published pack, plugin hooks with examples.

**Done when** someone can build a pack from the guide alone.

- [x] Guide pages: [[Guides/Pack authoring]], [[Guides/Plugin authoring]] (linked from [[Home]])
- [x] Worked example: *Brick Works*, data, a starter and a plugin using every hook but the importer
- [x] Followed the guide in a scratch folder: `new` outside the repo, data, `validate`, starter, `pack:build`, then installed the `.cpack` through the packs manager, opened its starter and solved it with the plugin; the guide's example test passes

## What following the guide fixed

- `carbonara-pack validate` now type-checks `plugin/index.ts` ([[tools/pack-cli/typecheck.ts]]): the example's first draft had type errors that `build` bundled without a word.
- `carbonara-pack new` leaves the template's starter out (it fails validation once an author replaces the data).
- Plugins can't add items through `effectiveRecipe` that a player can connect: the canvas draws ports from the pack's recipe. Documented in the guide; follow-up [[CARB-95]].
