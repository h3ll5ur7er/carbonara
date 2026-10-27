import { describe, expect, it, vi } from "vitest";
import type { FieldDescriptor } from "../../../contracts/plugin";
import type { Connector } from "../../core/connector";
import { applyFieldEdit } from "./edit";

const clock: FieldDescriptor = { kind: "number", label: "Clock", min: 1, max: 250, unit: "%", default: 100 };
const info = { id: "doc-1", name: "Factory", packId: "template", version: 8 };

function mockEditing(result: Awaited<ReturnType<Connector["editing"]["apply"]>>) {
  return { apply: vi.fn<Connector["editing"]["apply"]>().mockResolvedValue(result) };
}

describe("applyFieldEdit", () => {
  it("sends one setNodeFields command to the editing manager, named for the undo history", async () => {
    const editing = mockEditing({ ok: true, value: info });
    await applyFieldEdit(
      editing,
      { documentId: "doc-1", nodeId: "smelter" },
      { key: "clock", descriptor: clock, value: 150 },
    );
    expect(editing.apply).toHaveBeenCalledWith({
      documentId: "doc-1",
      commands: [{ type: "setNodeFields", graph: "root", id: "smelter", fields: { clock: 150 } }],
      label: "Set Clock to 150 %",
    });
  });

  it("edits a node inside a subgraph", async () => {
    const editing = mockEditing({ ok: true, value: info });
    await applyFieldEdit(
      editing,
      { documentId: "doc-1", graph: "bp-1", nodeId: "smelter" },
      { key: "clock", descriptor: clock, value: 50 },
    );
    expect(editing.apply.mock.calls[0]?.[0].commands[0]).toMatchObject({ graph: "bp-1" });
  });

  it("returns the manager's answer, including an expected failure", async () => {
    const failure = { ok: false as const, error: [{ path: ["clock"], message: "Clock must be at most 250" }] };
    const editing = mockEditing(failure);
    const result = await applyFieldEdit(
      editing,
      { documentId: "doc-1", nodeId: "smelter" },
      { key: "clock", descriptor: clock, value: 300 },
    );
    expect(result).toEqual(failure);
  });
});
