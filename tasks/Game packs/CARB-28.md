---
id: CARB-28
title: Build the pack CLI
type: feature
status: review
priority: medium
labels: [packs, tooling]
wave: "1"
milestone: "M1 It flows"
---

`carbonara-pack new | validate | build | dev | import`, a client of the `packs` manager on the node platform ([[Architecture/Game packs]]).

**Done when** `new` → `build` produces an installable pack and `dev` hot-reloads a running app.

- [x] Node platform (`src/platforms/node/`: reading a folder, loading a module from source)
- [x] Commands with tests (`tools/pack-cli/*.test.ts`; `new` → `build` installs through the real packs manager)
- [x] `dev` watches and rebuilds; packs in `packs/` hot-reload a running `pnpm dev`
- [ ] Dev mode for pack folders outside the repository (File System Access API on web): [[CARB-72]]

Decisions:

- The CLI calls the packs engine directly instead of being a client of the packs manager: going through the manager would mean zipping a folder only to unzip it, and wiring a backend with stand-in storage, to call one pure function. No command needs installed packs yet. Recorded in [[Architecture/Game-packs]], Authoring.
- `import` is the importer runner the Satisfactory pack brought ([[CARB-29]], `tools/pack-cli/import.ts`: sharp icons, Prettier-clean YAML), now behind `carbonara-pack import`, which also validates what it wrote. `pnpm pack:build` and `pnpm pack:import` stay as shorthands for `carbonara-pack build` and `import`.
- Builds are reproducible, so a pack's hash is the same in the app's built-ins and in the `.cpack` an author builds.
- The Vite plugin builds packs in a `tsx` child process to keep app code out of the Vite config (no config-loader warning); `tsconfig.json` allows importing `.ts` extensions for that one import.
