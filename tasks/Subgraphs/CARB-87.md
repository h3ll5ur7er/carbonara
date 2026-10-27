---
id: CARB-87
title: Manage blueprints in the library
type: feature
status: review
priority: low
labels: [subgraphs, ux]
---

The library ([[CARB-40]]) lists and places blueprints. A blueprint whose instances were all deleted stays in it, and there's no way to remove one, to rename it without opening an instance, or to start a variant.

**Done when** a library card's context menu renames, duplicates and deletes a blueprint (deleting one that's placed asks first and removes its instances), each one undoable edit.

- [x] Editing engine: `removeBlueprint`, and `addBlueprint` in place of `duplicateBlueprint` (ids chosen by the caller, or by the manager when left out)
- [x] Library card menu (right-click and a ⋯ button: rename, duplicate, delete), and *Delete N unplaced blueprints*
- [x] Tests: engine unit tests, the property tests with both commands (and no instance of a missing blueprint, no layout of one), the analysis manager following their patches, the panel, e2e in [[e2e/subgraphs.spec.ts]]

## Decisions

- **`addBlueprint` instead of `duplicateBlueprint`:** a duplicate is an `addBlueprint` with a copy of the blueprint (the client has the document), and pasting a blueprint along with its instances needs the same command ([[CARB-90]]). One command, checked once: its flows join its own nodes through ports instances have, its instances place blueprints the document has, its layout positions only its nodes.
- **Deleting keeps what the blueprint places:** blueprints used only inside the deleted one stay, placed nowhere; the library lists them and *Delete N unplaced blueprints* clears them away.
- **Asking first only when it matters:** a placed blueprint's delete opens a dialog naming how many instances go; one placed nowhere is deleted at once (undo brings it back).
- **The ⋯ button** besides the context menu: a card that can't be placed here (it would contain itself) is a disabled button, which gets no context menu, and the button is reachable from the keyboard.
