# Roadmap

The work is planned on the task board (`tasks/`) in waves. Each task has a `wave` and a `milestone` field, and its epic is the folder it sits in.

[TOC]

## Waves

| Wave | Goal | How it runs |
| --- | --- | --- |
| 0 — Foundations | Scaffold, CI, and the contracts every later task builds on: pack and document schemas, solver IR, manager contracts, plugin API, the template pack | Sequential. The contracts are frozen at the end |
| 1 — Core vertical slice | Solver, compiler and analysis; canvas; app shell; game packs; documents and editing | Five agents in parallel, one per epic |
| 2 — Depth | Subgraphs, plugins, planner, editor quality of life, desktop, MCP | Six agents in parallel |
| 3 — Polish | Onboarding, visual QA, accessibility, author docs, release | Two or three agents plus review |

## Milestones

| Milestone | You can … |
| --- | --- |
| **M1 It flows** | Place nodes from a built-in pack, connect them, and see live rates, deficits and belt saturation |
| **M2 It's a game** | Plan with the Satisfactory pack: alternates, overclocking, somersloops. An MCP client can plan a line into the open document as a proposal |
| **M3 Megafactory** | Keep a 50k-node factory built from subgraphs interactive; plan with the Factorio pack: modules, beacons, quality |
| **M4 Ship** | Install the desktop app, use the web app, follow the onboarding tour |

## How agents work the board

- Each agent takes one epic (or one task) and works in its own git worktree, following [[Conventions]]: TDD, the layer rules, and the task workflow from the `genbeya` skill.
- A task is done when its checklist is ticked, `pnpm check` and `cargo test` pass, its screenshots and benchmarks are within budget where it has any, and the wiki is updated.
- The integrator merges finished worktrees, resolves conflicts, and runs review agents (correctness, visual, performance) before each merge.
- Contract changes after Wave 0 need their own task and are announced on every affected task.

## Risks

| Risk | Mitigation |
| --- | --- |
| React Flow slows down with very large *visible* graphs | LOD tiers, culling, results outside React state, and subgraphs keep the visible count low; `CanvasAdapter` leaves room for WebGL |
| Subgraph projection is hard in general | Handle the common cases exactly (1-DOF and a few modes), inline the rest with clear hints |
| `microlp` is too slow for huge flat LPs | Backend trait with `clarabel`; decomposition and hierarchy shrink problems first |
| Third-party pack code is a security risk | Opaque-origin plugin worker, declarative UI contributions, trust prompt with hash |
| A pack update breaks existing documents | Documents pin pack id, version and hash; `engine` range checked on load; pack-provided id migrations |
| Game data and icon licensing | Publisher permission or a covering fan-content policy before publishing; `CREDITS.md`; packs can be pulled individually |
| A local MCP server opens a door into the app | Localhost only, token, read-only by default, separate opt-ins, writes limited to dev pack folders, every call logged and undoable |
| Numerical noise ("59.99999/min") | Tiered solves, epsilon cleanup, rational display |

## Out of scope for v1

Real-time multiplayer (Immer patches leave a path to Yjs), a map-based resource-node picker, mod managers and mod packs, mobile layouts, MCP in the web version, and a built-in chat assistant (external MCP clients cover this for now).
