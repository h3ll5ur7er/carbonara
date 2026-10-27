// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpAccess } from "./access";
import { McpAccessDialog } from "./access-dialog";
import { setMcpDialogOpen, useMcpHost } from "./host-store";

const connection = { url: "http://127.0.0.1:41736/mcp", token: "f00d", command: "/opt/carbonara/carbonara" };

describe("the AI access and activity dialog", () => {
  beforeEach(() => {
    useMcpHost.setState({ attached: true, connection, dialogOpen: false });
    setMcpDialogOpen(true);
  });
  afterEach(cleanup);

  it("switches permission groups on and off, reading only by default", async () => {
    const access = createMcpAccess();
    render(<McpAccessDialog access={access} />);
    const read = screen.getByRole("switch", { name: "Read" });
    const edit = screen.getByRole("switch", { name: "Edit" });
    expect(read.getAttribute("aria-checked")).toBe("true");
    expect(edit.getAttribute("aria-checked")).toBe("false");
    await userEvent.click(edit);
    expect(access.allowed("edit")).toBe(true);
    expect(edit.getAttribute("aria-checked")).toBe("true");
  });

  it("lists every call, newest first, with refusals and their reasons", () => {
    const access = createMcpAccess();
    render(<McpAccessDialog access={access} />);
    expect(screen.getByText("No calls yet.")).toBeTruthy();
    act(() => {
      access.end(access.begin({ tool: "list_documents", group: "read" }), "done");
      access.end(
        access.begin({ tool: "edit_graph", group: "edit", document: "doc-1" }),
        "refused",
        "Edit tools are off.",
      );
    });
    const calls = within(screen.getByRole("list", { name: "Calls" })).getAllByRole("listitem");
    expect(calls.map((call) => call.textContent)).toEqual([
      expect.stringMatching(/edit_graph.*doc-1.*Refused.*Edit tools are off\./),
      expect.stringMatching(/list_documents.*Done/),
    ]);
  });

  it("offers copy-config snippets for the running server", () => {
    render(<McpAccessDialog access={createMcpAccess()} />);
    expect(screen.getByText(/claude mcp add --transport http carbonara http:\/\/127\.0\.0\.1:41736\/mcp/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Copy/ })).toHaveLength(3);
  });

  it("explains that MCP clients connect to the desktop app when there is no server", () => {
    useMcpHost.setState({ attached: false, connection: null });
    render(<McpAccessDialog access={createMcpAccess()} />);
    expect(screen.getByText(/connect to the Carbonara desktop app/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Copy/ })).toBeNull();
  });
});
