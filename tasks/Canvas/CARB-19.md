---
id: CARB-19
title: Pick recipes by dragging from a port
type: feature
status: todo
priority: high
labels: [canvas, ux]
wave: "1"
milestone: "M1 It flows"
---

Dragging from a port into empty space opens a recipe picker filtered by that item: producers for inputs, consumers for outputs, ranked by use, with alternates previewed side by side.

**Done when** the e2e test drags from an output port, picks a recipe, and finds the new node connected and solved.

- [ ] Picker UI with keyboard navigation
- [ ] Ranking by use (preferences access)
- [ ] Creates node + edge through `editing`
- [ ] e2e test
