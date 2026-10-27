// `carbonara-pack dev <folder>`: builds the pack, then rebuilds it whenever one of its files changes.
// Packs in this repository's `packs/` folder also reload in a running `pnpm dev` (tools/pack-cli/built-in-packs.ts).
import { watch } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { Result } from "../../src/contracts/result";
import { buildPack } from "./build";

/** Editors save in bursts (temp file, rename, write); one rebuild per burst. */
const SETTLE_MS = 100;

export interface WatchOptions {
  signal: AbortSignal;
  onBuild: (result: Result<{ file: string }>) => void;
}

/** Resolves once `signal` aborts. */
export async function watchPack(folder: string, out: string, { signal, onBuild }: WatchOptions): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let building = Promise.resolve();
  const rebuild = () => {
    building = building.then(async () => {
      if (!signal.aborted) onBuild(await buildPack(folder, out));
    });
  };
  const outside = relative(resolve(folder), resolve(out));

  rebuild();
  try {
    for await (const { filename } of watch(folder, { recursive: true, signal })) {
      // The output folder may sit inside the pack folder; writing the archive mustn't trigger another build.
      if (filename && !outside.startsWith("..") && join(filename).startsWith(outside)) continue;
      clearTimeout(timer);
      timer = setTimeout(rebuild, SETTLE_MS);
    }
  } catch (error) {
    if (!signal.aborted) throw error;
  }
  clearTimeout(timer);
  await building;
}
