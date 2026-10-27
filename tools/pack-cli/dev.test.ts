import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Result } from "../../src/contracts/result";
import { watchPack } from "./dev";
import { newPack } from "./new";

describe("carbonara-pack dev", () => {
  it("builds the pack, then rebuilds it whenever a file changes", async () => {
    const into = mkdtempSync(join(tmpdir(), "dev-"));
    const created = newPack("live", { into });
    if (!created.ok) throw new Error("not created");
    const folder = created.value.folder;
    const out = join(into, "out");

    const builds: Result<{ file: string }>[] = [];
    let next: () => void = () => {};
    const built = () => new Promise<void>((resolve) => (next = resolve));
    const controller = new AbortController();

    let first = built();
    const watching = watchPack(folder, out, {
      signal: controller.signal,
      onBuild: (result) => {
        builds.push(result);
        next();
      },
    });
    await first;
    expect(builds[0]).toEqual({ ok: true, value: { file: join(out, "live-0.1.0.cpack") } });

    first = built();
    const items = join(folder, "data", "items.yaml");
    writeFileSync(items, readFileSync(items, "utf8").replace("name: Coal", "name: Black Coal"));
    await first;
    expect(builds[1]).toMatchObject({ ok: true });

    first = built();
    writeFileSync(items, readFileSync(items, "utf8").replace("id: coal,", "id: Coal,"));
    await first;
    expect(builds[2]).toMatchObject({ ok: false, error: [{ path: ["data/items.yaml", "items", 2, "id"] }] });

    controller.abort();
    await watching;
  });
});
