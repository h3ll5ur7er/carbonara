---
id: CARB-2
title: Scaffold the project and the layer rules
type: chore
status: todo
priority: urgent
labels: [tooling]
wave: "0"
---

Create the project skeleton from [[Architecture]] so that every later task has a place to go and the layer rules are enforced from the first commit.

**Done when** `pnpm dev` shows an empty page, `pnpm check` and `cargo test` pass, and importing across a forbidden layer boundary fails the lint.

- [ ] Single pnpm package: Vite + React 19 + TypeScript strict, Tailwind v4
- [ ] Folders `src/{contracts,utilities,engines,access,managers,platforms,client,shells}` with a one-line README comment of what each hides
- [ ] ESLint flat config with the layer rules from [[Architecture]] (a failing fixture test proves they bite) + Prettier
- [ ] Vitest + fast-check, Playwright configured with the preinstalled Chromium
- [ ] Cargo workspace: `crates/solver`, `crates/solver-wasm`; rustfmt + clippy settings
- [ ] `pnpm build:wasm` builds the solver with wasm-pack into a place Vite can import
- [ ] `pnpm check` = lint + typecheck + unit tests
- [ ] Write [[Development]]: setup, scripts, checks before pushing
