---
id: CARB-72
title: Reload a pack under development in the running app
type: feature
status: backlog
priority: low
labels: [packs, tooling, ui]
wave: "2"
---

`carbonara-pack dev` rebuilds a pack on every change, and packs inside the repository's `packs/` already hot-reload in `pnpm dev` ([[CARB-28]]). A pack author working in their own folder has no way to see changes in a running app yet.

**Done when** an author can point the running app at an unpacked pack folder and the app reloads the pack when its files change.

- [ ] Packs manager: load a dev folder (validate, replace the pack in the library without storing it), reload on change
- [ ] Web: pick the folder with the File System Access API and poll or observe it
- [ ] Desktop: the shell watches the folder ([[CARB-57]])
- [ ] Pack manager panel: "Load pack folder…", marked as a dev pack
