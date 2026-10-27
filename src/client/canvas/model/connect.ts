// Hides which ports may be connected and which item the resulting edge carries.
import type { Id } from "../../../contracts/pack";

export interface PortPair {
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

/** The item an edge between these ports carries, or undefined when they may not be connected. */
export function connectionItem({ source, target, sourceHandle, targetHandle }: PortPair): Id | undefined {
  if (source === target || !sourceHandle || !targetHandle) return undefined;
  const from = parse(sourceHandle);
  const to = parse(targetHandle);
  if (from.direction !== "out" || to.direction !== "in") return undefined;
  if (from.item && to.item) return from.item === to.item ? from.item : undefined;
  return from.item ?? to.item;
}

/** `out:plate` → an item port; a bare `out` is a junction's port, which carries any item. */
function parse(handle: string): { direction: string; item: Id | undefined } {
  const separator = handle.indexOf(":");
  if (separator < 0) return { direction: handle, item: undefined };
  return { direction: handle.slice(0, separator), item: handle.slice(separator + 1) };
}
