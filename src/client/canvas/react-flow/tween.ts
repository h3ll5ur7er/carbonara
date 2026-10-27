// Glides nodes to where an edit put them, one animation frame at a time (model/tween.ts has the rules).
// A new set of moves takes over from one still running, starting where the nodes are.
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { tweenAt, tweenDuration, type Move } from "../model/tween";
import type { FlowNode } from "./types";

/** The base and slow motion tokens in milliseconds; 0 when the user prefers reduced motion. */
export function motionDurations(): { base: number; slow: number } {
  const style = getComputedStyle(document.documentElement);
  const read = (token: string) => parseFloat(style.getPropertyValue(token)) || 0;
  return { base: read("--duration-base"), slow: read("--duration-slow") };
}

export function useMoveTween(setNodes: Dispatch<SetStateAction<FlowNode[]>>): (moves: Map<string, Move>) => void {
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return useCallback(
    (moves: Map<string, Move>) => {
      cancelAnimationFrame(frame.current);
      if (moves.size === 0) return;
      const place = (progress: number) =>
        setNodes((current) =>
          current.map((node) => {
            const move = moves.get(node.id);
            return move && !node.dragging ? { ...node, position: tweenAt(move, progress) } : node;
          }),
        );
      const duration = tweenDuration(moves.values(), motionDurations());
      if (duration === 0) {
        place(1);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const progress = (now - start) / duration;
        place(progress);
        if (progress < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    },
    [setNodes],
  );
}
