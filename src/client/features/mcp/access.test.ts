import { describe, expect, it } from "vitest";
import { ACTIVITY_LIMIT, createMcpAccess } from "./access";

describe("MCP access", () => {
  it("allows reading only, until the person switches more groups on", () => {
    const access = createMcpAccess();
    expect(access.store.getState().allowed).toEqual({ read: true, plan: false, edit: false, authoring: false });
    access.allow("edit", true);
    expect(access.allowed("edit")).toBe(true);
    access.allow("read", false);
    expect(access.allowed("read")).toBe(false);
  });

  it("logs each call, newest first, with how it ended and how long it took", () => {
    let clock = 1_000;
    const access = createMcpAccess(() => clock);
    const first = access.begin({ tool: "list_documents", group: "read" });
    clock = 1_040;
    access.end(first, "done");
    const second = access.begin({ tool: "edit_graph", group: "edit", document: "doc-1" });
    access.end(second, "refused", "The edit tools are switched off.");
    expect(access.store.getState().activity).toEqual([
      {
        id: second,
        tool: "edit_graph",
        group: "edit",
        document: "doc-1",
        at: 1_040,
        status: "refused",
        message: "The edit tools are switched off.",
        durationMs: 0,
      },
      { id: first, tool: "list_documents", group: "read", at: 1_000, status: "done", durationMs: 40 },
    ]);
  });

  it("keeps the latest calls only", () => {
    const access = createMcpAccess();
    for (let index = 0; index < ACTIVITY_LIMIT + 5; index++) access.begin({ tool: "list_packs", group: "read" });
    const { activity } = access.store.getState();
    expect(activity).toHaveLength(ACTIVITY_LIMIT);
    expect(activity[0]?.id).toBe(ACTIVITY_LIMIT + 5);
  });
});
