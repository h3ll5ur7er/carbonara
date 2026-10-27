import { IDBFactory } from "fake-indexeddb";
import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { createReadModel } from "../../client/core/read-model";
import type { CommandInput } from "../../contracts/commands";
import { exampleDocument } from "../../contracts/document.fixture";
import { managers, type Events } from "../../contracts/managers";
import { createIndexedDbStorage } from "../../platforms/web/indexeddb";
import { connect, type Transport } from "../../utilities/rpc";
import { startBackend } from "./backend";

function channel(): [Transport, Transport] {
  const { port1, port2 } = new MessageChannel();
  const transport = (port: MessagePort): Transport => ({
    send: (message) => port.postMessage(message),
    listen: (listener) => {
      port.onmessage = (event) => listener(event.data);
    },
  });
  return [transport(port1), transport(port2)];
}

function start() {
  const [client, server] = channel();
  startBackend(server);
  return connect<typeof managers, Events>(managers, client);
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("the web backend", () => {
  it("answers workspace.ping through the RPC envelope", async () => {
    await expect(start().workspace.ping({})).resolves.toBe("pong");
  });

  it("reports methods no manager implements", async () => {
    const [client, server] = channel();
    startBackend(server);
    const answer = new Promise((resolve) => client.listen(resolve));
    client.send({ id: 1, manager: "nobody", method: "anything", args: {} });
    expect(await answer).toEqual({ id: 1, ok: false, error: { message: "Unknown method nobody.anything" } });
  });

  it("reopens the documents autosaved in the last session", async () => {
    await createIndexedDbStorage("carbonara-documents").set("doc-1", exampleDocument);
    const { document } = await start().editing.getDocument({ documentId: "doc-1" });
    expect(document.name).toBe("Iron");
  });

  it("keeps a client's read model in sync with edits, undo and redo", async () => {
    const position = fc.record({ x: fc.integer(), y: fc.integer() });
    const command: fc.Arbitrary<CommandInput> = fc.oneof(
      position.map((at) => ({ type: "addNode" as const, node: { kind: "junction" as const }, position: at })),
      position.map((at) => ({ type: "moveNodes" as const, positions: { ore: at } })),
      fc.constant<CommandInput>({ type: "removeNodes", ids: ["smelt"] }),
      fc.nat(250).map((clock) => ({ type: "setNodeFields" as const, id: "smelt", fields: { clock } })),
    );
    const step = fc.oneof(
      fc.constant({ kind: "undo" as const }),
      fc.constant({ kind: "redo" as const }),
      command.map((edit) => ({ kind: "apply" as const, command: edit })),
    );
    await fc.assert(
      fc.asyncProperty(fc.array(step, { maxLength: 12 }), async (steps) => {
        globalThis.indexedDB = new IDBFactory();
        await createIndexedDbStorage("carbonara-documents").set("doc-1", exampleDocument);
        const backend = start();
        const model = createReadModel(backend);
        await model.open("doc-1");
        for (const action of steps) {
          if (action.kind === "undo") await backend.editing.undo({ documentId: "doc-1" });
          else if (action.kind === "redo") await backend.editing.redo({ documentId: "doc-1" });
          else await backend.editing.apply({ documentId: "doc-1", commands: [action.command] });
        }
        // The last event travels the same channel as the last answer, and arrives before it.
        expect(model.store.getState().documents["doc-1"]).toEqual(
          await backend.editing.getDocument({ documentId: "doc-1" }),
        );
      }),
      { numRuns: 30 },
    );
  });
});
