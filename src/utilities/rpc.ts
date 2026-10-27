// The two ends of the RPC envelope: a dispatcher in front of the managers, and a typed client proxy.
// Generic over the contracts, so the UI, MCP and tests all use the same plumbing.
import type { ClientApi, Contracts, Implementation, MethodContract } from "../contracts/managers";
import type { BackendMessage, Request, Response } from "../contracts/rpc";

/** A message pipe: a worker, a MessagePort, or the Tauri bridge. */
export interface Transport {
  send(message: unknown): void;
  listen(listener: (message: unknown) => void): void;
}

/**
 * Validates each request against the contracts and calls the implementation. Never throws: unknown methods,
 * invalid arguments and exceptions become error responses. Missing implementations count as unknown methods,
 * so managers can be filled in one at a time.
 */
export function createDispatcher<C extends Contracts>(
  contracts: C,
  implementations: { [M in keyof C]?: Partial<Implementation<C>[M]> },
): (request: Request) => Promise<Response> {
  return async ({ id, manager, method, args }) => {
    const contract: MethodContract | undefined = lookup(lookup(contracts, manager), method);
    const handlers = implementations as Record<string, Record<string, (args: unknown) => Promise<unknown>> | undefined>;
    const implementation = lookup(lookup(handlers, manager), method);
    if (!contract || !implementation) {
      return { id, ok: false, error: { message: `Unknown method ${manager}.${method}` } };
    }
    const parsed = contract.args.safeParse(args);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.filter((key) => typeof key !== "symbol"),
        message: issue.message,
      }));
      return { id, ok: false, error: { message: `Invalid arguments for ${manager}.${method}`, issues } };
    }
    try {
      return { id, ok: true, value: await implementation(parsed.data) };
    } catch (error) {
      return { id, ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
    }
  };
}

export interface Subscribable<E> {
  /** Calls the listener for each event of that name; returns a function that stops it. */
  on<K extends keyof E & string>(event: K, listener: (payload: E[K]) => void): () => void;
}

/** A typed proxy that sends each call through the transport and resolves with the response. */
export function connect<C extends Contracts, E = Record<string, unknown>>(
  contracts: C,
  transport: Transport,
): ClientApi<C> & Subscribable<E> {
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const listeners = new Map<string, Set<(payload: never) => void>>();

  transport.listen((raw) => {
    const message = raw as BackendMessage;
    if ("event" in message) {
      for (const listener of listeners.get(message.event) ?? []) listener(message.payload as never);
      return;
    }
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    if (message.ok) call.resolve(message.value);
    else call.reject(Object.assign(new Error(message.error.message), { issues: message.error.issues }));
  });

  const api: Record<string, Record<string, (args: unknown) => Promise<unknown>>> = {};
  for (const manager of Object.keys(contracts)) {
    api[manager] = {};
    for (const method of Object.keys(contracts[manager] ?? {})) {
      api[manager][method] = (args) =>
        new Promise((resolve, reject) => {
          const id = nextId++;
          pending.set(id, { resolve, reject });
          transport.send({ id, manager, method, args } satisfies Request);
        });
    }
  }

  const on: Subscribable<E>["on"] = (event, listener) => {
    const set = listeners.get(event) ?? new Set();
    set.add(listener as (payload: never) => void);
    listeners.set(event, set);
    return () => set.delete(listener as (payload: never) => void);
  };

  return Object.assign(api as ClientApi<C>, { on });
}

/** `object[key]`, but only for the object's own keys, so `toString` and friends are never dispatched. */
function lookup<T>(object: Record<string, T> | undefined, key: string): T | undefined {
  return object && Object.hasOwn(object, key) ? object[key] : undefined;
}
