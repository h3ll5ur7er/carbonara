---
id: CARB-65
title: Polish every scene
type: improvement
status: review
priority: high
labels: [ui]
wave: "3"
milestone: "M4 Ship"
---

Visual QA over every canonical scene, empty states, micro-interactions.

**Done when** a visual review signs off each scene.

- [x] Review
- [x] Fixes
- [x] Sankey overview: faint text from the canvas shows through the bands (`e2e/__screenshots__/planner-overviews.spec.ts/sankey-*.png`), and a few labels still touch band edges

## Review

Every scene in `src/client/scenes/registry.ts` and every baseline under `e2e/__screenshots__/`, in dark and light, plus live-app states the baselines don't cover (welcome, no results, planner error, hover and focus). In the order of the first impression:

| Scene or state | Found | Fixed |
| --- | --- | --- |
| Welcome (`/`, nothing open) | Plain heading, text wrapped to a lone "too.", no brand | The mark above a larger heading, balanced muted text in a wider column; the mark is one primitive (`ui/mark.tsx`) for the top bar, welcome and game picker |
| Game picker (`onboarding.spec.ts/game-picker-*`) | Good; hover and focus light the card in the pack accent. Text could rag | Balanced text. The busy loader didn't turn (see Motion) |
| Tour (`tour-add-*`) | Good. The "Waiting for you" dot didn't pulse (see Motion) | Motion tokens |
| Canvas cards (`canvas.spec.ts/cards-*`, `scenes.spec.ts/*`) | Port names and rates at 12 px read small at zoom 1; counts like "0.63" touched the efficiency ring | Port rows at 13 px; ring 44 px, long counts closed up |
| Instances (`subgraphs.spec.ts/instances-library-*`) | "Open" was bare 11 px text at the strip's edge | An accent pill aligned with the port chips; port rows as above |
| Frames at chip zoom (`qol-arrange.spec.ts/arranged-chain`, `lod-chip-*`) | "WATER LOOP" ran into the frame's note: the 32-unit label started 24 units down, past the room arrange leaves | Labels at every zoom fit in the two grid steps above a frame's nodes |
| Compact zoom (`lod-compact-*`) | Clean | — |
| Inspector (`shell-panels.spec.ts/inspector-*`) | Clean; fields aligned, empty state calm | — |
| Save profile (inspector, nothing selected) | "1 of 1 unlocked" all monospace beside a sans heading | Inter with tabular figures |
| Planner goals and proposal (`planner-scene.spec.ts/*`) | Clean. With no plan, the error was 11 px red text squeezed beside the buttons | A full-width danger callout above the buttons, like the shortfalls. A sliver of the factory peeks out beside the card: [[CARB-115]] |
| Totals (`planner-totals.spec.ts/*`) | Clean; bars, tiles and warnings consistent | — |
| Sankey (`planner-overviews.spec.ts/sankey-*`) | Canvas text showed through the 95% backdrop and translucent bands; labels touched band edges; legend swatches paler than the outlines | Opaque backdrop, a 3 px halo, 34 px label room, swatches in the outline colours |
| Heatmap (`heatmap-*`) | Clean | — |
| Ghost paste (`ghost-paste-*`, `qol-clipboard.spec.ts/*`) | Clean; label pill and frame read well | — |
| Palette, quick-add, find (`shell-palette.spec.ts/*`, `qol-find.spec.ts/*`) | Clean, no-results states centred and calm | — |
| Cheat sheet (`qol-shortcuts.spec.ts/cheat-sheet`) | Pencils of rows without a shortcut sat in the remove column | The column is kept, so every pencil lines up |
| Menus, context menu, dialogs, select (`ui.spec.ts/*`, `context-menu-node`) | Clean | — |
| Toasts (`toast-error-*`) | Clean; rise-in respects reduced motion | — |
| Selection toolbar, units, spacing marks, insert target, frames and tags | Clean | — |
| Empty states: empty factory, empty library, no blueprints, nothing selected, no alternates match | Consistent (icon tile, title, one line of help) | — |
| Motion | `animate-spin` and `animate-pulse` drew nothing: the tokens reset Tailwind's stock animations | `--animate-spin`, `--animate-pulse` tokens; both call sites already stop for reduced motion. Every other loop (particles, ghost and tour breathing) is behind `prefers-reduced-motion` |
