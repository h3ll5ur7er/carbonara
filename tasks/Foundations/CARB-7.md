---
id: CARB-7
title: Define the manager contracts, RPC envelope and plugin API
type: feature
status: done
priority: urgent
labels: [contracts]
wave: "0"
---

The method signatures of the five managers from [[Architecture]], the RPC envelope, the event stream to the client, and the plugin API types from [[Architecture/Plugins]].

**Done when** the backend worker answers `workspace.ping` through the RPC envelope in a test ([[src/shells/web/backend.test.ts]], [[e2e/backend.spec.ts]]), and each manager method has a zod argument schema plus the MCP metadata slot (description, permission group).

- [x] `src/contracts/managers.ts`: workspace, editing, analysis, planning, packs (methods for Wave 1 only, YAGNI)
- [x] RPC envelope `{ manager, method, args }` → `{ ok, value } | { ok: false, error }`, plus events
- [x] Dispatcher that validates arguments and rejects unknown methods (tests first)
- [x] Plugin API types + `definePlugin()` with only the hooks the first packs need
- [x] Backend worker entry + client connector with a typed proxy

**Decisions** (recorded in [[Architecture]] and [[Architecture/Plugins]])

- One table of contracts ([[src/contracts/managers.ts]]) drives the dispatcher, the client proxy and later the MCP tools.
- The RPC plumbing is generic and lives in utilities ([[src/utilities/rpc.ts]]); the composition root is in the web shell, since it's the only layer allowed to know managers and platforms together.
- No `planning` manager yet: nothing in Wave 1 calls it (YAGNI). It arrives with [[CARB-45]].
- Analysis results are plain records for now. Typed arrays come only if [[CARB-18]] or [[CARB-59]] measure a need.
- `settings.plugin` was added to the document contract now, so the Satisfactory save profile needs no migration later.
