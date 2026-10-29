// Renders the packs in `packs/` as the source of the virtual modules behind `virtual:built-in-packs` (a list of
// BuiltInPack, src/access/packs/library.ts): an index, and per pack a data and a plugin module that load on first
// use, and an icons module for the packs whose icons the build brings (docs/Architecture/Game-packs.md, Assets and
// permissions). The Vite plugin (vite-plugin.ts) runs this file as a script, which prints the modules as JSON.
import type { PackInfo } from "../../src/contracts/managers";
import type { PackData } from "../../src/contracts/pack";
import { fail, ok, type Result } from "../../src/contracts/result";
import { sha256 } from "../../src/access/packs/archive";
import { describeIssue } from "../../src/utilities/issues";
import { packFolder } from "./build";
import { isMain } from "../is-main";

export const INDEX = "virtual:built-in-packs";

export interface RenderOptions {
  /** The ids of the packs whose icons the build brings, or `all`. None by default: see CARB-31. */
  icons?: readonly string[];
}

/** The source of every virtual module, by id; fails with a readable message when a pack is broken. */
export async function renderBuiltInPacks(
  folders: string[],
  { icons = [] }: RenderOptions = {},
): Promise<Result<Map<string, string>, string>> {
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
    const load = `load: async () => ({ data: (await import(${JSON.stringify(dataId)})).default, plugin: (await import(${JSON.stringify(pluginId)})).default })`;
    let iconsEntry = "";
    if (icons.includes("all") || icons.includes(manifest.id)) {
      const iconsId = `${INDEX}/${manifest.id}/icons`;
      modules.set(iconsId, `export default ${JSON.stringify(iconUrls(data, built.value.files))};`);
      iconsEntry = `, icons: async () => (await import(${JSON.stringify(iconsId)})).default`;
    }
    entries.push(`{ info: ${JSON.stringify(info)}, ${load}${iconsEntry} }`);
  }
  return ok(new Map([[INDEX, `export default [\n${entries.join(",\n")}\n];`], ...modules]));
}

const TYPES: Record<string, string> = { webp: "image/webp", png: "image/png", svg: "image/svg+xml" };

/** Every icon the data names, as a data URL by its path. */
function iconUrls(data: PackData, files: Record<string, Uint8Array>): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const { icon } of [...data.items, ...data.buildings]) {
    const bytes = icon && files[icon];
    if (!icon || !bytes) continue;
    const type = TYPES[icon.slice(icon.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";
    urls[icon] = `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  }
  return urls;
}

/** Arguments: `[--icons=<id>,<id>|all] <folder>…`. */
if (isMain(import.meta.url)) {
  const [first = "", ...rest] = process.argv.slice(2);
  const flag = first.startsWith("--icons=");
  const icons = flag ? first.slice("--icons=".length).split(",").filter(Boolean) : [];
  const result = await renderBuiltInPacks(flag ? rest : process.argv.slice(2), { icons });
  process.stdout.write(JSON.stringify(result.ok ? { ok: true, value: [...result.value] } : result));
}
