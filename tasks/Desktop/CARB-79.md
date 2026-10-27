---
id: CARB-79
title: Tidy the desktop shell's loose ends
type: chore
status: backlog
priority: medium
labels: [desktop]
wave: "3"
milestone: "M4 Ship"
---

Open problems left by [[CARB-57]].

- [ ] Share links copied in the desktop app point at the web app, not `tauri://localhost`
- [ ] One backend setup that takes the platform, instead of `src/shells/tauri/backend.ts` repeating `src/shells/web/backend.ts`
- [ ] Let the packs feature accept a file, so opened `.cpack` files don't repeat the inspect → prompt → install sequence in the shell
- [ ] File contents cross to Rust as bytes, not JSON number arrays (only if it shows up in a profile)
