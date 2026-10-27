// A synchronous publish/subscribe bus. Managers publish events on it (they never call each other),
// other managers subscribe, and the composition root forwards every event to the clients.

export interface EventBus<E> {
  publish<K extends keyof E & string>(event: K, payload: E[K]): void;
  /** Returns a function that unsubscribes. */
  subscribe<K extends keyof E & string>(event: K, listener: (payload: E[K]) => void): () => void;
  subscribeAll(listener: (event: keyof E & string, payload: E[keyof E]) => void): () => void;
}

export function createEventBus<E>(): EventBus<E> {
  const listeners = new Map<string, Set<(payload: never) => void>>();
  const everything = new Set<(event: keyof E & string, payload: E[keyof E]) => void>();
  return {
    publish(event, payload) {
      for (const listener of listeners.get(event) ?? []) listener(payload as never);
      for (const listener of everything) listener(event, payload);
    },
    subscribe(event, listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener as (payload: never) => void);
      listeners.set(event, set);
      return () => set.delete(listener as (payload: never) => void);
    },
    subscribeAll(listener) {
      everything.add(listener);
      return () => everything.delete(listener);
    },
  };
}
