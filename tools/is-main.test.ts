import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isMain } from "./is-main";

describe("isMain", () => {
  it("knows the module Node was started with by its URL", () => {
    const script = "/work/tools/schema.ts";
    expect(isMain(pathToFileURL(script).href, script)).toBe(true);
    expect(isMain(pathToFileURL("/work/tools/other.ts").href, script)).toBe(false);
  });

  it("matches paths that need escaping in a URL", () => {
    const script = "/work/my tools/schema #2.ts";
    expect(isMain(pathToFileURL(script).href, script)).toBe(true);
  });

  it("is false without a script (imported from a REPL or a test)", () => {
    expect(isMain("file:///work/tools/schema.ts", undefined)).toBe(false);
  });
});
