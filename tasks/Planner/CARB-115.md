---
id: CARB-115
title: Keep the factory clear of the planner card when revealing a proposal
type: improvement
status: backlog
priority: low
labels: [ui, planner]
wave: "3"
milestone: "M4 Ship"
---

Found in the visual review of [[CARB-65]]. In the `planner` scene the proposal is revealed alone (the
factory and the ghost together would be too small to read), and the copper line it sits beside ends up
behind the planner card, with a sliver of a source pill ("…rite C…") peeking out between the card and the
window's left edge (`e2e/__screenshots__/planner-scene.spec.ts/*.png`).

This is the reveal's behaviour, not a style: when the ghost is shown alone, either keep the factory's nodes
wholly behind the card or wholly out of view, or bring the nearest part of the factory in at a smaller zoom.

**Done when** no node is cut by the planner card's edge after a proposal is revealed, in the `planner` scene.

- [ ] Decide which of the reveals reads best
- [ ] Reproducing e2e check, then the fix
