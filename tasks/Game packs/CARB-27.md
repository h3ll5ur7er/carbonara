---
id: CARB-27
title: Manage packs in the app
type: feature
status: done
priority: high
labels: [packs, managers, ui]
wave: "1"
milestone: "M1 It flows"
---

The `packs` manager (list, install, trust, remove) and the pack manager panel with the trust prompt.

**Done when** dropping a third-party `.cpack` on the app shows the trust prompt and installs it after confirmation (e2e).

- [x] Manager use-case tests ([[src/managers/packs.test.ts]])
- [x] Wired into the web backend with OPFS storage and the built-in packs
- [x] Pack manager panel (top bar → Game packs)
- [x] Trust prompt with id, version, hash
- [x] e2e test ([[e2e/packs.spec.ts]]: install after confirmation and persistence across a reload, cancel, broken pack)

Decisions:

- Trusting is installing: the client inspects first (`inspectPack` runs no pack code), shows the prompt, and installs on confirmation. The manager validates the bytes again on install instead of remembering inspections.
- The trust prompt shows the issues instead when the pack can't be installed, located by file, line and column.
- The dialogs use the native `<dialog>` element (focus trap, Escape, top layer) inside the feature until the design system has a dialog primitive ([[CARB-21]]); swap them then.
- The workspace and packs managers share one pack library in the composition root, replacing the stand-in `PackStore` the Documents epic left there.
- No component tests for the dialogs: the client has no DOM test setup yet, so the e2e tests cover the behaviour.
