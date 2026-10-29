---
id: CARB-140
title: Show the game packs' icons behind a build setting
type: feature
status: done
priority: high
assignee: h3ll5ur7er
labels: [ux, packs, legal]
wave: "4"
milestone: "M5 Daily driver"
---

Asked by the owner for [[CARB-31]]: screenshots with the games' own icons make the case to their publishers. The icons are in the repository but no build ships them, and no published build may until the publisher agrees, so they come behind a setting that is off by default and names the packs one by one (each publisher answers for its own game).

**Done when** a build made with `CARBONARA_PACK_ICONS` shows the named built-in packs' icons in item chips, building tiles and the overview chips, a build without it is unchanged, and [[Development]] says how to use it.

- [x] `CARBONARA_PACK_ICONS` (`all`, or pack ids separated by commas; environment or `.env.local`) read by the Vite config, for the web and the desktop build
- [x] The built-in packs' renderer emits an icons module (data URLs by path) only for the named packs; it loads after the pack's data
- [x] `packs.getPackIcons` through the library; installed packs have none yet ([[CARB-137]])
- [x] `PackIconsProvider` in the shell; `ItemChip`, `BuildingTile` and `OverviewMark` draw the icon or the monogram
- [x] Screenshots of both games with icons for the owner
