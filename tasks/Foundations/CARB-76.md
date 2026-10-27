---
id: CARB-76
title: Render screenshots in one pinned environment
type: bug
status: review
priority: urgent
labels: [tooling, tests]
wave: "1"
---

CI was red since the Solver merge: every screenshot test failed on GitHub with 1–2 % of pixels different, because the baselines were rendered in the cloud container and the runner renders text a little differently. The strict comparison (per-pixel threshold 0.05) catches it. That also blocked the GitHub Pages deploy.

**Fix:** `pnpm e2e` runs Playwright inside `mcr.microsoft.com/playwright:v1.63.0-noble` ([[scripts/e2e.mjs]]), and CI's e2e job runs in the same image ([[.github/workflows/ci.yml]]). All baselines were regenerated in the image.

- [x] Docker-based runner; `pnpm e2e:host` keeps the quick host run
- [x] Playwright's web server starts Vite directly (the image has no pnpm, and can't fetch it through the cloud proxy)
- [x] CI e2e job in the image
- [x] Baselines regenerated in the image; full suite green there (92 tests)
- [x] A flaky select keyboard test waits for the list's focus before pressing keys
- [ ] CI green on GitHub
