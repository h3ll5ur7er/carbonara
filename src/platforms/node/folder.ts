// A folder on disk as a set of files, the way the packs engine reads a pack (the pack CLI, the app build).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Folders and files that are never part of what a folder holds. */
const SKIP = new Set(["node_modules", ".DS_Store", ".git"]);

/** Every file below `folder`, keyed by its path relative to it, with `/` as the separator. */
export function readFolder(folder: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const path of walk(folder)) files[relative(folder, path).split(sep).join("/")] = readFileSync(path);
  return files;
}

function* walk(folder: string): Generator<string> {
  for (const entry of readdirSync(folder)) {
    if (SKIP.has(entry)) continue;
    const path = join(folder, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}
