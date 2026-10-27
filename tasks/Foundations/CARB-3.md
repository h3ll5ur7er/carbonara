---
id: CARB-3
title: Run CI on every push
type: chore
status: todo
priority: high
labels: [tooling]
wave: "0"
---

GitHub Actions runs everything a contributor runs locally, so red never reaches a reviewer.

**Done when** a push runs the jobs below and they pass on the scaffold.

- [ ] Node job: install (cached), lint, typecheck, unit tests
- [ ] Rust job: fmt check, clippy `-D warnings`, `cargo test`
- [ ] WASM build job
- [ ] Playwright job (e2e + screenshots), with the report as an artifact on failure
