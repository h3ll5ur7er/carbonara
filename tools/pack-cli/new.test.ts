import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { createPackLibrary } from "../../src/access/packs/library";
import type { Events } from "../../src/contracts/managers";
import { createPacksManager } from "../../src/managers/packs";
import { loadModule } from "../../src/platforms/node/module-loader";
import { createEventBus } from "../../src/utilities/events";
import { createMemoryKeyValueStorage } from "../../src/utilities/memory-key-value";
import { buildPack } from "./build";
import { newPack } from "./new";

describe("carbonara-pack new", () => {
  it("copies the template under a new id and name", () => {
    const into = mkdtempSync(join(tmpdir(), "new-"));
    const result = newPack("my-game", { into, name: "My Game" });
    const folder = join(into, "my-game");
    expect(result).toEqual({ ok: true, value: { folder } });

    const manifest = parse(readFileSync(join(folder, "manifest.yaml"), "utf8"));
    expect(manifest).toMatchObject({ id: "my-game", name: "My Game", version: "0.1.0", game: { name: "My Game" } });
    expect(readFileSync(join(folder, "manifest.yaml"), "utf8")).not.toContain("template pack");
    expect(readFileSync(join(folder, "plugin", "index.ts"), "utf8")).toContain(`definePlugin({ id: "my-game" })`);
    expect(readFileSync(join(folder, "README.md"), "utf8")).toMatch(/^# My Game\n/);
    expect(existsSync(join(folder, "data", "recipes.yaml"))).toBe(true);
    // The starter factory fits the template's data only, which the new pack replaces.
    expect(existsSync(join(folder, "starters"))).toBe(false);
  });

  it("makes a pack that builds and installs, wherever it was created", async () => {
    const into = mkdtempSync(join(tmpdir(), "new-"));
    const created = newPack("fresh", { into });
    if (!created.ok) throw new Error("not created");
    const built = await buildPack(created.value.folder, join(into, "out"));
    if (!built.ok) throw new Error(JSON.stringify(built.error));

    const library = createPackLibrary({ builtIns: [], storage: createMemoryKeyValueStorage(), loadModule });
    const packs = createPacksManager({ library, bus: createEventBus<Events>() });
    const installed = await packs.installPack({ bytes: new Uint8Array(readFileSync(built.value.file)) });
    expect(installed).toMatchObject({ ok: true, value: { manifest: { id: "fresh", name: "Fresh" } } });
    expect((await library.get("fresh"))?.plugin?.id).toBe("fresh");
  });

  it("refuses ids a pack can't have and folders that exist", () => {
    const into = mkdtempSync(join(tmpdir(), "new-"));
    expect(newPack("My Game", { into })).toMatchObject({ ok: false, error: [{ path: ["id"] }] });
    newPack("taken", { into });
    expect(newPack("taken", { into })).toEqual({
      ok: false,
      error: [{ path: [join(into, "taken")], message: "Already exists" }],
    });
  });
});
