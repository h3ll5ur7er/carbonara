// Bundles the packs in `packs/` into the app as the virtual module `virtual:built-in-packs`. The template pack is
// included only by the dev server (and so in e2e tests); production builds ship the game packs. Changing a file in
// `packs/` while the dev server runs rebuilds the packs and reloads the app.
//
// The packs are built by built-in-packs.ts in a child process: this file imports only Node built-ins, so the app's
// TypeScript modules stay out of the Vite config's own module graph (Vite's config loader can't follow their
// extensionless imports natively).
import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Plugin } from "vite";

const INDEX = "virtual:built-in-packs";
const TEMPLATE = "_template";
const RENDERER = join(dirname(fileURLToPath(import.meta.url)), "built-in-packs.ts");

type Rendered = { ok: true; value: [string, string][] } | { ok: false; error: string };

/** The folders below `root` that hold a pack, in name order. */
export function findPackFolders(root: string, includeTemplate: boolean): string[] {
  return readdirSync(root)
    .filter((name) => (includeTemplate || name !== TEMPLATE) && existsSync(join(root, name, "manifest.yaml")))
    .sort()
    .map((name) => join(root, name));
}

/** Builds the packs in a child process and returns the virtual modules' source by id. */
export async function renderInChildProcess(folders: string[]): Promise<Rendered> {
  const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", RENDERER, ...folders], {
    maxBuffer: 512 * 1024 * 1024,
  });
  return JSON.parse(stdout) as Rendered;
}

export function builtInPacks(packsFolder = "packs"): Plugin {
  const root = resolve(packsFolder);
  let includeTemplate = false;
  let modules: Promise<Rendered> | undefined;

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
      modules ??= renderInChildProcess(findPackFolders(root, includeTemplate));
      const result = await modules;
      if (!result.ok) {
        modules = undefined;
        this.error(`Built-in packs don't build:\n${result.error}`);
      }
      return new Map(result.value).get(id.slice(1));
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
