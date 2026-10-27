// The paste ghost of the canvas on screen: the paste waiting in the clipboard store (clipboard-actions.ts) drawn
// as a ghost that follows the pointer; placing it pastes through `editing.paste` (one undo step) and selects the
// new nodes once they're on the canvas. A paste for another document or graph is dropped.
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Document } from "../../contracts/document";
import { nodeCount } from "../features/clipboard/clipboard";
import { useClipboard } from "../features/clipboard/clipboard-store";
import { useConnector } from "../core/connector";
import { errorMessage, toast } from "../shell/toasts";
import type { Point } from "./adapter";
import type { Ghost } from "./ghost/ghost";
import type { CanvasScene, Subgraphs } from "./model/scene";
import type { Clipboard } from "../../contracts/clipboard";
import { canvasActions } from "./viewport";

export interface PasteGhost {
  ghost: Ghost | undefined;
  onPlace(offset: Point): void;
  onCancel(): void;
}

export function usePaste(document: Document, graph: string, scene: CanvasScene): PasteGhost {
  const connector = useConnector();
  const pending = useClipboard((state) =>
    state.pending?.documentId === document.id && state.pending.graph === graph ? state.pending : null,
  );

  // Switching documents or graphs drops a paste meant for another.
  useEffect(() => {
    const { pending: waiting } = useClipboard.getState();
    if (waiting && (waiting.documentId !== document.id || waiting.graph !== graph)) {
      useClipboard.setState({ pending: null });
    }
  }, [document.id, graph]);

  const ghost = useMemo<Ghost | undefined>(
    () =>
      pending
        ? {
            graph: pending.clipboard.graph,
            positions: pending.clipboard.layout,
            placement: { mode: "pointer", ...(pending.at && { at: pending.at }) },
            label: pending.label,
            // The instances are drawn with the blueprints they came with, which the paste brings along.
            subgraphs: subgraphsOf(pending.clipboard, document.id, document.blueprints),
          }
        : undefined,
    [pending, document.id, document.blueprints],
  );

  // The new nodes are selected as soon as the canvas shows them (the change may arrive before or after the answer).
  const toSelect = useRef<string[] | null>(null);
  const shown = useRef(scene);
  const selectWhenShown = useCallback(() => {
    const ids = toSelect.current;
    if (!ids) return;
    const present = new Set(shown.current.nodes.map((node) => node.id));
    if (!ids.every((id) => present.has(id))) return;
    toSelect.current = null;
    canvasActions()?.select(ids);
  }, []);
  useEffect(() => {
    shown.current = scene;
    selectWhenShown();
  }, [scene, selectWhenShown]);

  const onPlace = useCallback(
    (offset: Point) => {
      if (!pending) return;
      useClipboard.setState({ pending: null });
      const { clipboard, connections, label } = pending;
      const title = `Couldn't ${label.split(" ")[0]?.toLowerCase() ?? "paste"}`;
      connector.editing
        .paste({ documentId: document.id, graph, clipboard, offset, connections, label })
        .then((result) => {
          if (!result.ok) {
            toast({ tone: "error", title, description: result.error.map((issue) => issue.message).join(" ") });
            return;
          }
          const { nodeIds, leftOut } = result.value;
          if (leftOut.length > 0) {
            toast({
              tone: "error",
              title:
                nodeIds.length > 0 ? `Pasted ${nodeCount(nodeIds.length)}, not all` : "Nothing could be pasted here",
              description: `Left out: ${leftOut.join("; ")}.`,
            });
          }
          toSelect.current = nodeIds;
          selectWhenShown();
        })
        .catch((error: unknown) => toast({ tone: "error", title, description: errorMessage(error) }));
    },
    [connector, document.id, graph, pending, selectWhenShown],
  );
  const onCancel = useCallback(() => useClipboard.setState({ pending: null }), []);

  return { ghost, onPlace, onCancel };
}

/** The blueprints a paste brings along; one from this document places those it has, as they are now. */
function subgraphsOf(
  { blueprints, source }: Clipboard,
  documentId: string,
  own: Document["blueprints"],
): Subgraphs | undefined {
  const here = source.documentId === documentId;
  const entries = Object.entries(blueprints).filter(([id]) => !(here && Object.hasOwn(own, id)));
  if (entries.length === 0) return undefined;
  return {
    blueprints: Object.fromEntries(entries.map(([id, { name, graph }]) => [id, { name, graph }])),
    layout: Object.fromEntries(entries.map(([id, { layout }]) => [id, layout])),
  };
}
