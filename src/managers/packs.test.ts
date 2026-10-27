import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { sha256 } from "../access/packs/archive";
import { createPackLibrary, type BuiltInPack } from "../access/packs/library";
import type { Events, PackInfo } from "../contracts/managers";
import { PackData, PackManifest } from "../contracts/pack";
import { definePlugin } from "../contracts/plugin";
import { createEventBus } from "../utilities/events";
import { createMemoryKeyValueStorage } from "../utilities/memory-key-value";
import { createPacksManager } from "./packs";

const text = (value: string) => new TextEncoder().encode(value);
const loadModule = (source: string) => import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(source)}`);

const builtIn: BuiltInPack = {
  info: {
    manifest: PackManifest.parse({ id: "works", name: "Works", version: "1.0.0", engine: "^1", plugin: "p.js" }),
    hash: "b".repeat(64),
    builtIn: true,
  },
  load: async () => ({
    data: PackData.parse({ buildings: [{ id: "press", name: "Press" }] }),
    plugin: definePlugin({
      id: "works",
      nodeFields: () => ({ force: { kind: "number", label: "Force", min: 1, max: 9, default: 5 } }),
      settingsFields: ({ settings }) => ({
        hard: {
          kind: "toggle",
          label: settings.label === undefined ? "Hard mode" : String(settings.label),
          default: false,
        },
      }),
      metrics: { noise: { label: "Noise", unit: "dB" } },
    }),
  }),
};

const files = {
  "manifest.yaml": "id: demo\nname: Demo Works\nversion: 1.2.0\nengine: ^1\nplugin: plugin/index.js\n",
  "plugin/index.js": "export default { id: 'demo' };",
  "data/items.yaml": "items:\n  - { id: ore, name: Ore, form: solid }\n",
};

function archive(change: Record<string, string> = {}): Uint8Array<ArrayBuffer> {
  return zipSync(
    Object.fromEntries(Object.entries({ ...files, ...change }).map(([name, value]) => [name, text(value)])),
  ).slice();
}

function setup() {
  const bus = createEventBus<Events>();
  const events: PackInfo[][] = [];
  bus.subscribe("packsChanged", ({ packs }) => events.push(packs));
  const library = createPackLibrary({ builtIns: [builtIn], storage: createMemoryKeyValueStorage(), loadModule });
  return { packs: createPacksManager({ library, bus }), events };
}

describe("the packs manager", () => {
  it("lists the built-in packs", async () => {
    const { packs } = setup();
    expect(await packs.listPacks({})).toEqual([builtIn.info]);
  });

  it("shows what a .cpack is before it's trusted, without installing it or running its code", async () => {
    const { packs, events } = setup();
    const bytes = archive({ "plugin/index.js": "throw new Error('ran');" });
    expect(await packs.inspectPack({ bytes })).toEqual({
      manifest: expect.objectContaining({ id: "demo", name: "Demo Works", version: "1.2.0" }),
      hash: await sha256(bytes),
      issues: [],
    });
    expect(await packs.listPacks({})).toEqual([builtIn.info]);
    expect(events).toEqual([]);
  });

  it("shows which pack a broken .cpack is, and where it's broken", async () => {
    const { packs } = setup();
    const inspection = await packs.inspectPack({ bytes: archive({ "data/items.yaml": "items: [{ id: ore }]" }) });
    expect(inspection.manifest?.id).toBe("demo");
    expect(inspection.issues).toEqual([
      { path: ["data/items.yaml", "items", 0, "name"], message: "Required", line: 1, column: 9 },
      { path: ["data/items.yaml", "items", 0, "form"], message: "Required", line: 1, column: 9 },
    ]);
  });

  it("says when a file isn't a pack at all", async () => {
    const { packs } = setup();
    const bytes = text("hello");
    expect(await packs.inspectPack({ bytes })).toEqual({
      manifest: null,
      hash: await sha256(bytes),
      issues: [{ path: [], message: "This file isn't a .cpack archive" }],
    });
  });

  it("installs a pack, tells every client and serves its data", async () => {
    const { packs, events } = setup();
    const bytes = archive();
    const installed = await packs.installPack({ bytes });
    const info: PackInfo = {
      manifest: PackManifest.parse({
        id: "demo",
        name: "Demo Works",
        version: "1.2.0",
        engine: "^1",
        plugin: "plugin/index.js",
      }),
      hash: await sha256(bytes),
      builtIn: false,
    };
    expect(installed).toEqual({ ok: true, value: info });
    expect(events).toEqual([[builtIn.info, info]]);
    expect((await packs.getPackData({ packId: "demo" })).items.map((item) => item.id)).toEqual(["ore"]);
  });

  it("refuses to install a broken pack", async () => {
    const { packs, events } = setup();
    const result = await packs.installPack({ bytes: archive({ "manifest.yaml": "id: demo\n" }) });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error[0]).toMatchObject({ path: ["manifest.yaml", "name"], message: "Required" });
    expect(await packs.listPacks({})).toEqual([builtIn.info]);
    expect(events).toEqual([]);
  });

  it("refuses to install a pack whose plugin doesn't load", async () => {
    const { packs } = setup();
    const result = await packs.installPack({ bytes: archive({ "plugin/index.js": "export default {" }) });
    expect(result).toMatchObject({ ok: false, error: [{ path: ["plugin/index.js"] }] });
  });

  it("removes an installed pack and tells every client", async () => {
    const { packs, events } = setup();
    await packs.installPack({ bytes: archive() });
    await packs.removePack({ packId: "demo" });
    expect(await packs.listPacks({})).toEqual([builtIn.info]);
    expect(events.at(-1)).toEqual([builtIn.info]);
  });

  it("describes a pack plugin's fields, settings and metrics for the inspector", async () => {
    const { packs } = setup();
    expect(await packs.describePlugin({ packId: "works", settings: { label: "Brutal" } })).toEqual({
      nodeFields: { press: { force: { kind: "number", label: "Force", min: 1, max: 9, default: 5 } } },
      settingsFields: { hard: { kind: "toggle", label: "Brutal", default: false } },
      metrics: { noise: { label: "Noise", unit: "dB" } },
    });
    await packs.installPack({ bytes: archive() });
    expect(await packs.describePlugin({ packId: "demo", settings: {} })).toEqual({
      nodeFields: {},
      settingsFields: {},
      metrics: {},
    });
    await expect(packs.describePlugin({ packId: "nope", settings: {} })).rejects.toThrow("Unknown pack 'nope'");
  });

  it("treats removing a pack that isn't installed, and asking for unknown data, as mistakes", async () => {
    const { packs } = setup();
    await expect(packs.removePack({ packId: "works" })).rejects.toThrow("No installed pack 'works'");
    await expect(packs.getPackData({ packId: "nope" })).rejects.toThrow("Unknown pack 'nope'");
  });
});
