---
id: CARB-23
title: Reach every action from a command palette
type: feature
status: review
priority: medium
labels: [ui, ux]
wave: "1"
milestone: "M1 It flows"
---

A command registry and `cmdk` palette (`Ctrl+K`), including quick-add by item or recipe name.

**Done when** every action in the app is registered once and reachable from the palette, and quick-add has an e2e test.

- [x] Command registry (single source for palette, menus and shortcuts): [[src/client/core/commands.ts]], shortcuts in [[src/client/core/commands-shortcuts.ts]], the app's commands in [[src/client/shell/app-commands.ts]]
- [x] Palette UI ([[src/client/features/command-palette/command-palette.tsx]])
- [x] Quick-add: recipes of the open document's pack from `packs.getPackData`, added with one `addNode` through `editing.apply`
- [x] e2e test ([[e2e/shell-palette.spec.ts]]: quick-add records the validated command in the `palette` scene's fake backend)
- [x] App menu behind the wordmark, read from the registry; tooltips show the registry's shortcuts
- [ ] Place quick-added nodes where the user is looking: they land at the origin until the canvas exposes its viewport centre ([[CARB-16]])
- [ ] Register the editing commands (undo, redo, copy, paste, delete …) as they arrive, with their shortcuts; nothing else is needed to reach them from the palette and menus

**Decisions:**

- A registry is a plain list built once (`createCommandRegistry`). Duplicate ids or shortcuts throw at start-up, since one key press can't run two commands. Customisable shortcuts ([[CARB-56]]) can rebuild it from the same definitions keyed by id.
- Shortcuts match on `KeyboardEvent.key`; Shift is ignored for symbols (`?` needs Shift on most layouts); plain-key shortcuts don't fire in text fields, shortcuts with `Mod` do.
- The palette lists quick-add entries only once something is typed, so the empty palette shows the commands. The palette's own command isn't listed inside it.
- Quick-add entries are a pure function of the pack data ([[src/client/features/command-palette/quick-add.ts]]); `useQuickAdd` does the connector calls and the toasts. The `palette` scene reads the template pack's own YAML files, so its data never drifts from the pack.
- `Ctrl+B` and `Ctrl+I` follow editors that toggle side panels with them; the browser defaults they replace (bookmarks sidebar in Firefox) are prevented only while Carbonara has focus.
