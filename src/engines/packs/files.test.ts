import { describe, expect, it } from "vitest";
import { readPackFiles } from "./files";

const text = (value: string) => new TextEncoder().encode(value);

const manifest = `
id: demo
name: Demo
version: 1.0.0
engine: ^1
plugin: plugin/index.js
`;

const files = {
  "manifest.yaml": text(manifest),
  "plugin/index.js": text("export default { id: 'demo' };"),
  "data/a-items.yaml": text(`
units: { rate: per_second }
items:
  - { id: ore, name: Ore, form: solid }
`),
  "data/b-more.json": text(
    JSON.stringify({
      items: [{ id: "plate", name: "Plate", form: "solid" }],
      buildings: [{ id: "furnace", name: "Furnace" }],
      recipes: [{ id: "plate", buildings: ["furnace"], time: 1, in: { ore: 1 }, out: { plate: 1 } }],
    }),
  ),
  "README.md": text("# Demo"),
};

describe("readPackFiles", () => {
  it("reads the manifest and merges the data files in name order", () => {
    const result = readPackFiles(files);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.manifest.id).toBe("demo");
    expect(result.value.data.units.rate).toBe("per_second");
    expect(result.value.data.items.map((item) => item.id)).toEqual(["ore", "plate"]);
    expect(result.value.data.recipes).toHaveLength(1);
  });

  it("requires a manifest", () => {
    const { "manifest.yaml": _manifest, ...rest } = files;
    expect(readPackFiles(rest)).toEqual({ ok: false, error: [{ path: ["manifest.yaml"], message: "Missing file" }] });
  });

  it("requires the plugin the manifest names", () => {
    const { "plugin/index.js": _plugin, ...rest } = files;
    expect(readPackFiles(rest)).toEqual({ ok: false, error: [{ path: ["plugin/index.js"], message: "Missing file" }] });
  });

  it("reports unreadable YAML with the file name", () => {
    const result = readPackFiles({ ...files, "data/c-broken.yaml": text("items: [") });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error[0]?.path).toEqual(["data/c-broken.yaml"]);
  });

  it("reports schema problems inside a data file with the file name first", () => {
    const result = readPackFiles({ ...files, "data/c-bad.yaml": text("items: [{ id: X, name: X, form: solid }]") });
    expect(!result.ok && result.error[0]?.path).toEqual(["data/c-bad.yaml", "items", 0, "id"]);
  });

  it("refuses units defined in two files", () => {
    const result = readPackFiles({ ...files, "data/c-units.yaml": text("units: { rate: per_minute }") });
    expect(result).toEqual({
      ok: false,
      error: [{ path: ["data/c-units.yaml", "units"], message: "Units are already defined in data/a-items.yaml" }],
    });
  });

  it("reports broken references across files", () => {
    const result = readPackFiles({
      ...files,
      "data/c-recipe.yaml": text("recipes: [{ id: gear, buildings: [press], time: 1, out: { gear: 1 } }]"),
    });
    expect(!result.ok && result.error.map((issue) => issue.message)).toEqual([
      "Unknown building 'press'",
      "Unknown item 'gear'",
    ]);
  });
});
