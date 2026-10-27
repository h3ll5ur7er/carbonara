---
id: CARB-58
title: Ship desktop releases with updates
type: chore
status: review
priority: medium
labels: [desktop, release]
wave: "2"
milestone: "M4 Ship"
---

Updater and release builds for Windows, macOS and Linux in CI.

**Done when** tagged builds produce installers and the updater finds a newer build.

- [x] Updater
- [x] Release workflow
- [x] CI builds the Linux app on every push (job *Desktop app (Linux)*)
- [ ] Owner: updater key pair and repository secrets ([[Architecture/Desktop#Setup the repository owner does once]])
- [ ] First tag: the workflow builds all three installers, and an installed build offers the next release

How it works and how to release: [[Architecture/Desktop#Updates and releases]].

## Decisions

- **Releases are drafts.** `.github/workflows/release.yml` builds on tags `v*` (Linux on Ubuntu 22.04 for an older glibc, Windows, macOS universal) with `tauri-action` and attaches everything to a draft release; publishing it is what installed apps see.
- **The tag is the version.** The workflow writes `tauri.release.conf.json` with the version from the tag, so `package.json` stays `0.0.0` and no commit is needed to release. Tags must be three numbers (the MSI refuses `-beta`).
- **Only release builds update.** The same file adds the updater's public key (repository variable `TAURI_UPDATER_PUBKEY`) and endpoint (`releases/latest/download/latest.json`) and turns on `createUpdaterArtifacts`; the shell registers the updater only when that configuration is present. Local and CI builds need no key and never check. Nothing secret is committed.
- **The app asks before updating**, on start, with a native dialog; it installs and restarts on yes.
- **No code signing yet**: macOS and Windows warn on first start. The secrets `tauri-action` reads for it are listed on the wiki page.

## Comments

- **Claude** (2026-10-27): Verified in the cloud container: the workflow's configuration step, run locally with a throwaway key and tag `v0.1.0`, writes a configuration Tauri accepts; the release build made with it is version 0.1.0 and signs its AppImage (`.sig`). That build, pointed at a local `latest.json` announcing 0.2.0, asked "Carbonara 0.2.0 is available; you have 0.1.0. Install it and restart now?" on start. A build without the configuration doesn't check. Not tried: installing an update and restarting, the workflow on GitHub's runners, Windows and macOS installers.
