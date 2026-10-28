import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readPackFiles } from "../../src/engines/packs/files";
import { buildPack, packFolder } from "./build";

describe("buildPack", () => {
  it("turns the template folder into a .cpack the pack engine accepts", async () => {
    const out = mkdtempSync(join(tmpdir(), "cpack-"));
    const result = await buildPack("packs/_template", out);
    expect(result).toMatchObject({ ok: true, value: { file: join(out, "template-1.1.0.cpack") } });

    const files = unzipSync(readFileSync(join(out, "template-1.1.0.cpack")));
    expect(Object.keys(files).sort()).toEqual([
      "CREDITS.md",
      "README.md",
      "data/buildings.yaml",
      "data/items.yaml",
      "data/logistics.yaml",
      "data/recipes.yaml",
      "manifest.yaml",
      "plugin/index.js",
      "starters/copper-wire.yaml",
    ]);
    const pack = readPackFiles(files);
    expect(pack.ok && pack.value.data.recipes).toHaveLength(12);
    expect(pack.ok && pack.value.data.items).toHaveLength(15);

    const plugin = new TextDecoder().decode(files["plugin/index.js"]);
    const module = await import(`data:text/javascript,${encodeURIComponent(plugin)}`);
    expect(module.default).toEqual({ id: "template" });
  });

  it("builds the same bytes from the same folder, so the hash identifies the pack", async () => {
    const first = await packFolder("packs/_template");
    const second = await packFolder("packs/_template");
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.archive).toEqual(second.value.archive);
    expect(first.value.contents.manifest.id).toBe("template");
  });

  it("refuses a folder that isn't a valid pack and writes nothing", async () => {
    const out = mkdtempSync(join(tmpdir(), "cpack-"));
    const result = await buildPack("docs", out);
    expect(result).toMatchObject({ ok: false, error: [{ path: ["manifest.yaml"], message: "Missing file" }] });
  });
});
