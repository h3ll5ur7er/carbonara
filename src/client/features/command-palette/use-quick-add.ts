// Quick-add wired to the managers: the open document's pack data comes from `packs.getPackData`, and a picked
// entry goes to `editing.apply`. Outcomes are reported as toasts.
import { useEffect, useState } from "react";
import type { Position } from "../../../contracts/document";
import { canvasEditActions } from "../../canvas/edit-actions";
import { viewportCentre } from "../../canvas/viewport";
import { useConnector } from "../../core/connector";
import { errorMessage, toast } from "../../shell/toasts";
import { addRecipeNode, quickAddEntries, type QuickAddEntry } from "./quick-add";

export interface QuickAdd {
  entries: QuickAddEntry[];
  add(entry: QuickAddEntry): void;
}

/** The document quick-add edits: its id, and the pack its recipes come from. */
export interface QuickAddDocument {
  id: string;
  packId: string;
}

/** Where a quick-added node lands when no canvas says where the user is looking (scenes, tests). */
const origin: Position = { x: 0, y: 0 };

export function useQuickAdd(document: QuickAddDocument | null): QuickAdd | null {
  const connector = useConnector();
  const documentId = document?.id;
  const packId = document?.packId;
  const [loaded, setLoaded] = useState<{ packId: string; entries: QuickAddEntry[] } | null>(null);

  useEffect(() => {
    if (!packId) return;
    let current = true;
    connector.packs.getPackData({ packId }).then(
      (pack) => current && setLoaded({ packId, entries: quickAddEntries(pack) }),
      (error: unknown) =>
        toast({ tone: "error", title: "Couldn't load the pack's recipes", description: errorMessage(error) }),
    );
    return () => {
      current = false;
    };
  }, [connector, packId]);

  if (!documentId || !loaded || loaded.packId !== packId) return null;
  return {
    entries: loaded.entries,
    add(entry) {
      // Mid-view, clear of the nodes already there, when a canvas is on screen.
      const position =
        canvasEditActions()?.placeNew({ kind: "recipe", recipe: entry.recipeId }) ?? viewportCentre() ?? origin;
      addRecipeNode(connector.editing, documentId, entry, position).then(
        (result) =>
          result.ok
            ? toast({ tone: "success", title: `Added ${entry.title}` })
            : toast({
                tone: "error",
                title: `Couldn't add ${entry.title}`,
                description: result.error.map((issue) => issue.message).join(" "),
              }),
        (error: unknown) =>
          toast({ tone: "error", title: `Couldn't add ${entry.title}`, description: errorMessage(error) }),
      );
    },
  };
}
