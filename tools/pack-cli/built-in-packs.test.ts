import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { sha256 } from "../../src/access/packs/archive";
import { packFolder } from "./build";
import { renderBuiltInPacks } from "./built-in-packs";
import { findPackFolders, iconPacks, renderInChildProcess } from "./vite-plugin";

const importSource = (code: string) => import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(code)}`);

describe("built-in packs", () => {
  it("are the pack folders, with the template only when asked for", () => {
    const root = mkdtempSync(join(tmpdir(), "packs-"));
    for (const name of ["_template", "satisfactory", "factorio", "notes"]) mkdirSync(join(root, name));
    for (const name of ["_template", "satisfactory", "factorio"]) writeFileSync(join(root, name, "manifest.yaml"), "");
    expect(findPackFolders(root, false)).toEqual([join(root, "factorio"), join(root, "satisfactory")]);
    expect(findPackFolders(root, true)).toEqual([
      join(root, "_template"),
      join(root, "factorio"),
      join(root, "satisfactory"),
    ]);
  });

  it("become an index module and a data and a plugin module per pack", async () => {
    const result = await renderBuiltInPacks(["packs/_template"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const modules = result.value;
    expect([...modules.keys()]).toEqual([
      "virtual:built-in-packs",
      "virtual:built-in-packs/template/data",
      "virtual:built-in-packs/template/plugin",
    ]);

    const built = await packFolder("packs/_template");
    const hash = built.ok ? await sha256(built.value.archive) : "";
    expect(modules.get("virtual:built-in-packs")).toContain(`"hash":"${hash}"`);
    expect(modules.get("virtual:built-in-packs")).toContain(`"builtIn":true`);

    const data = await importSource(modules.get("virtual:built-in-packs/template/data") ?? "");
    expect(data.default.recipes).toHaveLength(12);
    const plugin = await importSource(modules.get("virtual:built-in-packs/template/plugin") ?? "");
    expect(plugin.default).toEqual({ id: "template" });
  });

  it("bring their icons only for the packs asked for, as data URLs by the path the data names them by", async () => {
    const folder = templateWithIcon();
    const without = await renderBuiltInPacks([folder]);
    expect(without.ok && [...without.value.keys()]).not.toContain("virtual:built-in-packs/template/icons");
    expect(without.ok && without.value.get("virtual:built-in-packs")).not.toContain("icons:");

    const result = await renderBuiltInPacks([folder], { icons: ["template"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const icons = await importSource(result.value.get("virtual:built-in-packs/template/icons") ?? "");
    expect(icons.default).toEqual({ "icons/coal.webp": `data:image/webp;base64,${btoa("not really a webp")}` });
    expect(result.value.get("virtual:built-in-packs")).toContain(
      `icons: async () => (await import("virtual:built-in-packs/template/icons")).default`,
    );
  });

  it("are built in a child process for the Vite plugin, with the same result", async () => {
    const inProcess = await renderBuiltInPacks(["packs/_template"]);
    const child = await renderInChildProcess(["packs/_template"]);
    expect(child).toEqual({ ok: true, value: inProcess.ok ? [...inProcess.value] : [] });
    const folder = templateWithIcon();
    const withIcons = await renderBuiltInPacks([folder], { icons: ["template"] });
    expect(await renderInChildProcess([folder], ["template"])).toEqual({
      ok: true,
      value: withIcons.ok ? [...withIcons.value] : [],
    });
  });

  it("refuse to build when a pack is broken, naming the problem", async () => {
    const root = mkdtempSync(join(tmpdir(), "packs-"));
    writeFileSync(join(root, "manifest.yaml"), "id: broken\n");
    const result = await renderBuiltInPacks([root]);
    expect(!result.ok && result.error.split("\n")[0]).toBe(`${root}: manifest.yaml:1:1: name: Required`);
  });
});

const copies: string[] = [];
afterAll(() => {
  for (const copy of copies) rmSync(copy, { recursive: true, force: true });
});

/** A copy of the template pack whose coal has an icon, as deep in the repository as its plugin's imports need. */
function templateWithIcon(): string {
  const copy = mkdtempSync(".packs-test-");
  copies.push(copy);
  const folder = join(copy, "template");
  cpSync("packs/_template", folder, { recursive: true });
  mkdirSync(join(folder, "icons"));
  writeFileSync(join(folder, "icons", "coal.webp"), "not really a webp");
  const items = join(folder, "data", "items.yaml");
  const coal = "{ id: coal, name: Coal, form: solid }";
  writeFileSync(
    items,
    readFileSync(items, "utf8").replace(coal, "{ id: coal, name: Coal, form: solid, icon: icons/coal.webp }"),
  );
  return folder;
}

describe("CARBONARA_PACK_ICONS", () => {
  it("names no pack when unset or empty", () => {
    expect(iconPacks(undefined)).toEqual([]);
    expect(iconPacks("")).toEqual([]);
  });

  it("names packs by id, separated by commas, or all", () => {
    expect(iconPacks("satisfactory, factorio")).toEqual(["satisfactory", "factorio"]);
    expect(iconPacks("all")).toEqual(["all"]);
  });
});
