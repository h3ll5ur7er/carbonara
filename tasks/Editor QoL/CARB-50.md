---
id: CARB-50
title: Align, distribute and straighten
type: feature
status: review
priority: medium
labels: [qol]
wave: "2"
milestone: "M2 It's a game"
---

Align six ways, distribute both ways, straighten chain.

**Done when** each command has tests in the editing engine.

- [x] Commands: registered in the command registry, one `moveNodes` edit each; a selection toolbar shows them for two or more nodes
- [x] Tests: unit and property tests for [[src/client/canvas/model/align.ts]], e2e in [[e2e/qol-align.spec.ts]]

The rules live in the canvas model rather than the editing engine: they need node sizes and port positions, which only the canvas knows (like snapping), and they emit plain `moveNodes` commands, which the engine's property tests already cover. See [[Design/Editor quality of life]] (Align, distribute, straighten).
