---
id: CARB-56
title: Customise shortcuts, context menus and export
type: feature
status: review
priority: low
labels: [qol]
wave: "2"
milestone: "M3 Megafactory"
---

Shortcut editor and cheat sheet (from the command registry), context menus, export to PNG/SVG.

**Done when** each has tests.

- [x] Shortcut editor + cheat sheet: `?`; [[src/client/features/shortcuts/custom.ts]] (unit tests), saved in local storage
- [x] Context menus: nodes, flows, empty canvas; `Shift+F10` and the menu key
- [x] Export PNG/SVG: [[src/client/canvas/model/image-frame.ts]] (unit tests), `html-to-image`
- [x] e2e: [[e2e/qol-shortcuts.spec.ts]]

Open: shortcuts live in local storage until the preferences access component exists. Context menus cover the canvas; the side panels and tabs have none yet. See [[Design/Editor quality of life]] (General).
