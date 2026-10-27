---
id: CARB-16
title: Render factory nodes behind a CanvasAdapter
type: feature
status: done
priority: urgent
labels: [canvas, ui]
wave: "1"
milestone: "M1 It flows"
---

`CanvasAdapter` interface and its React Flow implementation, with recipe, source, sink and splitter node components and their ports ([[Design]]).

**Done when** the canonical 20-node chain renders from a document read model and its screenshots are approved.

- [x] `CanvasAdapter` interface (the only seam for a future WebGL renderer)
- [x] Node components with item-icon ports and live rates
- [x] Node components subscribe to their own result slot
- [x] Screenshot tests
- Wiring `Canvas` to the read model (`src/client/core/read-model.ts`) and tabs is [[CARB-70]]: it passes the read model's document, the pack data and the results as props.

## Decisions

- **The seam:** `CanvasAdapter` ([[src/client/canvas/adapter.ts]]) is a component type. It gets a renderer-neutral scene ([[src/client/canvas/model/scene.ts]]), the result slots and the rate unit, and reports intents (`onMoveNodes`, `onConnect`). It never sees commands or the connector; `Canvas` ([[src/client/canvas/canvas.tsx]]) turns intents into `editing.apply` commands.
- **Props, not a store:** `Canvas` takes `Document`, `PackData` and `AnalysisResults` as props, so the fixtures drive it now and the read model plugs in later without changes inside the canvas.
- **Fixed geometry:** node sizes and port positions follow from the node kind and port count ([[src/client/canvas/model/geometry.ts]]) and are given to React Flow as `width`, `height` and `handles`, so edges don't wait for DOM measurement, edges of culled nodes keep their ends, and every LOD tier keeps the same ports.
- **Ports are stacked rows** (inputs, then outputs) rather than two columns: two columns truncated nearly every item name at a readable card width.
- **Results bypass React state:** per-node and per-edge slots ([[src/client/canvas/model/result-slots.ts]]) with `useSyncExternalStore`; unchanged slots keep their identity and aren't notified.
- **Icons:** packs may leave out icons and the pack contract offers no way to load them into the client yet, so every item uses the monogram chip ([[Design]], Nodes). Real icons can replace the chip's content once packs serve them.
- Instance and port nodes render as placeholders until the subgraph epic draws them; edges to them are left out.
- Fixture scenes live in [[src/client/canvas/scenes]] and show with `?scene=<name>` in development only; their backend is the real connector and dispatcher with an in-memory `editing.apply` that understands `addNode`, `connect` and `moveNodes`.
