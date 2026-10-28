---
id: CARB-116
title: Hide the inspector while no factory is open
type: improvement
status: done
priority: medium
labels: [ui, shell]
wave: "4"
milestone: "M4 Ship"
---

Found in the visual review of [[CARB-65]]. The welcome and the first run's game picker are the app's first
impression, and beside them the inspector stands open, a third of the window, saying "Nothing selected —
Select a machine on the canvas to see its settings here" when there is no canvas and nothing to select
(`e2e/__screenshots__/onboarding.spec.ts/game-picker-*.png`).

Changing whether a panel shows is behaviour, so it was left out of the polish round: with no document open,
leave the inspector closed (keeping the person's choice for when a factory opens), or give it a message that
fits, and let the welcome centre in the whole window.

**Done when** the welcome and the game picker show without the inspector, and it comes back as it was once a
factory opens.

- [x] Reproducing test
- [x] Fix, with the onboarding baselines updated

## Decisions

- Both side panels follow the rule, since the library (now the recipe browser, [[CARB-134]], open by default) has nothing to browse without a factory either. The panels store keeps what the person chose apart from whether a factory is open (`chosen`, `factoryOpen` in [[src/client/shell/panels.ts]]); a panel's `open` is both, so every reader (the canvas's insets, the overlays, the top bar) follows without change. The shell says when a factory opens or the last one closes. A toggle on the welcome is kept for the next factory.
- Tests: [[src/client/shell/panels.test.ts]] (closed without a factory, back as they were; a toggle remembered) and `e2e/shell.spec.ts` (the welcome without either panel; they come back as left once a factory opens).
