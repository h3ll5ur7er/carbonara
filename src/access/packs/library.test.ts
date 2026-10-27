import { describe, expect, it } from "vitest";
import { PackData, PackManifest } from "../../contracts/pack";
import type { KeyValueStorage } from "../../contracts/platform";
import { definePlugin } from "../../contracts/plugin";
import { createMemoryKeyValueStorage } from "../../utilities/memory-key-value";
import { createPackLibrary, type BuiltInPack, type PackToInstall } from "./library";

const manifest = (id: string, name: string) =>
  PackManifest.parse({ id, name, version: "1.0.0", engine: "^1", plugin: "plugin/index.js" });
const data = PackData.parse({ items: [{ id: "ore", name: "Ore", form: "solid" }] });

/** Node imports data URLs; the web platform uses Blob URLs. */
const loadModule = (source: string) => import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(source)}`);

const builtIn: BuiltInPack = {
  info: { manifest: manifest("works", "Works"), hash: "b".repeat(64), builtIn: true },
  load: async () => ({ data, plugin: definePlugin({ id: "works-core" }) }),
};

const thirdParty = (id: string, plugin = `export default { id: "${id}-plugin" };`): PackToInstall => ({
  manifest: manifest(id, `Pack ${id}`),
  data,
  hash: "c".repeat(64),
  plugin,
});

const library = (storage: KeyValueStorage = createMemoryKeyValueStorage()) =>
  createPackLibrary({ builtIns: [builtIn], storage, loadModule });

describe("the pack library", () => {
  it("lists the built-in packs and loads them", async () => {
    const packs = library();
    expect(await packs.list()).toEqual([builtIn.info]);
    const loaded = await packs.get("works");
    expect(loaded?.info).toEqual(builtIn.info);
    expect(loaded?.plugin.id).toBe("works-core");
    expect(loaded?.data.items[0]?.id).toBe("ore");
  });

  it("knows nothing about packs it doesn't have", async () => {
    expect(await library().get("nope")).toBeUndefined();
  });

  it("installs a pack, loads its plugin and lists it after the built-ins", async () => {
    const packs = library();
    const installed = await packs.install(thirdParty("aaa"));
    const info = { manifest: manifest("aaa", "Pack aaa"), hash: "c".repeat(64), builtIn: false };
    expect(installed).toEqual({ ok: true, value: info });
    expect(await packs.list()).toEqual([builtIn.info, info]);
    const loaded = await packs.get("aaa");
    expect(loaded?.plugin).toEqual({ id: "aaa-plugin" });
    expect(loaded?.data).toEqual(data);
  });

  it("keeps installed packs in its storage", async () => {
    const storage = createMemoryKeyValueStorage();
    await library(storage).install(thirdParty("kept"));
    const reopened = library(storage);
    expect((await reopened.list()).map((info) => info.manifest.id)).toEqual(["works", "kept"]);
    expect((await reopened.get("kept"))?.plugin.id).toBe("kept-plugin");
  });

  it("replaces an installed pack with a new version", async () => {
    const packs = library();
    await packs.install(thirdParty("aaa"));
    await packs.install({ ...thirdParty("aaa", `export default { id: "second" };`), hash: "d".repeat(64) });
    expect((await packs.list()).filter((info) => info.manifest.id === "aaa")).toHaveLength(1);
    expect((await packs.get("aaa"))?.info.hash).toBe("d".repeat(64));
    expect((await packs.get("aaa"))?.plugin.id).toBe("second");
  });

  it("lets an installed pack stand in for the built-in with its id until it's removed", async () => {
    const packs = library();
    await packs.install(thirdParty("works"));
    expect(await packs.list()).toMatchObject([{ manifest: { id: "works" }, builtIn: false }]);
    expect((await packs.get("works"))?.plugin.id).toBe("works-plugin");

    expect(await packs.remove("works")).toBe(true);
    expect(await packs.list()).toEqual([builtIn.info]);
    expect((await packs.get("works"))?.plugin.id).toBe("works-core");
  });

  it("removes installed packs but not built-in ones", async () => {
    const storage = createMemoryKeyValueStorage();
    const packs = library(storage);
    await packs.install(thirdParty("gone"));
    expect(await packs.remove("gone")).toBe(true);
    expect(await packs.get("gone")).toBeUndefined();
    expect(await storage.keys()).toEqual([]);
    expect(await packs.remove("gone")).toBe(false);
    expect(await packs.remove("works")).toBe(false);
  });

  it("refuses a pack whose plugin doesn't run, and stores nothing", async () => {
    const storage = createMemoryKeyValueStorage();
    const result = await library(storage).install(thirdParty("broken", "export default {"));
    expect(result).toMatchObject({ ok: false, error: [{ path: ["plugin/index.js"] }] });
    expect(!result.ok && result.error[0]?.message).toMatch(/^The plugin doesn't load: /);
    expect(await storage.keys()).toEqual([]);
  });

  it("refuses a pack whose plugin exports no plugin", async () => {
    const result = await library().install(thirdParty("empty", "export const x = 1;"));
    expect(result).toEqual({
      ok: false,
      error: [
        {
          path: ["plugin/index.js"],
          message: "The plugin doesn't export a plugin; write export default definePlugin({ id: … })",
        },
      ],
    });
  });
});
