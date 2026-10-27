// Renders the packs in `packs/` as the source of the virtual modules behind `virtual:built-in-packs` (a list of
// BuiltInPack, src/access/packs/library.ts): an index, and per pack a data and a plugin module that load on first
// use. The Vite plugin (vite-plugin.ts) runs this file as a script, which prints the modules as JSON.
import type { PackInfo } from "../../src/contracts/managers";
import { fail, ok, type Result } from "../../src/contracts/result";
import { sha256 } from "../../src/access/packs/archive";
import { describeIssue } from "../../src/utilities/issues";
import { packFolder } from "./build";

export const INDEX = "virtual:built-in-packs";

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

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await renderBuiltInPacks(process.argv.slice(2));
  process.stdout.write(JSON.stringify(result.ok ? { ok: true, value: [...result.value] } : result));
}
