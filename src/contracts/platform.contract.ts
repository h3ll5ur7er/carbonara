// The contract tests every implementation of the platform ports passes (Liskov: they are interchangeable).
import { describe, expect, it } from "vitest";
import type { KeyValueStorage } from "./platform";

/** `newBacking` returns an opener for fresh, empty storage; each `open()` is a new handle on the same data. */
export function testKeyValueStorage(name: string, newBacking: () => { open: () => KeyValueStorage }): void {
  describe(`${name} (KeyValueStorage contract)`, () => {
    it("reads keys that were never stored as undefined", async () => {
      const storage = newBacking().open();
      await expect(storage.get("nothing")).resolves.toBeUndefined();
      await expect(storage.keys()).resolves.toEqual([]);
    });

    it("returns what was stored, overwriting earlier values", async () => {
      const storage = newBacking().open();
      await storage.set("doc", { name: "Iron", nested: { list: [1, 2] } });
      await storage.set("doc", { name: "Copper", nested: { list: [3] } });
      await expect(storage.get("doc")).resolves.toEqual({ name: "Copper", nested: { list: [3] } });
    });

    it("lists the stored keys", async () => {
      const storage = newBacking().open();
      await storage.set("a", 1);
      await storage.set("b", 2);
      await expect(storage.keys().then((keys) => keys.sort())).resolves.toEqual(["a", "b"]);
    });

    it("forgets deleted keys, and deleting missing keys is harmless", async () => {
      const storage = newBacking().open();
      await storage.set("a", 1);
      await storage.delete("a");
      await storage.delete("never");
      await expect(storage.get("a")).resolves.toBeUndefined();
      await expect(storage.keys()).resolves.toEqual([]);
    });

    it("keeps values for the next session", async () => {
      const backing = newBacking();
      await backing.open().set("doc", { name: "Iron" });
      await expect(backing.open().get("doc")).resolves.toEqual({ name: "Iron" });
    });
  });
}
