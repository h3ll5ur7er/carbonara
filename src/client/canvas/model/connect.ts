// Hides which ports may be connected and which item the resulting edge carries.
import type { LocalId } from "../../../contracts/document";
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

/** The blueprint port an instance's handle stands for (`in:plate#in-plate` → `in-plate`); other handles have none. */
export function portOf(handle: string | null | undefined): LocalId | undefined {
  return handle ? parse(handle).port : undefined;
}

/**
 * `out:plate` → an item port; a bare `out` is a junction's port, which carries any item. An instance's port adds
 * the blueprint's port node after `#` (`in:plate#in-plate`), which item ids never contain.
 */
function parse(handle: string): { direction: string; item: Id | undefined; port: LocalId | undefined } {
  const separator = handle.indexOf(":");
  if (separator < 0) return { direction: handle, item: undefined, port: undefined };
  const rest = handle.slice(separator + 1);
  const hash = rest.indexOf("#");
  return {
    direction: handle.slice(0, separator),
    item: hash < 0 ? rest : rest.slice(0, hash),
    port: hash < 0 ? undefined : rest.slice(hash + 1),
  };
}
