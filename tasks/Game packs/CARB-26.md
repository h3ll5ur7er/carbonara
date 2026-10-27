---
id: CARB-26
title: Validate packs with readable errors
type: feature
status: review
priority: high
labels: [packs, engines]
wave: "1"
milestone: "M1 It flows"
---

The `packs` engine: schema validation, cross references, engine-range check, and errors that name the file plus the YAML line and column.

**Done when** a set of broken fixture packs each produce the expected error message.

- [x] Broken fixtures first ([[src/engines/packs/broken-packs.test.ts]])
- [x] Line/column mapping for YAML (and JSON, through the same parser)
- [x] Engine-range check (`PACK_FORMAT` 1.0.0, npm range semantics)

Decisions:

- `Issue` gained optional `line` and `column` (1-based); `describeIssue` in `src/utilities/issues.ts` formats an issue the same way for the app, the CLI and MCP.
- Map entries are located at their key, which is the line an author searches for; missing fields at the closest existing node.
- Unknown top-level sections in a data file are refused (a misspelt `itmes:` used to be dropped silently). Unknown keys inside entries are still stripped by zod; making the schemas strict is a contract change for later if authors trip over it.
- An unsupported `engine` range stops before the data is read, since newer data would only produce misleading schema errors.
