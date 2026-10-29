// Packs access: hides where packs come from and how installed ones are kept. Built-in packs are bundled with the
// app; installed packs live in a KeyValueStorage (IndexedDB on the web) as their validated data plus their
// plugin's source, so loading one needs no unzipping or validating again. Built-in plugins load as ES modules
// through the platform; installed (third-party) plugins run isolated when the shell provides a sandbox.
import type { LoadedPack, PackStore, PluginRuntime } from "../../contracts/access";
import type { PackInfo } from "../../contracts/managers";
import type { PackData, PackManifest } from "../../contracts/pack";
import type { KeyValueStorage, ModuleLoader } from "../../contracts/platform";
import type { Plugin } from "../../contracts/plugin";
import { fail, ok, type Result } from "../../contracts/result";

/** A pack bundled with the app at build time (see tools/pack-cli/built-in-packs.ts). Its data loads on first use. */
export interface BuiltInPack {
  info: PackInfo;
  load(): Promise<{ data: PackData; plugin: Plugin }>;
  /** Its icons as URLs, by the path its data names them by; only when the build brings them (CARB-31). */
  icons?(): Promise<Record<string, string>>;
}

/** A pack the packs engine has validated, ready to be kept. */
export interface PackToInstall {
  manifest: PackManifest;
  data: PackData;
  hash: string;
  /** The plugin module's source. */
  plugin: string;
}

export interface PackLibrary extends PackStore {
  /**
   * Keeps a pack, replacing an installed one with the same id. An installed pack stands in for the built-in pack
   * with its id, so built-in packs can be updated without an app release. Fails when the plugin doesn't load.
   */
  install(pack: PackToInstall): Promise<Result<PackInfo>>;
  /** Removes an installed pack; false when no pack with that id is installed. */
  remove(packId: string): Promise<boolean>;
  /**
   * The pack's icons as URLs, by the path its data names them by. Only built-in packs whose icons the build brings
   * have any: installed packs don't keep theirs yet (CARB-137).
   */
  icons(packId: string): Promise<Record<string, string>>;
}

/** Starts a third-party plugin in a sandbox of its own (the web's opaque-origin plugin worker). */
export type IsolatePlugin = (plugin: { source: string; data: PackData }) => Promise<Result<PluginRuntime>>;

export interface PackLibraryOptions {
  builtIns: BuiltInPack[];
  storage: KeyValueStorage;
  loadModule: ModuleLoader;
  /** Where installed plugins run. Without it (Node, tests) they load like built-in ones, through `loadModule`. */
  isolate?: IsolatePlugin;
}

/**
 * Two keys per installed pack: its small `PackInfo`, so listing doesn't read every pack's data, and its contents.
 * The info is written last and removed first, so a pack counts as installed only while it's complete.
 */
const infoKey = (packId: string) => `info/${packId}`;
const contentsKey = (packId: string) => `contents/${packId}`;
type StoredContents = { data: PackData; plugin: string };

export function createPackLibrary({ builtIns, storage, loadModule, isolate }: PackLibraryOptions): PackLibrary {
  /** Loaded packs by id; a pack's plugin module is imported once. */
  const loaded = new Map<string, Promise<LoadedPack | undefined>>();

  const installedInfo = async (packId: string) => (await storage.get(infoKey(packId))) as PackInfo | undefined;

  async function loadPlugin(source: string): Promise<Result<Plugin>> {
    let module: Record<string, unknown>;
    try {
      module = await loadModule(source);
    } catch (error) {
      return fail([{ path: ["plugin/index.js"], message: `The plugin doesn't load: ${String(error)}` }]);
    }
    const plugin = module.default as Partial<Plugin> | undefined;
    if (typeof plugin !== "object" || plugin === null || typeof plugin.id !== "string") {
      const message = "The plugin doesn't export a plugin; write export default definePlugin({ id: … })";
      return fail([{ path: ["plugin/index.js"], message }]);
    }
    return ok(plugin as Plugin);
  }

  /** An installed pack's plugin: in its sandbox when there is one, else loaded here. */
  async function startInstalled(info: PackInfo, data: PackData, source: string): Promise<Result<LoadedPack>> {
    if (isolate) {
      const runtime = await isolate({ source, data });
      return runtime.ok ? ok({ info, data, isolated: runtime.value }) : runtime;
    }
    const plugin = await loadPlugin(source);
    return plugin.ok ? ok({ info, data, plugin: plugin.value }) : plugin;
  }

  /** Stops the sandbox of a pack that is about to be replaced or removed. */
  function forget(packId: string) {
    void loaded.get(packId)?.then(
      (pack) => pack?.isolated?.dispose?.(),
      () => undefined,
    );
    loaded.delete(packId);
  }

  async function load(packId: string): Promise<LoadedPack | undefined> {
    const info = await installedInfo(packId);
    if (info) {
      const contents = (await storage.get(contentsKey(packId))) as StoredContents | undefined;
      if (!contents) throw new Error(`The stored pack ${packId} is incomplete`);
      const pack = await startInstalled(info, contents.data, contents.plugin);
      // It loaded when it was installed; failing now means the stored copy is damaged.
      if (!pack.ok) throw new Error(`The stored plugin of ${packId} no longer loads`);
      return pack.value;
    }
    const builtIn = builtIns.find((pack) => pack.info.manifest.id === packId);
    return builtIn && { info: builtIn.info, ...(await builtIn.load()) };
  }

  return {
    async list() {
      const keys = (await storage.keys()).filter((key) => key.startsWith("info/")).sort();
      const installed = (await Promise.all(keys.map((key) => storage.get(key)))) as PackInfo[];
      const replaced = new Set(installed.map((info) => info.manifest.id));
      return [...builtIns.map((pack) => pack.info).filter((info) => !replaced.has(info.manifest.id)), ...installed];
    },

    async icons(packId) {
      if (await installedInfo(packId)) return {};
      return (await builtIns.find((pack) => pack.info.manifest.id === packId)?.icons?.()) ?? {};
    },

    get(packId) {
      const cached = loaded.get(packId) ?? load(packId);
      loaded.set(packId, cached);
      return cached;
    },

    async install({ manifest, data, hash, plugin: source }) {
      const info: PackInfo = { manifest, hash, builtIn: false };
      const pack = await startInstalled(info, data, source);
      if (!pack.ok) return pack;
      await storage.delete(infoKey(manifest.id));
      await storage.set(contentsKey(manifest.id), { data, plugin: source } satisfies StoredContents);
      await storage.set(infoKey(manifest.id), info);
      forget(manifest.id);
      loaded.set(manifest.id, Promise.resolve(pack.value));
      return ok(info);
    },

    async remove(packId) {
      if (!(await installedInfo(packId))) return false;
      await storage.delete(infoKey(packId));
      await storage.delete(contentsKey(packId));
      forget(packId);
      return true;
    },
  };
}
