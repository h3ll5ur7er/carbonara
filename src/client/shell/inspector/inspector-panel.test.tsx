// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldDescriptor } from "../../../contracts/plugin";
import { ConnectorProvider, type Connector } from "../../core/connector";
import { useToasts } from "../toasts";
import { InspectorPanel, type InspectorPanelProps } from "./inspector-panel";

const fields: Record<string, FieldDescriptor> = {
  clock: { kind: "number", label: "Clock", min: 1, max: 250, step: 0.0001, unit: "%", default: 100 },
  sloop: { kind: "toggle", label: "Somersloop", default: false },
};

const selection: InspectorPanelProps["selection"] = {
  target: { documentId: "doc-1", nodeId: "smelter" },
  node: { title: "Iron Plate", subtitle: "Furnace", fields, values: { clock: 100 } },
};

const info = { id: "doc-1", name: "Factory", packId: "template", version: 2 };

/** A connector whose only working method is `editing.apply`; the inspector needs nothing else. */
function mockConnector(apply: Connector["editing"]["apply"]): Connector {
  return { editing: { apply } } as unknown as Connector;
}

function renderPanel(apply: Connector["editing"]["apply"], props: InspectorPanelProps = { selection }) {
  return render(
    <ConnectorProvider connector={mockConnector(apply)}>
      <InspectorPanel {...props} />
    </ConnectorProvider>,
  );
}

