// Builds a pack folder: bundles its plugin with esbuild, validates it with the packs engine and zips it into a
// .cpack. The same bytes come out of the same folder, so the archive's hash identifies the pack.
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { zipSync } from "fflate";
import { fail, ok, type Result } from "../../src/contracts/result";
import { readPackFiles, type PackContents } from "../../src/engines/packs/files";
import { readFolder } from "../../src/platforms/node/folder";

/** Zip entries carry a timestamp; a fixed one keeps builds reproducible. */
const MTIME = "2000-01-01T00:00:00Z";
export const PLUGIN_SOURCE = "plugin/index.ts";

export interface BuiltPack {
  files: Record<string, Uint8Array>;
  contents: PackContents;
  /** The .cpack bytes. */
  archive: Uint8Array;
}

export async function packFolder(folder: string): Promise<Result<BuiltPack>> {
  const files: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(readFolder(folder)).sort(([a], [b]) => a.localeCompare(b))) {
    if (!name.endsWith(".ts")) files[name] = bytes; // plugin sources are bundled below
  }

  const plugin = await bundlePlugin(folder);
  if (plugin) files["plugin/index.js"] = plugin;

  const contents = readPackFiles(files);
  if (!contents.ok) return contents;
  return ok({ files, contents: contents.value, archive: zipSync(files, { level: 9, mtime: MTIME }) });
}

/** `plugin/index.ts` bundled into one ES module, or undefined when the pack's plugin is plain JavaScript. */
export async function bundlePlugin(folder: string): Promise<Uint8Array | undefined> {
  const source = join(folder, PLUGIN_SOURCE);
  if (!exists(source)) return undefined;
  const bundle = await build({ entryPoints: [source], bundle: true, format: "esm", write: false, minify: true });
  return bundle.outputFiles[0]?.contents ?? new Uint8Array();
}

/** Writes `<out>/<id>-<version>.cpack`; writes nothing when the folder isn't a valid pack. */
export async function buildPack(folder: string, out = "dist/packs"): Promise<Result<{ file: string }>> {
  const pack = await packFolder(folder);
  if (!pack.ok) return fail(pack.error);
  const { manifest } = pack.value.contents;
  mkdirSync(out, { recursive: true });
  const file = join(out, `${manifest.id}-${manifest.version}.cpack`);
  writeFileSync(file, pack.value.archive);
  return ok({ file });
}

function exists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
