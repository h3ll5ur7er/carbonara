---
id: CARB-42
title: Isolate third-party pack code
type: feature
status: backlog
priority: high
labels: [plugins, security]
wave: "2"
milestone: "M3 Megafactory"
---

Opaque-origin plugin worker for third-party packs; the compile step runs there in one round trip.

**Done when** a malicious fixture plugin can't read our storage or DOM, and compile results equal the in-worker path.

- [ ] Opaque-origin worker
- [ ] Message API
- [ ] Security tests
