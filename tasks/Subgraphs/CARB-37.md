---
id: CARB-37
title: Handle multi-mode subgraphs and inline the rest
type: feature
status: done
priority: medium
labels: [solver, subgraphs]
wave: "2"
milestone: "M3 Megafactory"
---

Directional LPs to enumerate modes for up to ~4 DOF; inline fallback otherwise, with a UI hint suggesting pins.

**Done when** compiled-vs-inlined equivalence holds for random multi-mode blueprints.

- [x] Mode enumeration (directional LPs grow the hull of the cone's cut; up to 4 degrees of freedom and 8 modes)
- [x] Inline fallback (balanced body, pins tied to the instance's scale)
- [x] Hint in diagnostics (`kind: "hint"`, on the first instance of the blueprint)

**Decisions:** several modes that share limits (a node maximum, a constraint) are inlined, since a shared limit couples them. Inlined bodies are `balanced` (a new IR node kind) so that inlining means exactly what a summary means; ports are tied to the body by equality constraints, not edges. The equivalence property runs over random blueprints of every shape (one mode, several, inlined) and compares objective scores, since plans that tie may route differently.
