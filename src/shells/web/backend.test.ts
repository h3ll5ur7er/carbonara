import { describe, expect, it } from "vitest";
import { managers, type Events } from "../../contracts/managers";
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

describe("the web backend", () => {
  it("answers workspace.ping through the RPC envelope", async () => {
    const [client, server] = channel();
    startBackend(server);
    const backend = connect<typeof managers, Events>(managers, client);
    await expect(backend.workspace.ping({})).resolves.toBe("pong");
  });

  it("reports methods no manager implements yet", async () => {
    const [client, server] = channel();
    startBackend(server);
    const backend = connect<typeof managers, Events>(managers, client);
    await expect(backend.packs.removePack({ packId: "x" })).rejects.toThrow("Unknown method packs.removePack");
  });
});
