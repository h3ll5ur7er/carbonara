---
id: CARB-134
title: Browse every recipe in the left panel
type: feature
status: done
priority: high
labels: [ux, library]
wave: "4"
milestone: "M5 Daily driver"
---

The left panel only lists the factory's blueprints, so it's empty for most factories. Make it the place to find and add recipes: every recipe of the factory's pack, searchable, and grouped by building, by product category and by the technology that unlocks it, where the pack says so. Blueprints stay, as a second section or tab.

**Done when** a player can find any recipe without knowing its name (browse by machine or category), add it by click, drag or keyboard, and the panel is useful from the first second of a new factory.

- [x] Pack format: optional grouping data for recipes (a category, and what unlocks it), filled by the Satisfactory and Factorio importers where the game data has it
- [x] Panel: search, group by (building / category / unlock), collapsible groups, item icons, alternates marked
- [x] Add to the canvas: click places at a free spot, drag places at the drop (ghost), Enter from the keyboard; the new node is selected
- [x] The left panel opens by default once a factory is open
- [x] Wiki: Design (Recipe browser, side panels, keyboard map), Game packs (recipe groups, importer conventions), Pack authoring (group your recipes), Editor quality of life (blueprints tab)
- [x] e2e: browsing, searching, adding by click, drag and keyboard; axe over the browser's states; the `recipe-browser` scene in both themes

## Decisions

- **Pack format 1.2** ([[Architecture/Game packs]]): two optional top-level sections, `categories` and `unlocks`, each a list of `{ id, name, section? }` in the order the browser shows them, and two optional recipe fields, `category` and `unlock`, that name an entry; the packs engine checks the references and duplicates. Lists rather than names on each recipe, so a name and an order are written once. `section` is one wider heading (Factorio's crafting menu tab, Satisfactory's tier), shown between groups; one level of collapsible groups keeps the list calm. The built-in packs declare `engine: ^1.2` (Factorio 2.1.0, Satisfactory 1.1.0, the template 1.1.0).
- **Factorio**: categories are the crafting menu's rows (item subgroups, named from their ids, under their item group); every one of the 624 recipes has one, recycling sitting with what it takes apart. Unlocks are the 165 technologies that unlock recipes, sectioned by the latest science pack they need (trigger technologies take their prerequisites'), ordered by that pack and then depth in the tree.
- **Satisfactory**: unlocks only (34): milestones and HUB upgrades by tier, MAM research by tree, hard drives; generator fuels with their generator. The game data has no product category for parts (the AWESOME Shop's covers half), so the pack has none and the browser offers Machine and Unlock.
- Re-importing the committed sources at the base commit reproduced the committed data byte for byte for both packs before the change; the regenerated files differ only by the new fields (recipes that got one no longer fit on one line, so a few short ones are now written as blocks).
- **Where the rules live**: grouping, search ranking and suggestions are pure functions in the client feature (`browse.ts`, `suggest.ts`), like the recipe picker's: the layer rules keep engines out of the client, and they order what one person sees per key press and per selection, where a manager round trip adds latency and a contract nobody else needs yet.
- **The panel**: tabs (Recipes, Blueprints) in the library; the browser is a virtualised tree with fixed row heights. Recycling (`recycling` tag) is hidden behind a filter, alternates shown and marked. Searching shows a flat, ranked list instead of groups. A drag from the panel is placed by the canvas where its ghost is (`placing` store, and a pointer-up over the canvas after a drag that began outside it); blueprints now use the same drop, so they land exactly where the ghost showed them.
- **Icons**: packs ship icons, but the client can't load them yet; chips use the monogram fallback ([[CARB-137]]).
- **Follow-ups**: [[CARB-137]] (pack icons), [[CARB-138]] (recipes the plugin rules out), [[CARB-139]] (fitting readably with both panels open: at 1440 px the canonical chain now opens in compact cards).
