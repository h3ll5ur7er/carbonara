---
id: CARB-24
title: Set up the screenshot scenes
type: chore
status: review
priority: high
labels: [ui, tests]
wave: "1"
milestone: "M1 It flows"
---

The canonical scenes from [[Design]] as fixtures, with Playwright screenshot tests in dark and light.

**Done when** the scenes exist and CI compares them.

- [x] Scene mechanism: `?scene=<name>` in development, a registry ([[src/client/scenes/registry.ts]]), lazy-loaded and left out of production builds; `?scene=` lists the scenes
- [x] Scenes: empty, 20-node chain (placeholder until [[CARB-16]]), congested (placeholder until [[CARB-17]]), inside a subgraph (placeholder until [[CARB-39]]), ghost paste (placeholder until [[CARB-51]])
- [x] Screenshot tests in dark and light ([[e2e/scenes.spec.ts]]); CI runs them with `pnpm e2e`
- [x] Baseline update workflow documented in [[Development]]
- [ ] Replace the placeholders with the real canvas scenes as they land (their tasks register them under the same names)

**Decisions:**

- Scenes are React components registered by name; canvas scenes live with the canvas (`src/client/canvas/scenes/`) and take over a placeholder's name, so `e2e/scenes.spec.ts` doesn't change. Placeholders render the shell with a note naming the task that builds the real scene, so a placeholder baseline can't be mistaken for the real thing.
- The host wraps a loaded scene in `[data-scene=<name>]` for tests to wait on.
- The screenshot comparison got a per-pixel threshold of 0.05 (Playwright's default is 0.2): at the default, a whole side panel appearing in the dark theme went unnoticed. `pnpm e2e --update-snapshots=all` is the update command, because plain `--update-snapshots` leaves images that still pass, letting baselines drift.
- The empty state is now the `empty` scene; `e2e/shell.spec.ts` checks that the real app (with its backend worker) opens on it.
