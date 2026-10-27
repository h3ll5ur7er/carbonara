// What node and edge components read besides their own props: their result slot and the display unit.
import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { LocalId } from "../../../contracts/document";
import type { MachineGroups, RateDisplay } from "../model/format";
import type { LodTier } from "../model/lod";
import type { EdgeSlot, NodeSlot, ResultSlots } from "../model/result-slots";

export interface CanvasContextValue {
  results: ResultSlots;
  rateUnit: RateDisplay;
  machineGroups: MachineGroups;
  /** How much of each node to draw at the current zoom. */
  lod: LodTier;
}

export const CanvasContext = createContext<CanvasContextValue | null>(null);

function useCanvasContext(): CanvasContextValue {
  const value = useContext(CanvasContext);
  if (!value) throw new Error("Canvas nodes need a CanvasContext");
  return value;
}

/** How rates are shown: the unit, and the belt for the items it carries. */
export function useRateUnit(): RateDisplay {
  return useCanvasContext().rateUnit;
}

export function useMachineGroups(): MachineGroups {
  return useCanvasContext().machineGroups;
}

export function useLod(): LodTier {
  return useCanvasContext().lod;
}

/** The node's own result; re-renders only when that slot changes. */
export function useNodeSlot(id: LocalId): NodeSlot | undefined {
  const { results } = useCanvasContext();
  const subscribe = useCallback((listener: () => void) => results.subscribeNode(id, listener), [results, id]);
  return useSyncExternalStore(subscribe, () => results.node(id));
}

/** The edge's own result; re-renders only when that slot changes. */
export function useEdgeSlot(id: LocalId): EdgeSlot | undefined {
  const { results } = useCanvasContext();
  const subscribe = useCallback((listener: () => void) => results.subscribeEdge(id, listener), [results, id]);
  return useSyncExternalStore(subscribe, () => results.edge(id));
}
