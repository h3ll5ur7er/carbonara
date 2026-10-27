import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256 } from "../../src/access/packs/archive";
import { packFolder } from "./build";
import { renderBuiltInPacks } from "./built-in-packs";
import { findPackFolders, renderInChildProcess } from "./vite-plugin";

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

  it("are built in a child process for the Vite plugin, with the same result", async () => {
    const inProcess = await renderBuiltInPacks(["packs/_template"]);
    const child = await renderInChildProcess(["packs/_template"]);
    expect(child).toEqual({ ok: true, value: inProcess.ok ? [...inProcess.value] : [] });
  });

  it("refuse to build when a pack is broken, naming the problem", async () => {
    const root = mkdtempSync(join(tmpdir(), "packs-"));
    writeFileSync(join(root, "manifest.yaml"), "id: broken\n");
    const result = await renderBuiltInPacks([root]);
    expect(!result.ok && result.error.split("\n")[0]).toBe(`${root}: manifest.yaml:1:1: name: Required`);
  });
});
