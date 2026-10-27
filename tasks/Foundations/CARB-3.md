---
id: CARB-3
title: Run CI on every push
type: chore
status: done
priority: high
labels: [tooling]
wave: "0"
---

GitHub Actions runs everything a contributor runs locally, so red never reaches a reviewer.

**Done when** a push runs the jobs below and they pass on the scaffold.

- [x] Node job: install (cached), lint, typecheck, unit tests
- [x] Rust job: fmt check, clippy `-D warnings`, `cargo test`
- [x] WASM build job
- [x] Playwright job (e2e + screenshots), with the report as an artifact on failure

The jobs share setup through [[.github/actions/setup/action.yml]]; the workflow is [[.github/workflows/ci.yml]]. Green on GitHub since the CARB-9 merge, including the screenshot tests.
