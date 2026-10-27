// Bundles the packs in `packs/` into the app at build time, as the virtual module `virtual:built-in-packs`
// (a list of BuiltInPack, src/access/packs/library.ts). Each pack's data and plugin are separate modules that load on
// first use. The template pack is included only by the dev server, so the app has something to plan with until
// the game packs land. Changing a file in `packs/` while the dev server runs rebuilds the packs and reloads the app.
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import type { PackInfo } from "../../src/contracts/managers";
import { fail, ok, type Result } from "../../src/contracts/result";
import { sha256 } from "../../src/access/packs/archive";
import { describeIssue } from "../../src/utilities/issues";
import { packFolder } from "./build";

const INDEX = "virtual:built-in-packs";
const TEMPLATE = "_template";

/** The folders below `root` that hold a pack, in name order. */
export function findPackFolders(root: string, includeTemplate: boolean): string[] {
  return readdirSync(root)
    .filter((name) => (includeTemplate || name !== TEMPLATE) && existsSync(join(root, name, "manifest.yaml")))
    .sort()
    .map((name) => join(root, name));
}

/** The source of every virtual module, by id; fails with a readable message when a pack is broken. */
export async function renderBuiltInPacks(folders: string[]): Promise<Result<Map<string, string>, string>> {
  const modules = new Map<string, string>();
  const entries: string[] = [];
  for (const folder of folders) {
    const built = await packFolder(folder);
    if (!built.ok) return fail(built.error.map((issue) => `${folder}: ${describeIssue(issue)}`).join("\n"));
    const { manifest, data } = built.value.contents;
    const info: PackInfo = { manifest, hash: await sha256(built.value.archive), builtIn: true };
    const dataId = `${INDEX}/${manifest.id}/data`;
    const pluginId = `${INDEX}/${manifest.id}/plugin`;
    // JSON.parse of a string literal parses faster than the same object as JavaScript.
    modules.set(dataId, `export default JSON.parse(${JSON.stringify(JSON.stringify(data))});`);
    modules.set(pluginId, new TextDecoder().decode(built.value.files[manifest.plugin]));
    entries.push(
      `{ info: ${JSON.stringify(info)}, load: async () => ({ data: (await import(${JSON.stringify(dataId)})).default, plugin: (await import(${JSON.stringify(pluginId)})).default }) }`,
    );
  }
  return ok(new Map([[INDEX, `export default [\n${entries.join(",\n")}\n];`], ...modules]));
}

export function builtInPacks(packsFolder = "packs"): Plugin {
  const root = resolve(packsFolder);
  let includeTemplate = false;
  let modules: Promise<Result<Map<string, string>, string>> | undefined;

  return {
    name: "carbonara:built-in-packs",
    configResolved(config) {
      includeTemplate = config.command === "serve";
    },
    resolveId(id) {
      return id === INDEX || id.startsWith(`${INDEX}/`) ? `\0${id}` : undefined;
    },
    async load(id) {
      if (!id.startsWith(`\0${INDEX}`)) return undefined;
      modules ??= renderBuiltInPacks(findPackFolders(root, includeTemplate));
      const result = await modules;
      if (!result.ok) {
        modules = undefined;
        this.error(`Built-in packs don't build:\n${result.error}`);
      }
      return result.value.get(id.slice(1));
    },
    configureServer(server) {
      const reload = (file: string) => {
        if (!file.startsWith(root)) return;
        modules = undefined;
        for (const module of server.moduleGraph.idToModuleMap.values()) {
          if (module.id?.startsWith(`\0${INDEX}`)) server.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.add(root);
      server.watcher.on("change", reload).on("add", reload).on("unlink", reload);
    },
  };
}
