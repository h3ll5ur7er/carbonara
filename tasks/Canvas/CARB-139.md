---
id: CARB-139
title: Fit a factory readably with both side panels open
type: improvement
status: backlog
priority: medium
labels: [ux, canvas]
wave: "4"
milestone: "M5 Daily driver"
---

Found in [[CARB-134]]. Since the library opens by default beside the inspector, a 1440 px window leaves the canvas about 790 px between them, and fitting a medium factory (the canonical 20-node chain, a subgraph's insides) now lands below zoom 0.6, so it opens in compact cards: names and machine counts, no rates or ports' items. That is legible but less useful than before, when the library started closed.

The left-docked overlays add to it: the planner and the totals stand beside the library, so with all three open the canvas keeps about a third of the window, and the Sankey overview's labels start to overlap at that width (`e2e/__screenshots__/planner-scene.spec.ts/`, `planner-overviews.spec.ts/sankey-*.png`). Closing the library while one of them is open, or letting them cover it, is part of the choice.

**Done when** opening a factory shows full cards whenever they fit at a readable size, for example by fitting to a minimum zoom around the factory's centre (or its most recent edit) rather than to the whole graph, or by narrowing the panels on narrow windows; the choice is measured on the canonical scenes at 1280 and 1440 px.

- [ ] Decide the rule (minimum zoom, panel widths by window width) and write it down in [[Design]]
- [ ] Screenshots of the canonical scenes at both widths
