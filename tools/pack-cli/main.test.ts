import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256 } from "../../src/access/packs/archive";
import { run } from "./main";

async function cli(...args: string[]): Promise<{ code: number; out: string[]; errors: string[] }> {
  const out: string[] = [];
  const errors: string[] = [];
  const code = await run(args, { log: (line) => out.push(line), error: (line) => errors.push(line) });
  return { code, out, errors };
}

describe("the carbonara-pack command", () => {
  it("explains itself when called without a command", async () => {
    const { code, errors } = await cli();
    expect(code).toBe(2);
    expect(errors.join("\n")).toContain("carbonara-pack new <id>");
  });

  it("creates, validates and builds a pack", async () => {
    const into = mkdtempSync(join(tmpdir(), "cli-"));
    const folder = join(into, "demo");
    expect(await cli("new", "demo", "--into", into, "--name", "Demo Works")).toEqual({
      code: 0,
      out: [`Created ${folder}`],
      errors: [],
    });
    expect(await cli("validate", folder)).toEqual({ code: 0, out: ["Demo Works 0.1.0 is valid"], errors: [] });

    const built = await cli("build", folder, "--out", join(into, "out"));
    const file = join(into, "out", "demo-0.1.0.cpack");
    expect(built.code).toBe(0);
    expect(built.out).toEqual([`Built ${file}`, `SHA-256 ${await sha256(readFileSync(file))}`]);
  });

  it("names the file, line and column of each problem, relative to where it runs", async () => {
    const into = mkdtempSync(join(tmpdir(), "cli-"));
    const folder = join(into, "demo");
    await cli("new", "demo", "--into", into);
    const items = join(folder, "data", "items.yaml");
    writeFileSync(items, readFileSync(items, "utf8").replace("id: coal,", "id: Coal,"));
    const { code, errors } = await cli("validate", folder);
    expect(code).toBe(1);
    expect(errors).toEqual([
      `${join(folder, "data/items.yaml")}:6:7: items[2].id: lowercase letters, digits, . _ - and an optional @variant`,
    ]);
  });

  it("imports game data with the pack's importer, then checks what it wrote", async () => {
    const into = mkdtempSync(join(tmpdir(), "cli-"));
    const folder = join(into, "game");
    await cli("new", "game", "--into", into);
    writeFileSync(
      join(folder, "plugin", "index.ts"),
      `export default {
        id: "game",
        importer: {
          accepts: ["game.json"],
          run: (files: Record<string, Uint8Array>) => ({ data: JSON.parse(new TextDecoder().decode(files["game.json"])), icons: {} }),
        },
      };`,
    );
    const game = join(into, "game.json");

    writeFileSync(game, JSON.stringify({ items: [{ id: "ore", name: "Ore", form: "solid" }] }));
    expect(await cli("import", folder, game)).toEqual({
      code: 0,
      out: [`Wrote 1 data files and 0 icons to ${folder}`],
      errors: [],
    });

    writeFileSync(game, JSON.stringify({ recipes: [{ id: "r", buildings: ["mill"], time: 1, out: { ore: 1 } }] }));
    const broken = await cli("import", folder, game);
    expect(broken.code).toBe(1);
    expect(broken.errors[0]).toMatch(/recipes\.yaml:\d+:\d+: recipes\[0\]\.buildings\[0\]: Unknown building 'mill'$/);
  });

  it("refuses unknown commands", async () => {
    expect((await cli("publish")).code).toBe(2);
  });
});
