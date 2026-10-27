import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, resolveConfig } from "prettier";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { importPack } from "./import";

/** A pack whose importer reads `source.json` as the data and passes icons through under lower-case names. */
function fakePack(): string {
  const folder = mkdtempSync(join(tmpdir(), "pack-import-"));
  mkdirSync(join(folder, "plugin"));
  writeFileSync(
    join(folder, "plugin", "index.ts"),
    `export default {
      id: "fake",
      importer: {
        accepts: ["source.json"],
        run(files: Record<string, Uint8Array>) {
          const data = JSON.parse(new TextDecoder().decode(files["source.json"]));
          for (const building of data.buildings ?? []) building.fields = data.buildings[0].fields;
          const icons: Record<string, Uint8Array> = {};
          for (const [name, bytes] of Object.entries(files)) if (name.startsWith("icons/")) icons[name.toLowerCase()] = bytes;
          return { data, icons };
        },
      },
    };`,
  );
  return folder;
}

const data = {
  units: { rate: "per_minute" },
  items: [
    { id: "ore", name: "Ore", form: "solid" },
    { id: "plate", name: "Plate", form: "solid", icon: "icons/plate.webp" },
  ],
  buildings: [{ id: "press", name: "Press", speed: 1, power: { consume: 4 }, fields: { clock: { min: 1, max: 250 } } }],
  recipes: [
    { id: "plate", name: "Alternate: Plate", buildings: ["press"], time: 2, in: { ore: 3 }, out: { plate: 1 } },
  ],
  logistics: [],
};

function source(folder: string, content: unknown = data): string {
  const file = join(folder, "source.json");
  writeFileSync(file, JSON.stringify(content));
  return file;
}

const square = (size: number, colour: { r: number; g: number; b: number }) =>
  sharp({ create: { width: size, height: size, channels: 4, background: { ...colour, alpha: 1 } } })
    .png()
    .toBuffer();

describe("importPack", () => {
  it("writes the imported data as one Prettier-clean YAML file per section", async () => {
    const pack = fakePack();
    const result = await importPack(pack, [source(mkdtempSync(join(tmpdir(), "source-")))]);
    expect(result).toEqual({ ok: true, value: { files: 3, icons: 0 } });

    // Empty sections (logistics) get no file.
    expect(readdirSync(join(pack, "data")).sort()).toEqual(["buildings.yaml", "items.yaml", "recipes.yaml"]);
    const items = readFileSync(join(pack, "data", "items.yaml"), "utf8");
    expect(parse(items)).toEqual({ units: data.units, items: data.items });
    expect(parse(readFileSync(join(pack, "data", "recipes.yaml"), "utf8"))).toEqual({ recipes: data.recipes });
    const repositorySettings = await resolveConfig("package.json");
    for (const name of readdirSync(join(pack, "data"))) {
      const file = join(pack, "data", name);
      expect(await check(readFileSync(file, "utf8"), { ...repositorySettings, filepath: file }), name).toBe(true);
    }
  });

  it("keeps entries that fit on one line and spreads longer ones over several", async () => {
    const pack = fakePack();
    const long = { ...data.recipes[0], id: "plate-the-long-way", in: { ore: 3, "ore-from-a-very-distant-place": 10 } };
    await importPack(pack, [source(mkdtempSync(join(tmpdir(), "source-")), { ...data, recipes: [long] })]);
    const items = readFileSync(join(pack, "data", "items.yaml"), "utf8");
    expect(items).toContain("  - { id: ore, name: Ore, form: solid }\n");
    const recipes = readFileSync(join(pack, "data", "recipes.yaml"), "utf8");
    expect(recipes).toContain("  - id: plate-the-long-way\n");
    expect(recipes).toContain("    in: { ore: 3, ore-from-a-very-distant-place: 10 }\n");
  });

  it("spreads values that don't fit on their line over several lines", async () => {
    const pack = fakePack();
    const inputs = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [`ingredient-number-${index}`, index + 1]),
    );
    const long = { ...data.recipes[0], in: inputs };
    await importPack(pack, [source(mkdtempSync(join(tmpdir(), "source-")), { ...data, recipes: [long] })]);
    const recipes = readFileSync(join(pack, "data", "recipes.yaml"), "utf8");
    expect(recipes).toContain("    in:\n      ingredient-number-0: 1\n");
    expect(recipes).toContain("    out: { plate: 1 }\n");
  });

  it("writes values that entries share in full instead of as YAML aliases", async () => {
    const pack = fakePack(); // its importer shares the first building's fields with the others
    const second = { ...data.buildings[0], id: "press-2", name: "Press 2" };
    await importPack(pack, [
      source(mkdtempSync(join(tmpdir(), "source-")), { ...data, buildings: [data.buildings[0], second] }),
    ]);
    const buildings = readFileSync(join(pack, "data", "buildings.yaml"), "utf8");
    expect(buildings).not.toMatch(/[&*]a\d/);
    expect(parse(buildings).buildings[1].fields).toEqual(data.buildings[0]?.fields);
  });

  it("turns icon images into 64×64 WebP, taking the largest size of each icon", async () => {
    const pack = fakePack();
    const sources = mkdtempSync(join(tmpdir(), "source-"));
    const icons = join(sources, "icons");
    mkdirSync(icons);
    writeFileSync(join(icons, "Plate_64.png"), await square(64, { r: 0, g: 0, b: 255 }));
    writeFileSync(join(icons, "Plate_256.png"), await square(256, { r: 255, g: 0, b: 0 }));

    const result = await importPack(pack, [source(sources)], [icons]);
    expect(result).toEqual({ ok: true, value: { files: 3, icons: 1 } });
    const icon = sharp(readFileSync(join(pack, "icons", "plate.webp")));
    expect(await icon.metadata()).toMatchObject({ format: "webp", width: 64, height: 64 });
    const { data: pixels } = await icon.raw().toBuffer({ resolveWithObject: true });
    expect(pixels[0]).toBeGreaterThan(200); // red: the 256 px image won
  });

  it("replaces the data and icons of an earlier import", async () => {
    const pack = fakePack();
    mkdirSync(join(pack, "data"));
    mkdirSync(join(pack, "icons"));
    writeFileSync(join(pack, "data", "old.yaml"), "items: []\n");
    writeFileSync(join(pack, "icons", "old.webp"), "");
    await importPack(pack, [source(mkdtempSync(join(tmpdir(), "source-")))]);
    expect(readdirSync(join(pack, "data"))).not.toContain("old.yaml");
    expect(existsSync(join(pack, "icons", "old.webp"))).toBe(false);
  });

  it("refuses source files the pack's importer doesn't accept", async () => {
    const pack = fakePack();
    const file = join(mkdtempSync(join(tmpdir(), "source-")), "other.json");
    writeFileSync(file, "{}");
    expect(await importPack(pack, [file])).toEqual({
      ok: false,
      error: [{ path: ["other.json"], message: "The importer accepts source.json" }],
    });
  });
});
