---
id: CARB-25
title: Read packs from bundles, storage and files
type: feature
status: done
priority: urgent
labels: [packs, access]
wave: "1"
milestone: "M1 It flows"
---

The `packs` access component: read `.cpack` archives (fflate), list built-in packs, store installed packs (IndexedDB on web), load plugin modules.

**Done when** a contract test suite passes for the memory and web implementations.

- [x] Contract tests first (the shared `KeyValueStorage` suite in `src/contracts/platform.contract.ts`, run against memory and IndexedDB)
- [x] Unzip in the worker
- [x] Built-in pack bundling at app build time
- [x] Installed pack store
- [x] Plugin modules load through a Blob URL in the backend worker

Decisions (details in [[Architecture/Game-packs]], "Where packs live"):

- Access may not call engines, so it never validates: the `packs` manager validates with the engine and hands the access a `PackToInstall` (manifest, data, hash, plugin source). Installed packs are stored in that validated form, so loading one needs no unzipping or validating.
- Installed packs use the `KeyValueStorage` port the Documents epic added (IndexedDB), not a second OPFS port: pack data and plugin source are structured-cloneable values of a few MB, and one port with one contract suite is simpler. The memory `KeyValueStorage` lives in `src/utilities/` because it's pure and access and manager tests may not import platforms. New port: `ModuleLoader` in `src/contracts/platform.ts`.
- Built-in packs come from a Vite plugin (`tools/pack-cli/built-in-packs.ts`, virtual module `virtual:built-in-packs`) that reuses the CLI's build. The template pack is built in only by the dev server until the game packs land.
- Pack builds are reproducible, so a built-in pack's hash equals the hash of the `.cpack` built from the same folder.
- An installed pack stands in for the built-in pack with the same id until it's removed.
- Not yet: icons of installed packs aren't kept (nothing shows icons yet); third-party plugins aren't isolated ([[CARB-42]]).
