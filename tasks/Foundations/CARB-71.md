---
id: CARB-71
title: Deploy the web app to GitHub Pages
type: chore
status: in-progress
priority: high
labels: [tooling, release]
wave: "1"
milestone: "M1 It flows"
---

Every push to the default branch that passes CI deploys the web app to GitHub Pages ([[.github/workflows/ci.yml]], job `deploy`), so the latest state can always be tried at https://h3ll5ur7er.github.io/carbonara/.

**Done when** the first deploy is live and the app loads there without console errors.

- [x] `deploy` job after `web`, `rust` and `e2e`, default branch only
- [x] Build with `--base=/<repo>/`; checked locally with `vite preview` under `/carbonara/` (app renders, backend worker loads, no console errors)
- [ ] First deploy live
- [x] [[Development]] documents it
