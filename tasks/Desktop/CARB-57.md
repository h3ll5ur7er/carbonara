---
id: CARB-57
title: Wrap the app in a Tauri shell
type: feature
status: review
priority: high
labels: [desktop]
wave: "2"
milestone: "M2 It's a game"
---

Tauri 2 shell with the tauri platform port, file associations for `.carbonara` and `.cpack`, native dialogs, menus.

**Done when** the desktop build opens files by double-click and the platform contract tests pass.

- [x] Tauri platform + contract tests
- [x] File associations
- [x] Dialogs + menus
- [x] One running instance: a second launch hands its files to the first
- [x] Linux packages register the file types (MIME file, `%F` in the `.desktop` entry)
- [ ] Tried by hand on a desktop: double-click in a file manager (Linux, Windows, macOS), the open and save dialogs, dropping a `.cpack` on the window, the macOS menu bar

How it works: [[Architecture/Desktop]].

## Decisions

- **The Rust shell is a workspace member, not a default member** (`src/shells/tauri/src-tauri`, package `carbonara-desktop`). One `Cargo.lock` and `target/`, the workspace's lints; plain `cargo test`/`clippy` don't need WebKitGTK, `-p carbonara-desktop` builds it.
- **Its own web entry and composition root** (`src/shells/tauri/`), built with the root Vite config into `dist/desktop`. The web build doesn't change and carries no Tauri code.
- **Storage in the app data folder** through the Rust shell's `storage_*` commands, one JSON file per key (hex file names). The backend worker reaches the commands through a `MessagePort` to the UI thread, which serves only those four commands. The `KeyValueStorage` contract now says values are JSON values, and gained a case for keys with any characters.
- **New port `FileAccess`** in `src/contracts/platform.ts` (with `FileType` and `PickedFile`): `documents/actions.ts` picks and saves through it, the browser's file input and download by default, native dialogs on desktop via `setFileAccess`. Dialogs run in Rust and Rust reads and writes the file, so the webview never names a path.
- **Menu bar on macOS only**, built from the command registry; Windows and Linux keep the in-app menu.
- **Opened `.cpack`s** reuse the packs feature's trust prompt from the shell, since the packs feature has no way to hand it a file.

## Comments

- **Claude** (2026-10-27): Verified in the cloud container: `pnpm check`, `pnpm format:check`, `cargo fmt --check`, `cargo clippy`/`cargo test` (root and `-p carbonara-desktop`), the web e2e suite, and `pnpm desktop:build` (`.deb`, `.rpm`, AppImage). The release binary, run under `xvfb-run`: renders the app with the CSP on and solves the example factory; opens a `.carbonara` passed as an argument and shows the trust prompt for a `.cpack`; a second launch with a file exits at once and the running app opens the file; the next start restores it from `key-value/` in the app data folder. `gio` identifies `.carbonara` and `.cpack` files by the packaged MIME file. Not tried: native dialogs, a file manager's double-click, drag and drop in WebKitGTK, Windows, macOS.
