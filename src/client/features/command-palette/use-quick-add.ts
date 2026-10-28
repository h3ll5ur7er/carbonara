// Quick-add wired to the managers: the document's pack data comes from the shell (`packs.getPackData`), and a
// picked entry is added to the canvas on screen (or through `editing.apply` without one). Outcomes are toasts.
import { useMemo } from "react";
import type { Position } from "../../../contracts/document";
import type { PackData } from "../../../contracts/pack";
import { canvasEditActions } from "../../canvas/edit-actions";
import { focusNodeWhenShown } from "../../canvas/focus";
import { viewportCentre } from "../../canvas/viewport";
import { useConnector } from "../../core/connector";
import { errorMessage, toast } from "../../shell/toasts";
import { rememberAdded, useMemoryOf } from "../recipe-browser/memory";
import { addRecipeNode, quickAddEntries, type QuickAddEntry } from "./quick-add";

export interface QuickAdd {
  entries: QuickAddEntry[];
  /** The person's favourite recipes of the pack and the ones they added last (newest first), offered first. */
  favourites: QuickAddEntry[];
  recent: QuickAddEntry[];
  add(entry: QuickAddEntry): void;
}

/** The document quick-add edits: its id, and the pack its recipes come from. */
export interface QuickAddDocument {
  id: string;
  packId: string;
}

/** Where a quick-added node lands when no canvas says where the user is looking (scenes, tests). */
const origin: Position = { x: 0, y: 0 };

/** Quick-add for the document, once its pack's data (`pack`) has loaded. */
export function useQuickAdd(document: QuickAddDocument | null, pack: PackData | undefined): QuickAdd | null {
  const connector = useConnector();
  const documentId = document?.id;
  const packId = document?.packId;
  const entries = useMemo(() => (pack ? quickAddEntries(pack) : null), [pack]);
  const memory = useMemoryOf(packId);
  const pick = useMemo(() => {
    const byRecipe = new Map(entries?.map((entry) => [entry.recipeId, entry]));
    return (ids: string[]) => ids.flatMap((id) => byRecipe.get(id) ?? []);
  }, [entries]);

  if (!documentId || !entries) return null;
  return {
    entries,
    favourites: pick(memory.favourites),
    recent: pick(memory.recent),
    add(entry) {
      if (packId) rememberAdded(packId, entry.recipeId);
      // With a canvas on screen, into the graph it shows: mid-view, clear of the nodes already there, selected.
      const canvas = canvasEditActions();
      if (canvas) {
        focusNodeWhenShown(canvas.addNode({ kind: "recipe", recipe: entry.recipeId }, { label: `Add ${entry.title}` }));
        toast({ tone: "success", title: `Added ${entry.title}` });
        return;
      }
      const position = viewportCentre() ?? origin;
      // Named here, so the keyboard focus can follow it onto the canvas once it's drawn.
      const id = `${entry.recipeId}-${crypto.randomUUID().slice(0, 6)}`;
      addRecipeNode(connector.editing, documentId, entry, position, id).then(
        (result) => {
          if (!result.ok) {
            toast({
              tone: "error",
              title: `Couldn't add ${entry.title}`,
              description: result.error.map((issue) => issue.message).join(" "),
            });
            return;
          }
          focusNodeWhenShown(id);
          toast({ tone: "success", title: `Added ${entry.title}` });
        },
        (error: unknown) =>
          toast({ tone: "error", title: `Couldn't add ${entry.title}`, description: errorMessage(error) }),
      );
    },
  };
}
