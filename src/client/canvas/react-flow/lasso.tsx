// Lasso selection: Alt-drag on empty canvas draws a freehand shape, and the nodes whose centre it encloses
// are selected (Shift adds them to the selection). Box selection is React Flow's own, on a plain drag.
import { useCallback, useState, type PointerEvent, type ReactNode } from "react";
import type { Point } from "../adapter";

/** Points closer than this, in pixels, add nothing to the shape. */
const MIN_STEP = 4;

export interface LassoProps {
  /** The shape in client coordinates, and whether to add to the selection. */
  onLasso(polygon: Point[], additive: boolean): void;
  children: ReactNode;
}

interface Drawing {
  /** The area's top-left corner in client coordinates. */
  origin: Point;
  points: Point[];
  additive: boolean;
}

export function LassoArea({ onLasso, children }: LassoProps) {
  const [drawing, setDrawing] = useState<Drawing | null>(null);

  const onPointerDownCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const onPane = event.target instanceof Element && event.target.classList.contains("react-flow__pane");
    if (!event.altKey || event.button !== 0 || !onPane) return;
    // Keep React Flow from starting a box selection or a pan.
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const box = event.currentTarget.getBoundingClientRect();
    setDrawing({
      origin: { x: box.left, y: box.top },
      points: [{ x: event.clientX, y: event.clientY }],
      additive: event.shiftKey,
    });
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const point = { x: event.clientX, y: event.clientY };
    setDrawing((current) => {
      const last = current?.points.at(-1);
      if (!current || (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_STEP)) return current;
      return { ...current, points: [...current.points, point] };
    });
  }, []);

  const onPointerUp = useCallback(() => {
    if (!drawing) return;
    setDrawing(null);
    onLasso(drawing.points, drawing.additive);
  }, [drawing, onLasso]);

  return (
    <div
      className="relative size-full"
      onPointerDownCapture={onPointerDownCapture}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {children}
      {drawing && (
        <svg className="pointer-events-none absolute inset-0 z-10 size-full" aria-hidden>
          <polygon
            points={drawing.points
              .map((point) => `${point.x - drawing.origin.x},${point.y - drawing.origin.y}`)
              .join(" ")}
            className="lasso"
          />
        </svg>
      )}
    </div>
  );
}
