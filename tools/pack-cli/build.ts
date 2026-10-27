// `pnpm pack:build <folder> [out]`: bundles a pack folder's plugin and zips everything into a .cpack.
// Minimal build for Wave 0; the full `carbonara-pack` CLI (new, validate, dev, import) is CARB-28.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { build } from "esbuild";
import { zipSync } from "fflate";
import { fail, ok, type Result } from "../../src/contracts/result";
import { readPackFiles } from "../../src/engines/packs/files";

/** Folders and files that never go into an archive. */
const SKIP = new Set(["node_modules", ".DS_Store"]);

export async function buildPack(folder: string, out = "dist/packs"): Promise<Result<{ file: string }>> {
  const files: Record<string, Uint8Array> = {};
  for (const path of walk(folder)) {
    const name = relative(folder, path).split(sep).join("/");
    if (name.endsWith(".ts")) continue; // plugin sources are bundled below
    files[name] = readFileSync(path);
  }

  const source = join(folder, "plugin", "index.ts");
  if (exists(source)) {
    const bundle = await build({ entryPoints: [source], bundle: true, format: "esm", write: false, minify: true });
    files["plugin/index.js"] = bundle.outputFiles[0]?.contents ?? new Uint8Array();
  }

  const pack = readPackFiles(files);
  if (!pack.ok) return fail(pack.error);

  mkdirSync(out, { recursive: true });
  const file = join(out, `${pack.value.manifest.id}-${pack.value.manifest.version}.cpack`);
  writeFileSync(file, zipSync(files, { level: 9 }));
  return ok({ file });
}

function* walk(folder: string): Generator<string> {
  for (const entry of readdirSync(folder)) {
    if (SKIP.has(entry)) continue;
    const path = join(folder, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

function exists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [folder, out] = process.argv.slice(2);
  if (!folder) {
    console.error("Usage: pnpm pack:build <pack folder> [output folder]");
    process.exit(2);
  }
  const result = await buildPack(folder, out);
  if (result.ok) console.log(`Built ${result.value.file}`);
  else {
    for (const issue of result.error) console.error(`${issue.path.join(" › ")}: ${issue.message}`);
    process.exit(1);
  }
}
