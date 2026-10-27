// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackData } from "../../../contracts/pack";
import type { PluginDescription } from "../../../contracts/plugin";
import { ConnectorProvider, type Connector } from "../../core/connector";
import { SaveProfile, type SaveProfileProps } from "./save-profile";

const recipe = (id: string, name: string) => ({
  id,
  name,
  buildings: ["press"],
  time: 1,
  out: { plate: 1 },
  tags: ["alternate"],
});

const pack = PackData.parse({
  items: [{ id: "plate", name: "Plate", form: "solid" }],
  buildings: [{ id: "press", name: "Press" }],
  recipes: [recipe("alt-stamped", "Alternate: Stamped Plate"), recipe("alt-bolted", "Alternate: Bolted Plate")],
});

const plugin: PluginDescription = {
  nodeFields: {},
  settingsFields: { limit: { kind: "toggle", label: "Limit somersloops", default: false } },
  metrics: {},
};

const info = { id: "doc", name: "Factory", packId: "p", version: 2 };

function renderProfile(props: Partial<SaveProfileProps> = {}) {
  const apply = vi.fn<Connector["editing"]["apply"]>().mockResolvedValue({ ok: true, value: info });
  render(
    <ConnectorProvider connector={{ editing: { apply } } as unknown as Connector}>
      <SaveProfile documentId="doc" pack={pack} settings={{}} plugin={plugin} {...props} />
    </ConnectorProvider>,
  );
  return apply;
}

describe("SaveProfile", () => {
  afterEach(cleanup);

  it("shows the plugin's settings and every alternate, all unlocked without a profile", () => {
    renderProfile();
    expect(screen.getByRole("heading", { name: "Save profile" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Limit somersloops" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("2 of 2 unlocked")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Bolted Plate" })).toHaveProperty("checked", true);
  });

  it("locks an alternate with one command", async () => {
    const apply = renderProfile();
    await userEvent.click(screen.getByRole("checkbox", { name: "Stamped Plate" }));
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      documentId: "doc",
      commands: [{ type: "setPluginSettings", settings: { unlocked: ["alt-bolted"] } }],
      label: "Lock Alternate: Stamped Plate",
    });
  });

  it("changes a plugin setting with one command", async () => {
    const apply = renderProfile({ settings: { unlocked: [] } });
    expect(screen.getByText("0 of 2 unlocked")).toBeTruthy();
    await userEvent.click(screen.getByRole("switch", { name: "Limit somersloops" }));
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      documentId: "doc",
      commands: [{ type: "setPluginSettings", settings: { limit: true } }],
      label: "Turn on Limit somersloops",
    });
  });

  it("filters the alternates by name", async () => {
    renderProfile();
    await userEvent.type(screen.getByRole("searchbox", { name: "Filter alternates" }), "bolt");
    expect(screen.queryByRole("checkbox", { name: "Stamped Plate" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Bolted Plate" })).toBeTruthy();
  });
});
