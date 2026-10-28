// `carbonara-pack import <pack> <game data file>… [--icons <folder>]…`: runs a pack plugin's importer and writes the
// result into the pack folder: `data/<section>.yaml` and `icons/*.webp`.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format, resolveConfig } from "prettier";
import sharp from "sharp";
import { Document, isMap, isSeq, stringify } from "yaml";
import type { PackDataFile } from "../../src/contracts/pack";
import type { Plugin } from "../../src/contracts/plugin";
import { fail, ok, type Result } from "../../src/contracts/result";

/** Icons are normalised to one size so every pack looks the same in the UI. */
const ICON_SIZE = 64;
const IMAGE = /\.(png|webp|jpe?g)$/i;
/** Size suffixes that games put on their texture names (`IconDesc_IronIngot_256`). */
const SIZE_SUFFIX = /_(64|128|256|512|1024)$/;
const SECTIONS: { file: string; keys: (keyof PackDataFile)[] }[] = [
  { file: "items.yaml", keys: ["units", "items"] },
  { file: "buildings.yaml", keys: ["buildings"] },
  { file: "recipes.yaml", keys: ["categories", "unlocks", "recipes"] },
  { file: "logistics.yaml", keys: ["logistics"] },
  { file: "resources.yaml", keys: ["resources"] },
];

export async function importPack(
  folder: string,
  sources: string[],
  iconFolders: string[] = [],
): Promise<Result<{ files: number; icons: number }>> {
  const module = (await import(pathToFileURL(resolve(folder, "plugin", "index.ts")).href)) as { default: Plugin };
  const importer = module.default.importer;
  if (!importer) return fail([{ path: ["plugin/index.ts"], message: "The plugin has no importer" }]);

  const files: Record<string, Uint8Array> = {};
  for (const source of sources) {
    const name = basename(source);
    if (!importer.accepts.includes(name)) {
      return fail([{ path: [name], message: `The importer accepts ${importer.accepts.join(", ")}` }]);
    }
    files[name] = readFileSync(source);
  }
  Object.assign(files, await readIcons(iconFolders));

  const { data, icons } = importer.run(files);

  const dataFolder = join(folder, "data");
  const iconFolder = join(folder, "icons");
  rmSync(dataFolder, { recursive: true, force: true });
  rmSync(iconFolder, { recursive: true, force: true });
  mkdirSync(dataFolder, { recursive: true });
  let written = 0;
  for (const { file, keys } of SECTIONS) {
    const content = Object.fromEntries(keys.flatMap((key) => (isEmpty(data[key]) ? [] : [[key, data[key]]])));
    if (Object.keys(content).length === 0) continue;
    const path = join(dataFolder, file);
    writeFileSync(path, await toYaml(content, path));
    written++;
  }
  if (Object.keys(icons).length > 0) mkdirSync(iconFolder, { recursive: true });
  for (const [name, bytes] of Object.entries(icons)) writeFileSync(join(folder, name), bytes);
  return ok({ files: written, icons: Object.keys(icons).length });
}

/**
 * Every image below the folders as `icons/<name>.webp` at the fixed size, the largest source winning per name.
 * An image wider than tall is a strip of mipmaps (Factorio's icons: 64 px, then 32, 16 and 8 to its right), whose
 * left square is the icon.
 */
async function readIcons(folders: string[]): Promise<Record<string, Uint8Array>> {
  const best = new Map<string, { path: string; size: number; height: number }>();
  for (const path of folders.flatMap((folder) => [...walk(folder)]).filter((file) => IMAGE.test(file))) {
    const name = basename(path, extname(path)).replace(SIZE_SUFFIX, "");
    const { width, height } = await sharp(path).metadata();
    const size = Math.min(width, height);
    if (size > (best.get(name)?.size ?? 0)) best.set(name, { path, size, height });
  }
  const icons: Record<string, Uint8Array> = {};
  for (const [name, { path, size, height }] of best) {
    icons[`icons/${name}.webp`] = await sharp(path)
      .extract({ left: 0, top: 0, width: size, height })
      .resize(ICON_SIZE, ICON_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 85, alphaQuality: 90, effort: 6 })
      .toBuffer();
  }
  return icons;
}

/**
 * Readable YAML: an entry that fits on its line is written as `{ … }`; a longer one is spread over several lines,
 * with each of its values inline where that fits.
 */
async function toYaml(content: Record<string, unknown>, path: string): Promise<string> {
  // The repository's Prettier settings, wherever the pack folder is.
  const options = await resolveConfig(fileURLToPath(import.meta.url));
  const lineWidth = options?.printWidth ?? 80;
  const inline = (node: unknown, prefix: string) => {
    if (!isMap(node) && !isSeq(node)) return false;
    node.flow = `${prefix}${stringify(node, { collectionStyle: "flow", lineWidth: 0 }).trim()}`.length <= lineWidth;
    return node.flow;
  };
  const document = new Document(content, { aliasDuplicateObjects: false });
  document.commentBefore = " Generated by `pnpm pack:import` from the game's own data. Don't edit by hand.";
  for (const pair of isMap(document.contents) ? document.contents.items : []) {
    if (isMap(pair.value)) inline(pair.value, `${String(pair.key)}: `); // units
    if (!isSeq(pair.value)) continue;
    for (const entry of pair.value.items) {
      if (!isMap(entry) || inline(entry, "  - ")) continue;
      for (const field of entry.items) inline(field.value, `    ${String(field.key)}: `);
    }
  }
  return format(document.toString({ lineWidth: 0 }), { ...options, filepath: path });
}

function isEmpty(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length === 0);
}

function* walk(folder: string): Generator<string> {
  for (const entry of readdirSync(folder)) {
    const path = join(folder, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}
