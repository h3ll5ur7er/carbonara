---
id: CARB-2
title: Scaffold the project and the layer rules
type: chore
status: done
priority: urgent
labels: [tooling]
wave: "0"
---

Create the project skeleton from [[Architecture]] so that every later task has a place to go and the layer rules are enforced from the first commit.

**Done when** `pnpm dev` shows an empty page, `pnpm check` and `cargo test` pass, and importing across a forbidden layer boundary fails the lint.

- [x] Single pnpm package: Vite + React 19 + TypeScript strict, Tailwind v4
- [x] Layer folders appear as their first code lands; what each hides is written once, in [[Architecture]] (no per-folder READMEs, DRY)
- [x] ESLint flat config with the layer rules from [[Architecture]] (a failing fixture test proves they bite) + Prettier
- [x] Vitest + fast-check, Playwright configured with the preinstalled Chromium
- [x] Cargo workspace: `crates/solver`, `crates/solver-wasm`; rustfmt + clippy settings
- [x] `pnpm build:wasm` builds the solver with wasm-pack into a place Vite can import
- [x] `pnpm check` = lint + typecheck + unit tests
- [x] Write [[Development]]: setup, scripts, checks before pushing

**Decisions**

- The layer rules are a small local ESLint rule ([[eslint-rules/layers.js]], tested in [[eslint-rules/layers.test.js]]) rather than `eslint-plugin-boundaries`: about 60 lines we fully understand, versus a large configuration API.
- TypeScript stays on 6.0 because typescript-eslint doesn't support 7 yet.
- One `tsconfig.json`, typechecked with `tsc` (no project references) — KISS.
- `wasm-opt` is off for now; see [[Development]].
