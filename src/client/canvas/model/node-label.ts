// Hides how a node is named for screen readers: the words its card shows, in a short phrase that says what it is.
import type { NodeView } from "./scene";

/** A note is named by the start of its text: enough to tell notes apart. */
const NOTE_PREVIEW = 60;

export function nodeLabel(view: NodeView): string {
  switch (view.kind) {
    case "recipe":
      return `${view.title} (${view.building.name})`;
    case "source":
      return `${view.item.name} source`;
    case "sink":
      return `${view.item.name} output`;
    case "junction":
      return view.item ? `${view.item.name} junction` : "Junction";
    case "note": {
      const text = view.text.replace(/\s+/g, " ").trim().slice(0, NOTE_PREVIEW);
      return text ? `Note: ${text}` : "Note";
    }
    case "frame":
      return `Frame ${view.label}`;
    case "instance":
      return `${view.title} subgraph`;
    case "port":
      return `${view.item.name} ${view.direction === "in" ? "input" : "output"} port`;
  }
}
