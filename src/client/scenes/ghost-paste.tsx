// Scene `ghost-paste` (docs/Design.md, Visual QA): the motor factory with a copy of its wire line on the way in,
// drawn as the paste ghost that follows the pointer, with its "click to place" hint. The copy is made here the
// way the editing engine makes it (the copied nodes, the flows among them, their positions); placing it needs the
// real backend (e2e/qol-clipboard.spec.ts covers that in the app).
import type { ComponentType } from "react";
import { CLIPBOARD_FORMAT, type Clipboard } from "../../contracts/clipboard";
import type { Document } from "../../contracts/document";
import { canvasScene } from "../canvas/scenes/scene-canvas";
import { scenes } from "../canvas/scenes";
import { useClipboard } from "../features/clipboard/clipboard-store";

const COPIED = ["smelt-copper", "wire", "slag"];

function copyOf(document: Document, ids: string[]): Clipboard {
  const chosen = new Set(ids);
  const pick = <T,>(entries: Record<string, T>, keep: (id: string, value: T) => boolean) =>
    Object.fromEntries(Object.entries(entries).filter(([id, value]) => keep(id, value)));
  return {
    format: CLIPBOARD_FORMAT,
    version: 1,
    pack: { id: document.pack.id, version: document.pack.version },
    source: { documentId: document.id, graph: "root" },
    graph: {
      nodes: pick(document.graph.nodes, (id) => chosen.has(id)),
      edges: pick(document.graph.edges, (_id, edge) => chosen.has(edge.from) && chosen.has(edge.to)),
    },
    layout: pick(document.layout.root ?? {}, (id) => chosen.has(id)),
    connections: {},
    blueprints: {},
  };
}

const Chain = canvasScene("chain");

function GhostPasteScene() {
  return <Chain />;
}

const { document } = scenes.chain();
useClipboard.setState({
  pending: {
    documentId: document.id,
    graph: "root",
    clipboard: copyOf(document, COPIED),
    connections: false,
    label: `Paste ${COPIED.length} nodes`,
    // Below the circuits, clear of the factory; the pointer isn't on the canvas in a screenshot.
    at: { x: 1608, y: 1104 },
  },
});

export default GhostPasteScene satisfies ComponentType;
