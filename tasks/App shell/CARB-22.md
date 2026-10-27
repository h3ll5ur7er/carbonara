---
id: CARB-22
title: Lay out panels and the inspector
type: feature
status: done
priority: high
labels: [ui]
wave: "1"
milestone: "M1 It flows"
---

Resizable side panels, the inspector framework that renders plugin field descriptors (slider, stepper, enum, item-slot picker), and toasts.

**Done when** the inspector renders the template pack's fields for a selected node and edits go through `editing`.

- [x] Panel layout: floating glass panels left (Library) and right (Inspector), resizable by drag and keyboard, closable, toggled from the top bar
- [x] Field-descriptor renderer: number → slider + stepper with unit, choice → select, toggle → switch
- [x] Edits go through `editing.apply` as one `setNodeFields` command each, with an undo label
- [x] Toasts
- [x] Tests: unit tests for the panel geometry, the descriptor mapping, the edit command and toasts; a component test of the inspector with a mocked connector; e2e and screenshots of the `inspector` scene ([[e2e/shell-panels.spec.ts]])
- [ ] Wire the selection: the inspector shows `selection` from `AppShell`'s props; the canvas selection and the read model feed it once they exist ([[CARB-16]], [[CARB-20]])
- [ ] Item-slot picker: no `FieldDescriptor` kind for it yet; add it with the contract change when a pack needs one (Factorio modules, [[CARB-44]])

**Notes:**

- The template pack's plugin declares no fields, so the `inspector` scene uses Satisfactory-like fields (clock speed, power shards, a mode, a somersloop) with a fake editing manager behind the real RPC envelope ([[src/client/scenes/fake-backend.ts]]).
- `Inspector` only knows `onFieldEdit`; `InspectorPanel` sends edits through the connector and shows an error toast when the manager refuses one or the call fails. The control keeps the new value until the call returns, so it doesn't flicker back.
- Panel open state and widths are a session store until the preferences access component persists them.
- Component tests use Testing Library on jsdom, chosen per file with `// @vitest-environment jsdom`, so the rest of the suite keeps running on Node.
