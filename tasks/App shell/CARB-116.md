---
id: CARB-116
title: Hide the inspector while no factory is open
type: improvement
status: backlog
priority: medium
labels: [ui, shell]
wave: "3"
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

- [ ] Reproducing test
- [ ] Fix, with the onboarding baselines updated
