# Conventions

How we write Carbonara. These rules apply to people and agents alike. When a rule and a task disagree, raise it on the task instead of quietly breaking the rule.

[TOC]

## Decompose by volatility (iDesign)

- Encapsulate **areas of change**, not features or nouns. Before adding a component, name the thing it hides that could change on its own. If you can't, it isn't a component. The list of areas lives in [[Architecture]]; extend it when you add one.
- Respect the layers and call rules in [[Architecture]]: clients → managers → engines/access → platforms, plus contracts and utilities everywhere. No sideways calls. Managers talk to each other only through events.
- **Engines are pure.** No I/O, no `Date.now()`, no `Math.random()`, no globals. Anything like that is passed in. That makes them trivially testable and lets them run in any worker.
- **Managers are thin.** They sequence calls and validate input; rules belong in engines. If a manager grows an `if` about game rules, move it to an engine.
- Start each component's main file with a comment saying what it hides.

## Test-driven development

- **Red → green → refactor.** Write a failing test that states the behaviour, make it pass with the simplest code, then clean up. Commit the tests with the code.
- **Bugs start with a failing test** that reproduces them.
- What to test, by layer:

| Layer | Tests |
| --- | --- |
| Engines, utilities, Rust solver | Unit tests, plus property tests (fast-check / proptest) for invariants: flow conservation, `undo(do(x)) = x`, paste round-trips, deterministic IR, scale invariance of macro recipes |
| Access | Contract test suites that every implementation must pass (memory, IndexedDB, Tauri, Node) |
| Managers | Use-case tests with in-memory access and fake platforms |
| Client | Component tests for behaviour; Playwright screenshot tests for the canonical scenes ([[Design]]); e2e tests for key flows |
| Perf | Benchmarks in `bench/` with budgets from [[Architecture/Solver]]; CI fails when a budget is exceeded |

- Test names describe behaviour ("pasting keeps edges inside the selection"), not methods.
- Coverage isn't the goal; confidence is. Don't test the framework.

## KISS

- Choose the simplest design that meets the task's definition of done. A plain function beats a class; a class beats a framework.
- No cleverness without measurements. Optimise only where a benchmark or profile shows the need, and keep the benchmark.
- One package until something has to be published on its own.

## DRY and WET

- **DRY is about knowledge, not text.** Every fact has one source of truth: zod schemas define the TS types and the JSON Schema; the Rust IR defines its TS twin; manager contracts define the RPC dispatch and the MCP tools. Generate rather than copy.
- **Code may stay WET until the third occurrence** (rule of three). Two similar functions are cheaper than the wrong abstraction. When you do extract something, make sure the copies change for the same reason. If not, they only *look* alike.
- Tests may be WET when that makes them read like a specification.

## SOLID

- **Single responsibility:** one area of change per component (see above).
- **Open/closed:** new games and mechanics arrive as packs and plugins, never as `if (game === …)` in the core.
- **Liskov substitution:** every implementation of an access or platform port passes the same contract test suite.
- **Interface segregation:** small manager contracts per area; plugins implement only the hooks they need; components get only the props they use.
- **Dependency inversion:** managers depend on access *contracts*. Platforms are wired in at the composition root (`src/managers/backend.ts`) and in tests.

## YAGNI

- Build what the current task needs. [[Roadmap]] names future directions (WebGL renderer, multiplayer, signed packs, mod packs). Leave a seam only where a page says so explicitly (for example `CanvasAdapter`, the solver backend trait). Don't implement ahead.
- No configuration options, plugin hooks or parameters without a caller that uses them.

## Code style

- **TypeScript:** `strict`, no `any` (use `unknown` and narrow), no non-null `!` without a comment. Prettier formats; ESLint enforces layers and hooks rules.
- **Rust:** `cargo fmt`, `cargo clippy -- -D warnings`, no `unwrap()` outside tests.
- **Errors:** expected failures (invalid pack, infeasible model, file not found) are values: `Result`, or `{ ok: false, error }` across RPC. Exceptions mean bugs.
- **Naming:** spell names out (`machineCount`, not `mc`). Units go in names where they aren't typed (`ratePerMinute`).
- **Comments:** say *why*, not what. Public contracts get doc comments.
- **UI:** design tokens only, no raw colours or pixel values in components; every interactive element is keyboard-reachable.

## Workflow

- Every change belongs to a task on the board (see the `genbeya` skill). Move it to `in-progress` when you start, tick its checklist as you go, and move it to `review` when the work waits for review. Move it to `done` only once it's verified.
- Commit messages start with the task ID: `CARB-12: Solve tiered objectives`.
- Update the wiki in the same commit as the behaviour it describes.
- Before pushing, run `pnpm check` and `cargo test` (see [[Development]]). Never push red.
