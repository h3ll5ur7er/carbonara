import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { openArchive } from "./archive";

const text = (value: string) => new TextEncoder().encode(value);

describe("opening a .cpack archive", () => {
  it("returns its files and the SHA-256 of the whole archive", async () => {
    const bytes = zipSync({ "manifest.yaml": text("id: demo"), data: {}, "data/items.yaml": text("items: []") });
    const archive = await openArchive(bytes);
    expect(archive.ok).toBe(true);
    if (!archive.ok) return;
    expect(Object.keys(archive.value.files).sort()).toEqual(["data/items.yaml", "manifest.yaml"]);
    expect(new TextDecoder().decode(archive.value.files["manifest.yaml"])).toBe("id: demo");
    expect(archive.value.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes equal archives equally and different ones differently", async () => {
    const hashOf = async (bytes: Uint8Array) => {
      const archive = await openArchive(bytes);
      return archive.ok ? archive.value.hash : "";
    };
    const a = zipSync({ "a.txt": text("a") }, { mtime: "2000-01-01" });
    expect(await hashOf(a)).toBe(await hashOf(a.slice()));
    expect(await hashOf(a)).not.toBe(await hashOf(zipSync({ "a.txt": text("b") }, { mtime: "2000-01-01" })));
  });

  it("refuses bytes that aren't a zip archive", async () => {
    expect(await openArchive(text("not a zip"))).toEqual({
      ok: false,
      error: [{ path: [], message: "This file isn't a .cpack archive" }],
    });
  });
});
