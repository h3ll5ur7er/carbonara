import { afterEach, describe, expect, it } from "vitest";
import { proxyInvoke, serveInvoke, type Invoke } from "./invoke";

const ports: MessagePort[] = [];
afterEach(() => ports.splice(0).forEach((port) => port.close()));

/** A worker's proxy to the commands `invoke` answers on the main thread, of which it may call `allowed`. */
function proxy(invoke: Invoke, allowed: string[]): Invoke {
  const { port1, port2 } = new MessageChannel();
  ports.push(port1, port2);
  serveInvoke(port1, invoke, allowed);
  return proxyInvoke(port2);
}

describe("calling Tauri commands from a worker", () => {
  it("answers with what the command returns", async () => {
    const invoke = proxy(async (command, args) => ({ command, args }), ["storage_get"]);
    await expect(invoke("storage_get", { key: "doc" })).resolves.toEqual({
      command: "storage_get",
      args: { key: "doc" },
    });
  });

  it("answers concurrent calls each with their own result", async () => {
    const invoke = proxy(async (_command, args) => args?.["n"], ["echo"]);
    await expect(Promise.all([1, 2, 3].map((n) => invoke("echo", { n })))).resolves.toEqual([1, 2, 3]);
  });

  it("rejects with the command's error, which Tauri gives as a string", async () => {
    const invoke = proxy(() => Promise.reject("Not a storage name"), ["storage_keys"]);
    await expect(invoke("storage_keys")).rejects.toThrow("Not a storage name");
  });

  it("refuses commands the worker may not call", async () => {
    let called = false;
    const invoke = proxy(async () => (called = true), ["storage_get"]);
    await expect(invoke("save_file")).rejects.toThrow("save_file");
    expect(called).toBe(false);
  });
});