describe("InspectorPanel", () => {
  beforeEach(() => {
    useToasts.setState({ toasts: [] });
    // Radix measures its slider; jsdom has no layout.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });
  afterEach(cleanup);

  it("shows the node and a control per plugin field", () => {
    renderPanel(vi.fn());
    expect(screen.getByRole("heading", { name: "Iron Plate" })).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "Clock" })).toHaveProperty("value", "100");
    expect(screen.getByRole("slider", { name: "Clock" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Somersloop" }).getAttribute("aria-checked")).toBe("false");
  });

  it("sends a switch flip to the editing manager as one command", async () => {
    const apply = vi.fn<Connector["editing"]["apply"]>().mockResolvedValue({ ok: true, value: info });
    renderPanel(apply);
    await userEvent.click(screen.getByRole("switch", { name: "Somersloop" }));
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      documentId: "doc-1",
      commands: [{ type: "setNodeFields", graph: "root", id: "smelter", fields: { sloop: true } }],
      label: "Turn on Somersloop",
    });
  });

  it("sends a typed number once it is committed, clamped into the field's range", async () => {
    const apply = vi.fn<Connector["editing"]["apply"]>().mockResolvedValue({ ok: true, value: info });
    renderPanel(apply);
    await userEvent.type(screen.getByRole("spinbutton", { name: "Clock" }), "300{Enter}");
    expect(apply).toHaveBeenCalledOnce();
    expect(apply.mock.calls[0]?.[0]).toMatchObject({
      commands: [{ fields: { clock: 250 } }],
      label: "Set Clock to 250 %",
    });
  });

  it("nudges a number with the arrow keys", async () => {
    const apply = vi.fn<Connector["editing"]["apply"]>().mockResolvedValue({ ok: true, value: info });
    renderPanel(apply);
    screen.getByRole("spinbutton", { name: "Clock" }).focus();
    await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}");
    expect(apply.mock.calls[0]?.[0]).toMatchObject({ commands: [{ fields: { clock: 110 } }] });
  });

  it("shows an error toast when the manager refuses the edit", async () => {
    const apply = vi
      .fn<Connector["editing"]["apply"]>()
      .mockResolvedValue({ ok: false, error: [{ path: ["sloop"], message: "No somersloops left." }] });
    renderPanel(apply);
    await userEvent.click(screen.getByRole("switch", { name: "Somersloop" }));
    await waitFor(() =>
      expect(useToasts.getState().toasts).toMatchObject([
        { tone: "error", title: "Couldn't apply the edit", description: "No somersloops left." },
      ]),
    );
  });

  it("shows an error toast when the call itself fails", async () => {
    renderPanel(vi.fn<Connector["editing"]["apply"]>().mockRejectedValue(new Error("Unknown method editing.apply")));
    await userEvent.click(screen.getByRole("switch", { name: "Somersloop" }));
    await waitFor(() => expect(useToasts.getState().toasts[0]?.description).toBe("Unknown method editing.apply"));
  });

  it("shows what the pack's plugin derived and what it warns about", () => {
    renderPanel(vi.fn(), {
      selection: {
        ...selection,
        node: {
          ...selection.node,
          metrics: [{ label: "Power use", value: "13.43 MW" }],
          problems: [{ kind: "warning", message: "Clock 150 % needs a power shard" }],
        },
      },
    });
    const metrics = screen.getByRole("region", { name: "Metrics" });
    expect(metrics.textContent).toContain("Power use");
    expect(metrics.textContent).toContain("13.43 MW");
    expect(screen.getByRole("list", { name: "Problems" }).textContent).toContain("Clock 150 % needs a power shard");
  });

  it("edits several machines at once, marking the values they don't share", async () => {
    const apply = vi.fn<Connector["editing"]["apply"]>().mockResolvedValue({ ok: true, value: info });
    renderPanel(apply, {
      selection: {
        target: { documentId: "doc-1", nodeId: "a", nodeIds: ["a", "b"] },
        node: { title: "2 machines", subtitle: "2 × Furnace", fields, values: { clock: 100 }, mixed: ["sloop"] },
      },
    });
    expect(screen.getByText("Mixed")).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Somersloop/ }).getAttribute("aria-checked")).toBe("false");
    await userEvent.click(screen.getByRole("switch", { name: /Somersloop/ }));
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      documentId: "doc-1",
      commands: ["a", "b"].map((id) => ({ type: "setNodeFields", graph: "root", id, fields: { sloop: true } })),
      label: "Turn on Somersloop on 2 machines",
    });
  });

  it("says so when the selected nodes share no settings", () => {
    renderPanel(vi.fn(), {
      selection: {
        target: { documentId: "doc-1", nodeId: "a", nodeIds: ["a", "b"] },
        node: { title: "2 nodes", fields: {}, values: {}, mixed: [] },
      },
    });
    expect(screen.getByText("They share no settings.")).toBeTruthy();
  });

  describe("a subgraph instance", () => {
    const instanceSelection = (subgraph = { open: vi.fn(), selectSiblings: vi.fn() }) => ({
      target: { documentId: "doc-1", graph: "outer", nodeId: "cell1" },
      subgraph,
      node: {
        title: "Copper cell",
        subtitle: "Subgraph · placed 2 times",
        fields: {},
        values: {},
        instance: {
          blueprint: "cell",
          name: "Copper cell",
          rateUnit: "per_minute" as const,
          scale: 2.5,
          solved: true,
          siblings: ["cell1", "cell2"],
          ports: [
            {
              port: "in-ore",
              direction: "in" as const,
              item: { id: "ore", name: "Cuprite Ore", form: "solid" as const },
              perSecond: 4,
            },
            {
              port: "out-plate",
              direction: "out" as const,
              item: { id: "plate", name: "Copper Plate", form: "solid" as const },
              perSecond: 2,
            },
          ],
        },
      },
    });

    it("shows its scale and its ports' rates instead of settings", () => {
      renderPanel(vi.fn(), { selection: instanceSelection() });
      expect(screen.queryByRole("region", { name: "Settings" })).toBeNull();
      expect(screen.getByRole("region", { name: "Blueprint" }).textContent).toContain("2.5× as designed");
      const ports = screen.getByRole("region", { name: "Ports" }).textContent;
      expect(ports).toContain("Cuprite Ore");
      expect(ports).toContain("240/min");
      expect(ports).toContain("Copper Plate");
      expect(ports).toContain("120/min");
    });

    it("renames its blueprint, one edit when the name is committed", async () => {
      const apply = vi.fn<Connector["editing"]["apply"]>().mockResolvedValue({ ok: true, value: info });
      renderPanel(apply, { selection: instanceSelection() });
      const name = screen.getByRole("textbox", { name: "Name" });
      await userEvent.clear(name);
      await userEvent.type(name, "Copper plant{Enter}");
      expect(apply).toHaveBeenCalledExactlyOnceWith({
        documentId: "doc-1",
        commands: [{ type: "renameBlueprint", blueprint: "cell", name: "Copper plant" }],
        label: "Rename blueprint to Copper plant",
      });
    });

    it("keeps the name when the edit is escaped", async () => {
      const apply = vi.fn<Connector["editing"]["apply"]>();
      renderPanel(apply, { selection: instanceSelection() });
      const name = screen.getByRole("textbox", { name: "Name" });
      await userEvent.type(name, " plant{Escape}");
      expect(name).toHaveProperty("value", "Copper cell");
      name.blur();
      expect(apply).not.toHaveBeenCalled();
    });

    it("opens it, expands it in the graph it's in, and selects all its copies", async () => {
      const apply = vi.fn<Connector["editing"]["apply"]>().mockResolvedValue({ ok: true, value: info });
      const subgraph = { open: vi.fn(), selectSiblings: vi.fn() };
      renderPanel(apply, { selection: instanceSelection(subgraph) });
      await userEvent.click(screen.getByRole("button", { name: "Open" }));
      expect(subgraph.open).toHaveBeenCalledOnce();
      await userEvent.click(screen.getByRole("button", { name: "Select all 2" }));
      expect(subgraph.selectSiblings).toHaveBeenCalledOnce();
      await userEvent.click(screen.getByRole("button", { name: "Expand" }));
      expect(apply).toHaveBeenCalledExactlyOnceWith({
        documentId: "doc-1",
        commands: [{ type: "expand", graph: "outer", id: "cell1" }],
        label: "Expand subgraph",
      });
    });
  });

  it("invites a selection when nothing is selected", () => {
    renderPanel(vi.fn(), { selection: null });
    expect(screen.getByText("Nothing selected")).toBeTruthy();
  });
});
