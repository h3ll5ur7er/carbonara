import { describe, expect, it } from "vitest";
import { exampleDocument } from "../../contracts/document.fixture";
import { managers, type Events } from "../../contracts/managers";
import { fakeStorageCommands } from "../../platforms/tauri/fake-storage-commands";
import type { Invoke } from "../../platforms/tauri/invoke";
import { connect, type Transport } from "../../utilities/rpc";
import { startDesktopBackend } from "./backend";

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

function start(invoke: Invoke) {
  const [client, server] = channel();
  startDesktopBackend(server, invoke);
  return connect<typeof managers, Events>(managers, client);
}

describe("the desktop backend", () => {
  it("answers workspace.ping through the RPC envelope", async () => {
    await expect(start(fakeStorageCommands()).workspace.ping({})).resolves.toBe("pong");
  });

  it("reopens the documents autosaved in the app data folder in the last session", async () => {
    const invoke = fakeStorageCommands();
    await invoke("storage_set", {
      storage: "carbonara-documents",
      key: "doc-1",
      value: JSON.stringify(exampleDocument),
    });
    const { document } = await start(invoke).editing.getDocument({ documentId: "doc-1" });
    expect(document.name).toBe("Iron");
  });

  it("autosaves new documents there for the next session", async () => {
    const invoke = fakeStorageCommands();
    const backend = start(invoke);
    const [pack] = await backend.packs.listPacks({});
    if (!pack) throw new Error("The template pack is built in for tests");
    const created = await backend.workspace.createDocument({ name: "Copper", packId: pack.manifest.id });
    await expect.poll(() => invoke("storage_keys", { storage: "carbonara-documents" })).toEqual([created.id]);
  });
});
