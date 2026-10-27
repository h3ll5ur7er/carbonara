// Hides how solver results reach the canvas without going through React state: one slot per node and
// per edge, each with its own subscribers. A new solve notifies only the slots whose values changed,
// so a re-solve re-renders the few nodes it touched instead of the whole graph.
import type { LocalId } from "../../../contracts/document";
import type { Id } from "../../../contracts/pack";
import type { AnalysisResults, NodeResult } from "../../../contracts/results";

export interface NodeSlot {
  result: NodeResult;
  /** Items the node is short of, in items per second. */
  deficits: Record<Id, number>;
}

export interface EdgeSlot {
  perSecond: number;
  capacity?: number;
  /** The solver had to exceed the edge's capacity. */
  overflow: boolean;
}

export interface ResultSlots {
  update(results: AnalysisResults | null): void;
  node(id: LocalId): NodeSlot | undefined;
  edge(id: LocalId): EdgeSlot | undefined;
  subscribeNode(id: LocalId, listener: () => void): () => void;
  subscribeEdge(id: LocalId, listener: () => void): () => void;
}

type Slot = NodeSlot | EdgeSlot;

export function createResultSlots(): ResultSlots {
  let slots = new Map<string, Slot>();
  const listeners = new Map<string, Set<() => void>>();

  function subscribe(key: string, listener: () => void) {
    const set = listeners.get(key) ?? new Set();
    set.add(listener);
    listeners.set(key, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) listeners.delete(key);
    };
  }

  return {
    update(results) {
      const fresh = results ? slotsOf(results) : new Map<string, Slot>();
      const changed: string[] = [];
      const next = new Map<string, Slot>();
      for (const [key, slot] of fresh) {
        const previous = slots.get(key);
        if (previous && same(previous, slot)) next.set(key, previous);
        else {
          next.set(key, slot);
          changed.push(key);
        }
      }
      for (const key of slots.keys()) if (!fresh.has(key)) changed.push(key);
      slots = next;
      for (const key of changed) for (const listener of listeners.get(key) ?? []) listener();
    },
    node: (id) => slots.get(`node:${id}`) as NodeSlot | undefined,
    edge: (id) => slots.get(`edge:${id}`) as EdgeSlot | undefined,
    subscribeNode: (id, listener) => subscribe(`node:${id}`, listener),
    subscribeEdge: (id, listener) => subscribe(`edge:${id}`, listener),
  };
}

function slotsOf(results: AnalysisResults): Map<string, Slot> {
  const deficits = new Map<LocalId, Record<Id, number>>();
  const overflows = new Set<LocalId>();
  for (const diagnostic of results.diagnostics) {
    if (diagnostic.kind === "deficit") {
      const items = deficits.get(diagnostic.node) ?? {};
      items[diagnostic.item] = (items[diagnostic.item] ?? 0) + diagnostic.perSecond;
      deficits.set(diagnostic.node, items);
    } else if (diagnostic.kind === "overflow") overflows.add(diagnostic.edge);
  }

  const slots = new Map<string, Slot>();
  for (const [id, result] of Object.entries(results.nodes)) {
    slots.set(`node:${id}`, { result, deficits: deficits.get(id) ?? {} });
  }
  for (const [id, edge] of Object.entries(results.edges)) {
    slots.set(`edge:${id}`, {
      perSecond: edge.perSecond,
      ...(edge.capacity !== undefined && { capacity: edge.capacity }),
      overflow: overflows.has(id),
    });
  }
  return slots;
}

/** Slots are small plain objects; comparing their JSON is cheap and exact enough. */
function same(a: Slot, b: Slot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
