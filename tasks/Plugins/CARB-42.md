---
id: CARB-42
title: Isolate third-party pack code
type: feature
status: review
priority: high
labels: [plugins, security]
wave: "2"
milestone: "M3 Megafactory"
---

Opaque-origin plugin worker for third-party packs; the compile step runs there in one round trip.

**Done when** a malicious fixture plugin can't read our storage or DOM, and compile results equal the in-worker path.

- [x] Opaque-origin worker: one per installed pack, started by the backend worker from a `data:` URL ([[src/platforms/web/opaque-worker.ts]]); its code is bundled by `virtual:plugin-sandbox` ([[src/shells/web/plugin-sandbox.vite.ts]])
- [x] Message API: `load`, `compile`, `results`, `describe` ([[src/shells/web/plugin-sandbox-protocol.ts]]), with a time limit per call and a restart after a timeout ([[src/shells/web/plugin-sandbox.ts]])
- [x] Security tests: [[e2e/plugins-sandbox.spec.ts]] (a probing plugin sees `origin=null dom=none fetch=undefined idb=denied caches=denied`; in the backend worker it read `idb=open caches=open`), and [[src/shells/web/plugin-sandbox.test.ts]] (compile, results and describe equal the in-worker path; results are pinned to the document asked for)

Decisions:

- A `data:` URL worker instead of a sandboxed iframe: it gets an opaque origin without the UI thread, and stays off the main thread.
- Every installed pack is third-party, including one that stands in for a built-in pack.
- Network and worker globals are deleted in the sandbox before the plugin loads; `import()` can't be, see the warning on [[Architecture/Plugins]].

Open:

- A plugin can still reach the network through `import()` of a URL; an app-wide CSP would close it.
