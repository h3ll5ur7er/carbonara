import { describe, expect, it, vi } from "vitest";
import { mcpTransport } from "./mcp";

describe("the MCP bridge's way to the Rust shell", () => {
  it("hands tool calls from `mcp-call` events to the bridge, and answers through `mcp_answer`", () => {
    const invoke = vi.fn(async () => null);
    let emit: (payload: unknown) => void = () => {};
    const listen = vi.fn((event: string, handler: (event: { payload: unknown }) => void) => {
      expect(event).toBe("mcp-call");
      emit = (payload) => handler({ payload });
      return Promise.resolve(() => {});
    });
    const transport = mcpTransport(invoke, listen);

    const calls: unknown[] = [];
    transport.listen((call) => calls.push(call));
    emit({ id: 1, tool: "undo" });
    expect(calls).toEqual([{ id: 1, tool: "undo" }]);

    transport.send({ id: 1, ok: true, value: null });
    expect(invoke).toHaveBeenCalledWith("mcp_answer", { answer: { id: 1, ok: true, value: null } });
  });
});
