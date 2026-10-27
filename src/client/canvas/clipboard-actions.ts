// Copy, cut, paste and duplicate on the canvas (docs/Design/Editor-quality-of-life.md, Clipboard and ghost
// placement). A copy goes to the system clipboard as text, so it reaches other tabs and windows, and stays in
// this tab too. Pasting and duplicating don't drop nodes right away: they hand the copy to the paste ghost
// (use-paste.ts), which follows the pointer until a click places it.
import type { RefObject } from "react";
import type { Clipboard } from "../../contracts/clipboard";
import type { CommandInput } from "../../contracts/commands";
import type { Document, Graph, LocalId } from "../../contracts/document";
import type { PackData } from "../../contracts/pack";
import type { Result } from "../../contracts/result";
import type { Connector } from "../core/connector";
import { clipboardFromText, clipboardText, nodeCount, packWarning } from "../features/clipboard/clipboard";
import { useClipboard } from "../features/clipboard/clipboard-store";
import { readSystemText, writeSystemText } from "../features/clipboard/system-clipboard";
import { errorMessage, toast } from "../shell/toasts";
import { GRID } from "./model/geometry";
import type { CanvasScene } from "./model/scene";
import type { Selection } from "./use-edit-actions";

export interface ClipboardActions {
  /** Copies the selected nodes, with the flows among them. */
  copy(): void;
  /** Copies the selected nodes, then deletes them (and the selected flows) as one edit. */
  cut(): void;
  /** Shows what the clipboard holds as a ghost to place; with connections, it reconnects to the nodes it left. */
  paste(connections: boolean): void;
  /** Shows a copy of the selected nodes as a ghost to place, leaving the clipboard alone. */
  duplicate(): void;
}

export interface ClipboardActionsInput {
  connector: Connector;
  document: Document;
  pack: PackData;
  graph: string;
  shown: Graph | undefined;
  scene: CanvasScene;
  selection: RefObject<Selection>;
  apply(commands: CommandInput[], label: string): Promise<void>;
}

export function clipboardActions({
  connector,
  document,
  pack,
  graph,
  shown,
  scene,
  selection,
  apply,
}: ClipboardActionsInput): ClipboardActions {
  const documentId = document.id;
  const selectedNodes = () => selection.current.nodes.filter((id) => shown?.nodes[id]);
  const copyOf = async (nodeIds: LocalId[]): Promise<Clipboard> =>
    unwrap(await connector.editing.copy({ documentId, graph, nodeIds }));

  /** Copies to both clipboards; resolves with the copy, or undefined (and says why) when it failed. */
  const copySelection = (nodeIds: LocalId[], verb: "Copy" | "Cut"): Promise<Clipboard | undefined> => {
    const copied = copyOf(nodeIds);
    // Started while the key is down: browsers only allow writing the clipboard then.
    void writeSystemText(copied.then(clipboardText));
    return copied.then(
      (clipboard) => {
        useClipboard.setState({ copied: clipboard });
        return clipboard;
      },
      (error: unknown) => {
        failed(verb, errorMessage(error));
        return undefined;
      },
    );
  };

  const startPaste = (clipboard: Clipboard, connections: boolean, label: string, at?: { x: number; y: number }) =>
    useClipboard.setState({
      pending: { documentId, graph, clipboard, connections, label, ...(at && { at }) },
    });

  return {
    copy() {
      const nodeIds = selectedNodes();
      if (nodeIds.length === 0) return;
      void copySelection(nodeIds, "Copy").then((clipboard) => {
        if (clipboard) toast({ tone: "success", title: `Copied ${nodeCount(nodeIds.length)}` });
      });
    },
    cut() {
      const nodeIds = selectedNodes();
      if (nodeIds.length === 0) return;
      const removed = new Set(nodeIds);
      const edges = selection.current.edges.filter((id) => {
        const edge = shown?.edges[id];
        return edge && !removed.has(edge.from) && !removed.has(edge.to);
      });
      void copySelection(nodeIds, "Cut").then((clipboard) => {
        if (!clipboard) return;
        void apply(
          [
            { type: "removeNodes", graph, ids: nodeIds },
            ...(edges.length > 0 ? [{ type: "disconnect" as const, graph, ids: edges }] : []),
          ],
          `Cut ${nodeCount(nodeIds.length)}`,
        );
      });
    },
    paste(connections) {
      void readSystemText().then((text) => {
        const clipboard = (text !== null && clipboardFromText(text)) || useClipboard.getState().copied;
        if (!clipboard) {
          toast({ title: "Nothing to paste", description: "Copy some nodes first, here or in another factory." });
          return;
        }
        const warning = packWarning(clipboard, document.pack.id, pack);
        if (warning) toast(warning);
        const count = Object.keys(clipboard.graph.nodes).length;
        startPaste(clipboard, connections, `Paste ${nodeCount(count)}`);
      });
    },
    duplicate() {
      const nodeIds = selectedNodes();
      if (nodeIds.length === 0) return;
      // Next to the originals until the pointer comes onto the canvas.
      const chosen = new Set(nodeIds);
      const views = scene.nodes.filter((view) => chosen.has(view.id));
      const right = Math.max(...views.map((view) => view.position.x + view.width));
      const left = Math.min(...views.map((view) => view.position.x));
      const top = Math.min(...views.map((view) => view.position.y));
      const bottom = Math.max(...views.map((view) => view.position.y + view.height));
      const at = { x: (left + right) / 2 + GRID * 2, y: (top + bottom) / 2 + GRID * 2 };
      copyOf(nodeIds).then(
        (clipboard) => startPaste(clipboard, false, `Duplicate ${nodeCount(nodeIds.length)}`, at),
        (error: unknown) => failed("Duplicate", errorMessage(error)),
      );
    },
  };
}

function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  throw new Error(result.error.map((issue) => issue.message).join(" "));
}

function failed(verb: string, description: string) {
  toast({ tone: "error", title: `Couldn't ${verb.toLowerCase()}`, ...(description && { description }) });
}
