---
id: CARB-135
title: Favourite and recent recipes
type: feature
status: review
priority: medium
labels: [ux, library]
wave: "4"
milestone: "M5 Daily driver"
---

Bring the recipes a player uses most to the top of the recipe browser ([[CARB-134]]): favourites they pin with a star, and the recipes they added most recently, per game pack. Kept in the preferences store, so they survive restarts. Also offered first in quick-add (Ctrl+K).

- [x] Favourite or unfavourite a recipe from the browser, the canvas card's menu and the inspector
- [x] Recents: the last recipes added to any factory of that pack, newest first, capped
- [x] Both sections at the top of the browser and first in quick-add

## Decisions

- **Stored** in the preferences as `recipes`: a record by pack id of `{ favourites, recent }` ([[src/contracts/preferences.ts]] `RecipeMemory`), through `workspace.getPreferences` / `setPreferences`, so no manager or MCP contract changed. The client mirrors it in a store ([[src/client/features/recipe-browser/memory.ts]]) that loads once and saves every change; records keyed by pack id are read with `own`.
- **Favourites** keep the order they were starred in. Starring: the row's star (on hover, filled once starred), `F` on a focused row, the row's context menu, the node context menu's *Add to favourites* / *Remove from favourites* (a `recipe.toggleFavourite` command for the selected machines; a new optional `menuTitle` on commands lets context menus say which, and leave it out for nodes without a recipe), and a star in the inspector's header for recipe nodes.
- **Recents**: the last 8 recipes added from the browser (click, drag, Enter, suggestions), quick-add and the recipe picker, newest first, each once. Pastes, plans and undo don't count: they aren't a person picking a recipe.
- **Quick-add**: with nothing typed, the palette lists *Favourite recipes* then *Recent recipes* first; while typing, matches that are favourites (then recents) rank above other matches (a custom cmdk filter over its default score).
