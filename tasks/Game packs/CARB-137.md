---
id: CARB-137
title: Show the packs' icons in the app
type: feature
status: backlog
priority: medium
labels: [ux, packs, library]
wave: "4"
milestone: "M5 Daily driver"
---

Found in [[CARB-134]]. The Factorio and Satisfactory packs ship 64 px WebP icons for nearly every item and building (`icons/`, referenced by `icon:` in their data), but nothing brings them to the client: the built-in packs' virtual module carries data and plugin only, installed packs keep their icons in the archive, and every chip in the app (node cards, the recipe browser, the recipe picker, the planner) draws the monogram fallback ([[Design]], Nodes). The owner asked for item and building icons in the recipe browser.

**Done when** item chips and building tiles show the pack's icon where it has one (monogram otherwise), in every place that draws a chip, for built-in and installed packs, without slowing the first paint of a large factory.

- [ ] Serve icons: built-in packs as assets of the app build (hashed URLs per pack version), installed packs from the stored archive (object URLs made in the backend worker)
- [ ] `ItemChip` and the building tile take an icon URL; the scene and the browser pass it
- [ ] Screenshots with icons in both themes; icons stay legible at the compact level of detail
