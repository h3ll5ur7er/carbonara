// Hides when a node is ready for the keyboard focus. An edit made outside the canvas (quick-add, the recipe
// picker, leaving a subgraph) draws its node a few frames later, after the dialog that made it has closed and
// handed the focus back to the page; this puts the focus on the node once it's there, so the keyboard carries on
// from what was just made instead of from the top of the page.

/** About two seconds at 60 fps: an edit's node is drawn well within that, or something went wrong. */
const MAX_FRAMES = 120;
/** Frames the focus has to stay on the node: a closing dialog hands the focus back a moment after it closes. */
const SETTLE_FRAMES = 2;

/** Focuses the node once it's drawn (or, without an id, the first node drawn), unless the person moved on. */
export function focusNodeWhenShown(id?: string): void {
  const selector = id === undefined ? ".react-flow__node" : `.react-flow__node[data-id="${CSS.escape(id)}"]`;
  const start = document.activeElement;
  let focused: Element | undefined;
  let kept = 0;
  let frames = 0;

  const step = () => {
    const active = document.activeElement;
    if (focused && active === focused) {
      if (++kept >= SETTLE_FRAMES) return;
    } else {
      // Anywhere but where it started, on the body or on the node: the person moved on.
      const dropped = active === null || active === document.body;
      if (!dropped && active !== start) return;
      const node = document.querySelector<HTMLElement>(selector);
      node?.focus();
      focused = node ?? undefined;
      kept = 0;
    }
    if (++frames < MAX_FRAMES) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
