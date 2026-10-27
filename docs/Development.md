# Development

Requires Node.js 22+, pnpm 10, a Rust toolchain with the `wasm32-unknown-unknown` target, and `wasm-pack`.

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
pnpm install
pnpm build:wasm   # the solver's WebAssembly module, needed before the first `pnpm dev`
pnpm dev          # http://127.0.0.1:5173
```

The dev server builds every pack in `packs/` into the app, the template pack included (production builds leave the template out). Editing a pack reloads the app.

Rebuild the WebAssembly module with `pnpm build:wasm` after changing anything in `crates/`.

[TOC]

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | The web app with hot reload |
| `pnpm build:wasm` | Builds `crates/solver-wasm` into `src/engines/solver/wasm/` (git-ignored) |
| `pnpm build` | WebAssembly, typecheck, then the production web build in `dist/` |
| `pnpm check` | Lint (including the layer rules), typecheck and unit tests. Run before every push |
| `pnpm lint` | ESLint only |
| `pnpm typecheck` | TypeScript only |
| `pnpm test` / `pnpm test:watch` | Vitest unit and property tests |
| `pnpm e2e` | Playwright end-to-end and screenshot tests (starts the dev server itself) |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm schema` | Regenerates the JSON Schemas in `schemas/` from the zod contracts |
| `pnpm carbonara-pack <command>` | The pack CLI: `new`, `validate`, `build`, `dev`, `import` ([[Architecture/Game-packs#Authoring]]) |
| `pnpm pack:build <folder> [--out dist/packs]` | Bundles a pack folder's plugin and zips it into `<out>/<id>-<version>.cpack` |
| `pnpm pack:import <pack> <file>… [--icons <folder>]…` | Regenerates a pack's data and icons with its plugin's importer |
| `cargo test` | Rust tests (solver) |
| `cargo clippy --all-targets -- -D warnings` / `cargo fmt --check` | Rust lint and format |

## Before you push

```bash
pnpm check && pnpm format:check && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

Run `pnpm e2e` too when you changed anything the user can see.

## Layer rules

`eslint-rules/layers.js` enforces the layer table from [[Architecture]]: which layers may import which, no sideways imports between components of the same layer, and UI packages (`react`, `@xyflow/react`, `zustand` …) only in the client and the shells. A file's layer is the folder below `src/`, and its component is the next folder or file name (`src/engines/solver/…` → engine `solver`). Its tests in `eslint-rules/layers.test.js` list examples of what's allowed and what isn't.

## Tests

- Unit and property tests sit next to the code as `*.test.ts` (Vitest, fast-check). Rust tests live in the crates (`cargo test`, proptest).
- End-to-end and screenshot tests live in `e2e/`. Screenshot baselines are in `e2e/__screenshots__/`. After an intentional visual change, update them with `pnpm e2e --update-snapshots` and commit the new images with the change.
- Playwright uses the Chromium that is preinstalled in the cloud environment. `@playwright/test` is pinned to the matching version, so don't upgrade it on its own.

## Deployment

Every push to the default branch that passes CI is deployed to GitHub Pages by the `deploy` job in `.github/workflows/ci.yml`: https://h3ll5ur7er.github.io/carbonara/. The build uses `vite build --base=/<repo>/` because Pages serves the app below the repository name. To try that build locally:

```bash
pnpm build:wasm && pnpm exec vite build --base=/carbonara/ && pnpm exec vite preview --base=/carbonara/
```

Share links use the URL fragment, so they work on Pages without server-side routing.

## Known gaps

- `wasm-opt` is off (`crates/solver-wasm/Cargo.toml`) because wasm-pack downloads it from GitHub releases, which isn't reachable everywhere. Turn it back on when the benchmarks say binary size or speed matter.
