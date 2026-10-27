---
id: CARB-41
title: Run plugin hooks while compiling
type: feature
status: backlog
priority: urgent
labels: [plugins, engines]
wave: "2"
milestone: "M2 It's a game"
---

The hook pipeline in the `compiler` engine: `nodeFields`, `effectiveRecipe`, `constraints`, `recipeAvailable`, `derive`, `validate` ([[Architecture/Plugins]]).

**Done when** a test plugin exercising each hook changes the solve as expected.

- [ ] Tests with a fixture plugin first
- [ ] Each hook
- [ ] Derived metrics in results
