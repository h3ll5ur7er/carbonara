---
id: CARB-87
title: Manage blueprints in the library
type: feature
status: todo
priority: low
labels: [subgraphs, ux]
---

The library ([[CARB-40]]) lists and places blueprints. A blueprint whose instances were all deleted stays in it, and there's no way to remove one, to rename it without opening an instance, or to start a variant.

**Done when** a library card's context menu renames, duplicates and deletes a blueprint (deleting one that's placed asks first and removes its instances), each one undoable edit.

- [ ] Editing engine: `removeBlueprint`, `duplicateBlueprint` (ids chosen by the caller)
- [ ] Library card menu
- [ ] Tests
