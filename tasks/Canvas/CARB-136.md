---
id: CARB-136
title: Suggest the recipes the factory needs next
type: feature
status: todo
priority: low
labels: [ux, library]
wave: "4"
milestone: "M5 Daily driver"
---

A "Suggested" section in the recipe browser ([[CARB-134]]) with what is likely useful next, from the factory itself (no learning, plain rules): recipes that make an input a machine is short of, recipes that use an output nothing takes yet, and around the selected node, the recipes that connect to its open ports. Adding one from there connects it to the port it was suggested for.

- [ ] Rules from the solve's diagnostics (deficits, unconnected outputs) and the selection's open ports
- [ ] Ranked, deduplicated, with the reason shown ("makes the 2/s of Iron Plate the Assembler is short of")
- [ ] Adding a suggestion connects it
