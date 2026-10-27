// The copy this tab made last (for when the system clipboard can't be read) and the paste whose ghost waits to
// be placed on the canvas of its document and graph.
import { create } from "zustand";
import type { Clipboard } from "../../../contracts/clipboard";
import type { Point } from "../../canvas/adapter";

export interface PendingPaste {
  documentId: string;
  graph: string;
  clipboard: Clipboard;
  /** Reconnect to the nodes the copy left behind (paste with connections). */
  connections: boolean;
  /** For the ghost and the history: "Paste 5 nodes", "Duplicate 2 nodes". */
  label: string;
  /** Where the ghost's centre starts, in flow units, until the pointer moves; under the pointer when left out. */
  at?: Point;
}

export const useClipboard = create<{ copied: Clipboard | null; pending: PendingPaste | null }>(() => ({
  copied: null,
  pending: null,
}));
