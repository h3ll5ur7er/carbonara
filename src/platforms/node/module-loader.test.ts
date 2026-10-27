import { describe, expect, it } from "vitest";
import { loadModule } from "./module-loader";

describe("loading a module from source in Node", () => {
  it("returns the module's exports", async () => {
    const module = await loadModule("export default { id: 'demo' }; export const answer = 42;");
    expect(module.default).toEqual({ id: "demo" });
    expect(module.answer).toBe(42);
  });

  it("rejects source that isn't a module", async () => {
    await expect(loadModule("export default {")).rejects.toThrow();
  });
});
