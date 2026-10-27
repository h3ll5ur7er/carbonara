// Gestures on flows: dragging a node without flows over a flow marks it as the place to insert the node, and
// holding Alt makes the ends of flows draggable to other ports (React Flow's reconnecting).
import { useCallback, useEffect, useRef, useState } from "react";
import { edgeUnder } from "../model/insert";
import type { CanvasScene } from "../model/scene";
import type { FlowNode } from "./types";

/** Follows a drag; `target` is the flow the dragged node would be inserted into if dropped now. */
export function useInsertTarget(scene: CanvasScene) {
  const [target, setTarget] = useState<string | undefined>();
  const latest = useRef<string | undefined>(undefined);

  const follow = useCallback(
    (dragged: FlowNode[]) => {
      const [node] = dragged;
      // Only a single node without flows of its own is inserted; anything else is just moved.
      const loose =
        dragged.length === 1 &&
        node !== undefined &&
        !scene.edges.some((edge) => edge.source === node.id || edge.target === node.id);
      const next =
        loose && node
          ? edgeUnder({ ...node.position, width: node.width ?? 0, height: node.height ?? 0 }, scene, node.data.view)
          : undefined;
      if (next !== latest.current) {
        latest.current = next;
        setTarget(next);
      }
    },
    [scene],
  );
  /** Ends the drag: the flow to insert into, if any. */
  const end = useCallback(() => {
    const last = latest.current;
    latest.current = undefined;
    setTarget(undefined);
    return last;
  }, []);
  return { target, follow, end };
}

/** Whether Alt is held down right now. */
export function useAltHeld(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => setHeld(event.altKey);
    const release = () => setHeld(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", release);
    };
  }, []);
  return held;
}
