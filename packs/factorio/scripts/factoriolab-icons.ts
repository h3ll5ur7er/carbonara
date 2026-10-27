// Cuts FactorioLab's icon sprite sheet (public/data/<set>/icons.webp, with the positions in data.json) into one PNG per
// prototype name, for `pnpm pack:import factorio … --icons <folder>`. Maintainer tooling for when no game install is
// at hand; with one, pass the game's graphics/icons folders instead. See README.md and CREDITS.md.
//
//   pnpm exec tsx packs/factorio/scripts/factoriolab-icons.ts <data.json> <icons.webp> <out folder>
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/** FactorioLab draws every icon at 64×64. */
const SIZE = 64;

const [dataFile, sheetFile, out] = process.argv.slice(2);
if (!dataFile || !sheetFile || !out) {
  console.error("Usage: factoriolab-icons.ts <data.json> <icons.webp> <out folder>");
  process.exit(2);
}
const { icons } = JSON.parse(readFileSync(dataFile, "utf8")) as { icons: { id: string; x: number; y: number }[] };
mkdirSync(out, { recursive: true });
for (const { id, x, y } of icons) {
  await sharp(sheetFile)
    .extract({ left: x, top: y, width: SIZE, height: SIZE })
    .png()
    .toFile(join(out, `${id}.png`));
}
console.log(`Wrote ${icons.length} icons to ${out}`);
