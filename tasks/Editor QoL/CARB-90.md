---
id: CARB-90
title: Blueprints travel with a copy
type: improvement
status: done
priority: low
labels: [qol, subgraphs]
wave: "3"
milestone: "M4 Ship"
---

Left over from [[CARB-51]]. A copy of subgraph instances holds only the instances, not their blueprints, so pasting them into a factory that lacks the blueprint leaves them out ("1 subgraph this factory doesn't have"). Carry the blueprints the copied instances use (transitively) in the `Clipboard` payload ([[src/contracts/clipboard.ts]]) and add them on paste, which needs an editing command that adds a blueprint (coordinate with [[CARB-39]]). Decide what happens when the target has a different blueprint under the same id (rename, or reuse when identical).

**Done when** copying an instance from one factory and pasting it into another adds the instance with its blueprint, as one undo step, and the paste property tests cover it.

- [x] Payload carries the blueprints (`Clipboard.blueprints`, with their layouts)
- [x] Paste adds missing blueprints (same id taken: fresh id), with `addBlueprint` from [[CARB-87]]
- [x] Property and e2e tests ([[src/engines/editing/clipboard.properties.test.ts]], [[e2e/qol-clipboard.spec.ts]])

## Decisions

- **Alike means same name and graph**, with the blueprints it places resolved first; layouts don't count (where nodes sit inside doesn't make another blueprint). An alike blueprint is reused under whatever id the target has it, so pasting the same copy again adds nothing.
- **Another blueprint under the same id:** the copy's is added under a fresh id keeping the stem (`rods-3fa9c1`) and named apart ("Iron rods 2"); the target's own stays as it is.
- **The factory it came from:** an instance pasted back places its blueprint as it is now, even when that was edited after the copy. Forking it into "Iron rods 2" because of an edit made since would surprise more than it helps.
- **Older clipboards** (without `blueprints`) still parse (the field defaults to none) and find blueprints in the target by id, as before; the clipboard's `version` stays 1.
- The paste ghost draws instances with the blueprints the copy brings (`Ghost.subgraphs`), so their ports show before they're placed.
