// Placing a blueprint from the library: it follows the pointer over the canvas as a ghost (the shared ghost
// renderer, pointer mode) until a click, or the end of a drag, puts an instance of it there; Escape cancels.
// From the keyboard, it goes straight into the middle of the view, clear of the other nodes.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CommandInput } from "../../../contracts/commands";
import type { Document, LocalId, Node } from "../../../contracts/document";
import type { CanvasProps } from "../../canvas/canvas";
import { canvasEditActions } from "../../canvas/edit-actions";
import { GRID } from "../../canvas/model/geometry";
import { createSceneBuilder } from "../../canvas/model/scene";
import { canvasActions } from "../../canvas/viewport";
import type { Ghost } from "../../canvas/ghost/ghost";
import { useConnector } from "../../core/connector";
import { errorMessage, toast } from "../../shell/toasts";

const GHOST_NODE = "blueprint";
const ORIGIN = { [GHOST_NODE]: { x: 0, y: 0 } };

export interface BlueprintPlacement {
  /** The blueprint following the pointer, if any. */
  placing: LocalId | null;
  /** Starts following the pointer with this blueprint. */
  pick(blueprint: LocalId): void;
  /** Places it in the middle of the view right away. */
  placeInView(blueprint: LocalId): void;
  /** Places it where a drag let go of it, under this point on screen (client pixels), as the ghost showed it. */
  drop(blueprint: LocalId, screen: { x: number; y: number }): void;
  cancel(): void;
  /** For the document's canvas while a blueprint follows the pointer. */
  canvas: Pick<CanvasProps, "ghost" | "onGhostPlace" | "onGhostCancel"> | null;
}

export function useBlueprintPlacement(document: Document | undefined, graph: string): BlueprintPlacement {
  const connector = useConnector();
  const [placing, setPlacing] = useState<{ documentId: string; blueprint: LocalId } | null>(null);
  const current = placing && document && placing.documentId === document.id ? placing.blueprint : null;
  const blueprint = current ? document?.blueprints[current] : undefined;
  const cancel = useCallback(() => setPlacing(null), []);

  const place = useCallback(
    (id: LocalId, position: { x: number; y: number }) => {
      if (!document) return;
      const name = document.blueprints[id]?.name ?? id;
      const commands: CommandInput[] = [
        {
          type: "addNode",
          graph,
          id: `subgraph-${crypto.randomUUID().slice(0, 8)}`,
          node: { kind: "instance", blueprint: id },
          position,
        },
      ];
      const failed = (description: string) => toast({ tone: "error", title: `Couldn't place ${name}`, description });
      connector.editing.apply({ documentId: document.id, commands, label: `Place ${name}` }).then(
        (result) => {
          if (!result.ok) failed(result.error.map((issue) => issue.message).join(" "));
        },
        (error: unknown) => failed(errorMessage(error)),
      );
    },
    [connector, document, graph],
  );

  // Escape cancels wherever the focus is (the library keeps it after a click).
  useEffect(() => {
    if (!current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPlacing(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current]);

  const ghost = useMemo((): Ghost | undefined => {
    if (!current || !blueprint) return undefined;
    const node: Node = { kind: "instance", blueprint: current };
    return {
      graph: { nodes: { [GHOST_NODE]: node }, edges: {} },
      positions: ORIGIN,
      placement: { mode: "pointer" },
      label: blueprint.name,
    };
  }, [current, blueprint]);

  const onGhostPlace = useCallback(
    (offset: { x: number; y: number }) => {
      if (!current) return;
      setPlacing(null);
      place(current, offset);
    },
    [current, place],
  );

  return {
    placing: current,
    pick: useCallback((id: LocalId) => document && setPlacing({ documentId: document.id, blueprint: id }), [document]),
    placeInView: useCallback(
      (id: LocalId) => {
        const spot = canvasEditActions()?.placeNew({ kind: "instance", blueprint: id });
        if (spot) place(id, spot);
      },
      [place],
    ),
    drop: useCallback(
      (id: LocalId, screen: { x: number; y: number }) => {
        setPlacing(null);
        const pointer = canvasActions()?.toFlow(screen);
        if (!pointer || !document) return;
        // Centred on the pointer and snapped to the grid, as the ghost following the pointer is drawn.
        const [view] = createSceneBuilder()(
          { nodes: { [GHOST_NODE]: { kind: "instance", blueprint: id } }, edges: {} },
          undefined,
          { units: { rate: "per_second" }, items: [], buildings: [], recipes: [], logistics: [], resources: [] },
          document,
        ).nodes;
        const snap = (value: number) => Math.round(value / GRID) * GRID;
        place(id, { x: snap(pointer.x - (view?.width ?? 0) / 2), y: snap(pointer.y - (view?.height ?? 0) / 2) });
      },
      [document, place],
    ),
    cancel,
    canvas: ghost ? { ghost, onGhostPlace, onGhostCancel: cancel } : null,
  };
}
