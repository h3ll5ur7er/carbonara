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
| `pnpm e2e` | Playwright end-to-end and screenshot tests, inside the pinned Playwright Docker image (starts the dev server itself) |
| `E2E_PERF=1 pnpm e2e` | Only the canvas frame-budget tests (`e2e/*perf.spec.ts`), which the normal run leaves out because they depend on machine load. CI runs them, with `pnpm bench`, in the blocking job *Performance budgets* |
| `pnpm e2e:host` | The same tests on this machine's browser — quicker to start, but screenshots may differ from the baselines |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm schema` | Regenerates the JSON Schemas in `schemas/` from the zod contracts |
| `pnpm mcp:tools` | Regenerates the MCP server's manifest (`crates/mcp/manifest.json`: tools, resources, prompts) from the manager contracts ([[Architecture/MCP server]]) |
| `pnpm carbonara-pack <command>` | The pack CLI: `new`, `validate` (which also type-checks the plugin), `build`, `dev`, `import` ([[Guides/Pack authoring]], [[Architecture/Game-packs#Authoring]]) |
| `pnpm pack:build <folder> [--out dist/packs]` | Bundles a pack folder's plugin and zips it into `<out>/<id>-<version>.cpack` |
| `pnpm pack:import <pack> <file>… [--icons <folder>]…` | Regenerates a pack's data and icons with its plugin's importer |
| `pnpm bench` | Edit → results timings on generated 500 / 1k / 10k / 50k-node factories, with the WebAssembly module as built (`pnpm build:wasm` builds release). Exits with 1 when a budget from [[Architecture/Solver]] is exceeded; `pnpm bench 10k` runs only the scenarios whose name contains "10k" |
| `pnpm desktop:dev` / `pnpm desktop:build` | The desktop app with hot reload, or its installers ([[#Desktop]]) |
| `pnpm tauri <command>` | The Tauri CLI, run in `src/shells/tauri` |
| `cargo test` | Rust tests (solver; the MCP server, with scripted MCP clients over HTTP and stdio); the desktop shell is left out, see [[#Desktop]] |
| `cargo clippy --all-targets -- -D warnings` / `cargo fmt --check` | Rust lint and format |

## Before you push

```bash
pnpm check && pnpm format:check && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

Run `pnpm e2e` too when you changed anything the user can see, and `cargo clippy -p carbonara-desktop --all-targets -- -D warnings && cargo test -p carbonara-desktop` when you changed the desktop shell ([[#Desktop]]).

## Layer rules

`eslint-rules/layers.js` enforces the layer table from [[Architecture]]: which layers may import which, no sideways imports between components of the same layer, and UI packages (`react`, `@xyflow/react`, `zustand` …) only in the client and the shells. A file's layer is the folder below `src/`, and its component is the next folder or file name (`src/engines/solver/…` → engine `solver`). Its tests in `eslint-rules/layers.test.js` list examples of what's allowed and what isn't.

## Tests

- Unit and property tests sit next to the code as `*.test.ts` (Vitest, fast-check). Rust tests live in the crates (`cargo test`, proptest).
- Component tests (`*.test.tsx`) use Testing Library on jsdom. A file opts in with `// @vitest-environment jsdom` on its first line; everything else runs on Node.
- End-to-end and screenshot tests live in `e2e/`. Screenshot baselines are in `e2e/__screenshots__/<spec file>/`.
- Accessibility tests are `e2e/a11y-*.spec.ts`: axe-core over the scenes and the app's main states (`@axe-core/playwright`, pinned), the core flows with the keyboard alone, and reduced motion ([[Design]], Accessibility). A new state of the UI worth auditing gets a line in `e2e/a11y-axe.spec.ts`.
- **Screenshots render in one place.** `pnpm e2e` runs Playwright inside `mcr.microsoft.com/playwright:v1.63.0-noble` ([[scripts/e2e.mjs]]), and CI's e2e job runs in the same image. Fonts, anti-aliasing and the browser build all come from the image, so a baseline made on any machine matches CI. Baselines made outside the image (`pnpm e2e:host`) don't: text renders a pixel differently and the strict comparison fails. Docker must be running; in the cloud environment start it with `dockerd &`.
- `@playwright/test` is pinned to the image's version (1.63.0); upgrade both together.
- Parallel worktrees each pick their own port: `E2E_PORT=5174 pnpm e2e`.
- The first run's game picker and tour ([[Design]], Welcome and tour) don't appear in automated browsers, so every spec starts at the usual welcome. Open `/?first-run` to test them ([[e2e/onboarding.spec.ts]]).

### Scenes

A scene is a fixed state of the UI for screenshots and visual QA. In development, `?scene=<name>` renders one instead of the app (`?scene=` alone lists them all); production builds leave them out. They're registered in [[src/client/scenes/registry.ts]]:

| Scene | What it shows | Screenshots |
| --- | --- | --- |
| `empty`, `chain`, `congested`, `subgraph`, `ghost-paste` | The canonical scenes of [[Design]] (Visual QA); placeholders mark the ones whose feature doesn't exist yet. `ghost-paste` is the chain with a copy of its wire line following the pointer | `e2e/scenes.spec.ts` |
| `gallery` | Every design-system primitive, with a theme and accent switch | `e2e/ui.spec.ts` |
| `inspector` | Both side panels, the inspector with each kind of field, error toasts | `e2e/shell-panels.spec.ts` |
| `palette` | A template-pack document, for the command palette and quick-add | `e2e/shell-palette.spec.ts` |
| `planner` | The planner card's goals and a proposal drawn as a ghost | `e2e/planner-scene.spec.ts` |
| `totals` | The totals card, from a real-engine fixture with resources near and over their map limits | `e2e/planner-totals.spec.ts` |
| `sankey`, `heatmap` | The congested factory as a Sankey overview and with the bottleneck heatmap | `e2e/planner-overviews.spec.ts` |

To add a scene, export a component as the default of a module and register it. Canvas scenes live in `src/client/canvas/scenes/` and take over a placeholder's name (`chain`, `congested` …). Scenes that need the managers use `fakeConnector` ([[src/client/scenes/fake-backend.ts]]): the real RPC envelope and argument validation in front of fake manager methods.

### Screenshot tests

Each test emulates the colour scheme and reduced motion, waits for the scene (`[data-scene=<name>]`) and the fonts, and compares the page with its baseline. Comparisons are strict (a per-pixel threshold of 0.05 and at most 0.2% different pixels, in `playwright.config.ts`), because the dark theme is low-contrast and looser settings miss whole panels.

When a change is meant to look different:

1. Run `pnpm e2e --update-snapshots=all` (plain `--update-snapshots` only rewrites images that fail, so baselines can drift below the threshold).
2. Open every changed image under `e2e/__screenshots__/` (`git status`) and look at it, dark and light. Check the scene, not only the part you changed.
3. Commit the new images in the same commit as the change, so the history shows why they changed.

When a screenshot fails unexpectedly, the HTML report (`playwright-report/`, or `test-results/` for the expected, actual and diff images) shows what moved.

## Desktop

The desktop app is a Tauri 2 shell around the web app ([[Architecture/Desktop]]). Besides the setup above it needs Tauri's system libraries ([Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/)); on Debian and Ubuntu:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev \
  patchelf build-essential libssl-dev file
```

macOS needs the Xcode command line tools, Windows the WebView2 runtime (preinstalled on Windows 10 and 11) and the MSVC build tools.

| Command | What it does |
| --- | --- |
| `pnpm desktop:dev` | The desktop app with hot reload: Vite on port 5190 (`src/shells/tauri/vite.config.ts`) and the Rust shell in debug mode |
| `pnpm desktop:build` | The web build into `dist/desktop`, then the release app and installers in `target/release/bundle/` (on Linux: `.deb`, `.rpm`, AppImage). `--bundles deb` builds one kind, `--debug` a faster debug build |
| `pnpm desktop:frontend` | Only the desktop app's web build, as `desktop:build` runs it |
| `cargo test -p carbonara-desktop` / `cargo clippy -p carbonara-desktop --all-targets -- -D warnings` | The Rust shell's tests and lint |
| `pnpm tauri icon icon.svg -o src-tauri/icons` | Regenerates the app icons (then delete the `android/`, `ios/` and Store logos it also writes) |

The Rust shell (`src/shells/tauri/src-tauri`) is a workspace member but not a default member, so plain `cargo test`, `cargo clippy` and `cargo build` don't need the system libraries. A new crate goes into both `members` and `default-members` of the root `Cargo.toml`, or plain `cargo test` skips it. Run its checks with `-p carbonara-desktop` when you change the shell. CI does on every push (job *Desktop app (Linux)*), and builds a `.deb`.

`pnpm tauri` runs the CLI in `src/shells/tauri`, where it finds `src-tauri/`, so paths you pass it are relative to that folder unless absolute.

Without a display (a container, CI), the app can't open a window; `xvfb-run pnpm tauri dev` runs it on a virtual one. The shell's commands are covered by `cargo test`, its TypeScript by `pnpm test`.

## Deployment

Every push to the default branch that passes CI is deployed to GitHub Pages by the `deploy` job in `.github/workflows/ci.yml`: https://h3ll5ur7er.github.io/carbonara/. The build uses `vite build --base=/<repo>/` because Pages serves the app below the repository name. To try that build locally:

```bash
pnpm build:wasm && pnpm exec vite build --base=/carbonara/ && pnpm exec vite preview --base=/carbonara/
```

Share links use the URL fragment, so they work on Pages without server-side routing.

## Known gaps

- `wasm-opt` is off (`crates/solver-wasm/Cargo.toml`) because wasm-pack downloads it from GitHub releases, which isn't reachable everywhere. Turn it back on when the benchmarks say binary size or speed matter.
