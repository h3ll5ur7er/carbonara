---
id: CARB-21
title: Build the design system primitives and theming
type: feature
status: review
priority: high
labels: [ui]
wave: "1"
milestone: "M1 It flows"
---

Buttons, inputs, sliders, steppers, menus, tooltips, dialogs, tabs on Radix primitives, styled only with tokens; theme switch and pack accent.

**Done when** a primitives gallery scene has screenshot tests in dark and light, and every primitive is keyboard-operable.

- [x] Primitives on Radix: button and icon button, input, number input (stepper), slider, select, dropdown and context menu, tooltip, dialog, tabs, toggle and switch, kbd
- [x] Theme switch + pack accent
- [x] Gallery scene + screenshots (`?scene=gallery`, dark, light, open menu, select and dialog, a second accent)
- [x] Keyboard tests ([[e2e/ui.spec.ts]])

**What's in it:** one file per primitive in [[src/client/ui]], listed on [[Design]] (Primitives). New tokens: `danger`, `danger-soft`, `success`, `knob`, `scrim`, `shadow-knob`, `inset-shadow-well`, `blur-scrim` and the overlay entrance animations.

**Decisions:**

- Number logic is pure and unit-tested ([[src/client/ui/number.ts]]): parsing accepts a decimal comma and a unit typed after the number; a nudge moves about 1/100 of the range rounded to a power of ten (never less than the step), so a clock with `step: 0.0001` still moves 1% per arrow press. Home and End stay with the caret rather than jumping to the ends.
- `NumberInput` emits only committed values (Enter, blur, a nudge) and `Slider` has a separate `onValueCommit`, so an edit becomes one undo step, not one per keystroke or pixel.
- The theme choice is a small in-memory store ([[src/client/ui/use-theme.ts]]) so the command palette can toggle it too; persisting it waits for the preferences access component.
- `Toggle` styles its pressed state by `aria-pressed`, because the tooltip trigger replaces Radix's `data-state` with its own.
- Icons come from `lucide-react` (pinned), so every icon shares one stroke style.
- The dev-only scene mechanism (`?scene=<name>`, [[src/client/scenes/registry.ts]]) arrived here for the gallery; [[CARB-24]] adds the canonical scenes.
