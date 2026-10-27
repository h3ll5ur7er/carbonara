import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { MethodContract } from "../contracts/managers";
import type { BackendMessage, Request } from "../contracts/rpc";
import { connect, createDispatcher, type Transport } from "./rpc";

const contracts = {
  maths: {
    double: { args: z.object({ n: z.number() }) } as MethodContract<z.ZodObject<{ n: z.ZodNumber }>, number>,
    explode: { args: z.object({}) } as MethodContract<z.ZodObject, never>,
  },
};

const implementations = {
  maths: {
    double: async ({ n }: { n: number }) => n * 2,
    explode: async () => {
      throw new Error("boom");
    },
  },
};

/** Two ends of a message channel, like the UI thread and the backend worker. */
function pair(): { client: Transport; server: Transport } {
  const { port1, port2 } = new MessageChannel();
  const transport = (port: MessagePort): Transport => ({
    send: (message) => port.postMessage(message),
    listen: (listener) => {
      port.onmessage = (event) => listener(event.data);
    },
  });
  return { client: transport(port1), server: transport(port2) };
}

function serve(server: Transport) {
  const dispatch = createDispatcher(contracts, implementations);
  server.listen(async (message) => server.send(await dispatch(message as Request)));
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("createDispatcher", () => {
  const dispatch = createDispatcher(contracts, implementations);

  it("calls the method with validated arguments", async () => {
    expect(await dispatch({ id: 1, manager: "maths", method: "double", args: { n: 21 } })).toEqual({
      id: 1,
      ok: true,
      value: 42,
    });
  });

  it("rejects invalid arguments with their issues", async () => {
    expect(await dispatch({ id: 2, manager: "maths", method: "double", args: { n: "x" } })).toMatchObject({
      id: 2,
      ok: false,
      error: { message: "Invalid arguments for maths.double", issues: [{ path: ["n"] }] },
    });
  });

  it.each([
    ["an unknown manager", "physics", "double"],
    ["an unknown method", "maths", "triple"],
    ["an inherited property", "maths", "toString"],
  ])("rejects %s", async (_name, manager, method) => {
    expect(await dispatch({ id: 3, manager, method, args: {} })).toEqual({
      id: 3,
      ok: false,
      error: { message: `Unknown method ${manager}.${method}` },
    });
  });

  it("turns exceptions into errors instead of crashing the backend", async () => {
    expect(await dispatch({ id: 4, manager: "maths", method: "explode", args: {} })).toEqual({
      id: 4,
      ok: false,
      error: { message: "boom" },
    });
  });
});

describe("connect", () => {
  it("calls the backend through the envelope", async () => {
    const { client, server } = pair();
    serve(server);
    const backend = connect(contracts, client);
    await expect(backend.maths.double({ n: 2 })).resolves.toBe(4);
    await expect(Promise.all([backend.maths.double({ n: 1 }), backend.maths.double({ n: 5 })])).resolves.toEqual([
      2, 10,
    ]);
  });

  it("rejects with the backend's error", async () => {
    const { client, server } = pair();
    serve(server);
    await expect(connect(contracts, client).maths.explode({})).rejects.toThrow("boom");
  });

  it("delivers events to subscribers until they unsubscribe", async () => {
    const { client, server } = pair();
    const backend = connect(contracts, client);
    const seen: unknown[] = [];
    const unsubscribe = backend.on("tick", (payload) => seen.push(payload));
    server.send({ event: "tick", payload: 1 } satisfies BackendMessage);
    await tick();
    unsubscribe();
    server.send({ event: "tick", payload: 2 } satisfies BackendMessage);
    await tick();
    expect(seen).toEqual([1]);
  });
});
