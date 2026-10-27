---
id: CARB-15
title: Solve automatically when a document changes
type: feature
status: done
priority: urgent
labels: [managers]
wave: "1"
milestone: "M1 It flows"
---

The `analysis` manager: listens to `documentChanged`, compiles, solves, and publishes results to the client with a generation counter so stale results are dropped. Also totals and diagnostics.

**Done when** a use-case test with in-memory access shows edit → results event, stale results are dropped, and totals are correct for the template scenes.

- [x] Use-case tests first
- [x] Stale results dropped by document version; edits during a solve collapse into one more round
- [x] `resultsChanged` event (plain `AnalysisResults`, see notes)
- [x] Totals and diagnostics

## Notes

- [[src/managers/analysis.ts]], use-case tests in [[src/managers/analysis.test.ts]] with in-memory `DocumentStore` / `PackStore` fakes and the real WASM solver: edit → `resultsChanged`, three quick edits publish only the last version, `getResults` solves on demand, only touched components are re-solved, missing pack, failing plugin, closed documents forgotten. Totals for the template's water loop: 1 ferrite ore/s, 0.125 water/s; 3 furnaces, 1 washer, 1 purifier.
- The document version is the generation counter; there is no separate one. Cancellation is coalescing: a WASM solve can't be interrupted, so edits that arrive during one collapse into one more round with the newest version.
- The results event carries the `AnalysisResults` records the contract defines, not typed arrays: no benchmark shows the transfer matters yet ([[Architecture/Solver]]).
- One incremental solver per document, disposed when `documentsChanged` no longer lists the document.
- The manager needs only `get` from both stores (interface segregation). [[src/shells/web/backend.ts]] wires it with empty placeholders and a TODO: the real `DocumentStore` and `PackStore` come from the Documents and Packs epics on merge.
- The test's import of `./analysis` carries an `eslint-disable-next-line local/layers`: the layer rule in this branch treats `analysis.test.ts` as its own component. The integration branch fixes the rule; drop the comment there.
