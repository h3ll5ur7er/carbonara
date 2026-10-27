---
id: CARB-55
title: Organise with frames, notes, tags and bookmarks
type: feature
status: done
priority: low
labels: [qol]
wave: "2"
milestone: "M3 Megafactory"
---

Group frames, sticky notes, colour tags, lock, viewport bookmarks, back/forward.

**Done when** each has tests.

- [x] Frames: frame the selection (`Shift+G`), rename in place, resize (`setText`, `moveNodes` with size)
- [x] Notes: add (`N`), edit in place, resize
- [x] Tags + lock: `setTag` (selection toolbar, palette), lock from [[CARB-49]]
- [x] Bookmarks + history navigation: [[src/client/canvas/model/navigation.ts]] (unit tests), `Shift+B`, `1`–`9`, `Ctrl+[`/`Ctrl+]`
- [x] Tests: engine and property tests for `setText` and `setTag`, e2e in [[e2e/qol-organise.spec.ts]]

Open: collapsible frames; bookmarks live for the session only (per document); bookmarks use plain digits because browsers keep `Ctrl+1…9`. See [[Design/Editor quality of life]] (Organising, Navigating).
