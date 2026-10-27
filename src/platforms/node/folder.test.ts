import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readFolder } from "./folder";

describe("reading a folder", () => {
  it("returns every file below it by its relative path with forward slashes", () => {
    const folder = mkdtempSync(join(tmpdir(), "folder-"));
    mkdirSync(join(folder, "data", "deep"), { recursive: true });
    writeFileSync(join(folder, "manifest.yaml"), "id: x");
    writeFileSync(join(folder, "data", "deep", "items.yaml"), "items: []");
    mkdirSync(join(folder, "node_modules"));
    writeFileSync(join(folder, "node_modules", "skipped.js"), "");
    writeFileSync(join(folder, ".DS_Store"), "");

    const files = readFolder(folder);
    expect(Object.keys(files).sort()).toEqual(["data/deep/items.yaml", "manifest.yaml"]);
    expect(new TextDecoder().decode(files["manifest.yaml"])).toBe("id: x");
  });
});
