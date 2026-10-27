---
id: CARB-64
title: Welcome new players
type: feature
status: review
priority: high
labels: [ux]
wave: "3"
milestone: "M4 Ship"
---

First run asks which game you play, opens a starter factory, and runs an interactive tour.

**Done when** the e2e test completes the tour.

- [x] Game picker: the first run's welcome asks which game; skipping is remembered
- [x] Starter factories per pack: pack format 1.1 `starters/`, one in each built-in pack
- [x] Tour: welcome, add a recipe (palette), connect, set a target, watch it solve, plan with P, done
- [x] Skippable, resumable from the palette ("Take the tour"), keyboard-accessible, reduced-motion aware
- [x] Progress in the platform's key-value storage (preferences access component)
- [x] e2e completes the tour ([[e2e/onboarding.spec.ts]]); other specs never see it

## Decisions

- **Starters live in the pack**, in an optional `starters/` folder (pack format 1.0 → 1.1, additive). They name the game's recipes and items, so they change with its data and arrive with a new game without an app release (open/closed). Not in `data/`, because `carbonara-pack import` regenerates that folder. They're read into `PackData.starters`, so they travel with the pack data everywhere without new plumbing; `workspace.createDocument` takes a `starter` id. `carbonara-pack new` leaves the template's starter out (it only fits the template's data). See [[Architecture/Game packs]], Starter factories.
- **Progress in preferences:** a new preferences access component over `KeyValueStorage` (`carbonara-preferences`) and `workspace.getPreferences` / `setPreferences`, typed by [[src/contracts/preferences.ts]] (`tour: { step, finished }`). No progress saved = first run.
- **The tour watches the factory** instead of instrumenting the canvas: pure predicates over snapshots of the active document ([[src/client/features/onboarding/tour.ts]]), so it needs no hooks in the canvas, palette or planner.
- **Kept out of other tests:** automated browsers (`navigator.webdriver`) skip the first run unless the address has `?first-run`. Scenes never render the live app, so they can't see it either.
- The card sits at the top centre of the canvas for every step (one predictable place), with a ring around the step's target; untargeted steps have no ring.
