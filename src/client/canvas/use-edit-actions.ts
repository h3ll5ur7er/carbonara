// The canvas's editing actions for the app's commands (edit-actions.ts), for the document on screen: they read
// the selection and the scene the moment they run and send their edits through the connector.
import { useEffect, type RefObject } from "react";
import type { CommandInput } from "../../contracts/commands";
import type { Document, LocalId, Node } from "../../contracts/document";
import type { PackData } from "../../contracts/pack";
import { useConnector } from "../core/connector";
import { errorMessage, toast } from "../shell/toasts";
import { setCanvasEditActions } from "./edit-actions";
import { freeSpot, obstaclesOf } from "./model/free-spot";
import { GRID } from "./model/geometry";
import { createSceneBuilder, type CanvasScene } from "./model/scene";
import { shapesOf } from "./model/shapes";
import { viewportCentre } from "./viewport";

export interface Selection {
  nodes: LocalId[];
  edges: LocalId[];
}

export interface EditActionsInput {
  document: Document;
  pack: PackData;
  graph: string;
  scene: CanvasScene;
  selection: RefObject<Selection>;
  apply(commands: CommandInput[], label: string): Promise<void>;
}

export function useEditActions({ document, pack, graph, scene, selection, apply }: EditActionsInput): void {
  const connector = useConnector();
  const documentId = document.id;
  const layout = document.layout[graph];

  useEffect(() => {
    setCanvasEditActions({
      arrange(direction) {
        const selected = selection.current.nodes;
        const nodeIds = selected.length >= 2 ? selected : undefined;
        const label = "Arrange";
        connector.editing
          .arrange({ documentId, graph, direction, shapes: shapesOf(scene.nodes), ...(nodeIds && { nodeIds }) })
          .then(
            (result) => {
              if (!result.ok) failed(label, result.error.map((issue) => issue.message).join(" "));
            },
            (error: unknown) => failed(label, errorMessage(error)),
          );
      },
      toggleLock() {
        const ids = selection.current.nodes;
        if (ids.length === 0) return;
        const locked = !ids.every((id) => layout?.[id]?.locked);
        void apply([{ type: "setLocked", graph, ids, locked }], locked ? "Lock" : "Unlock");
      },
      placeNew(node: Node) {
        const [view] = createSceneBuilder()({ nodes: { new: node }, edges: {} }, undefined, pack).nodes;
        const width = view?.width ?? 0;
        const height = view?.height ?? 0;
        const centre = viewportCentre() ?? { x: 0, y: 0 };
        const snap = (value: number) => Math.round(value / GRID) * GRID;
        const wanted = { x: snap(centre.x - width / 2), y: snap(centre.y - height / 2), width, height };
        return freeSpot(wanted, obstaclesOf(scene.nodes), GRID);
      },
    });
    return () => setCanvasEditActions(undefined);
  }, [connector, documentId, graph, layout, pack, scene, selection, apply]);
}

function failed(label: string, description: string) {
  toast({ tone: "error", title: `Couldn't ${label.toLowerCase()}`, ...(description && { description }) });
}
