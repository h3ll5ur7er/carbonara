---
id: CARB-7
title: Define the manager contracts, RPC envelope and plugin API
type: feature
status: todo
priority: urgent
labels: [contracts]
wave: "0"
---

The method signatures of the five managers from [[Architecture]], the RPC envelope, the event stream to the client, and the plugin API types from [[Architecture/Plugins]].

**Done when** the backend worker answers `workspace.ping` through the RPC envelope in a test, and each manager method has a zod argument schema plus the MCP metadata slot (description, permission group).

- [ ] `src/contracts/managers.ts`: workspace, editing, analysis, planning, packs (methods for Wave 1 only, YAGNI)
- [ ] RPC envelope `{ manager, method, args }` → `{ ok, value } | { ok: false, error }`, plus events
- [ ] Dispatcher that validates arguments and rejects unknown methods (tests first)
- [ ] Plugin API types + `definePlugin()` with only the hooks the first packs need
- [ ] Backend worker entry + client connector with a typed proxy
