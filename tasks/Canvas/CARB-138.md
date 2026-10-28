---
id: CARB-138
title: Show which recipes the factory can't use in the recipe browser
type: improvement
status: backlog
priority: low
labels: [ux, library, plugins]
wave: "4"
milestone: "M5 Daily driver"
---

Found in [[CARB-134]]. The recipe browser lists every recipe of the pack. What a factory may use is the pack plugin's to say (`recipeAvailable`: Satisfactory's locked alternates, Factorio with Space Age turned off), and only the backend runs plugins, so the browser can't tell: a locked alternate added from it gets the canvas's warning only afterwards. The planner already asks the plugin (`runtime.unavailableRecipes`, [[Architecture/Planning]]).

**Done when** recipes the document's settings rule out are marked in the browser (dimmed, with why) and left out of its suggestions, and a filter shows or hides them; the list follows when the save profile changes.

- [ ] A manager method for the recipes the document's plugin settings rule out (or a field of the results), with its contract test
- [ ] The browser marks them and its suggestions skip them
