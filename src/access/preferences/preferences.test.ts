import { describe, expect, it } from "vitest";
import { createMemoryKeyValueStorage } from "../../utilities/memory-key-value";
import { createPreferenceStore } from "./preferences";

describe("the preference store", () => {
  it("has no preferences on a fresh install", async () => {
    await expect(createPreferenceStore(createMemoryKeyValueStorage()).get()).resolves.toEqual({});
  });

  it("keeps changed preferences for the next session, one key each", async () => {
    const entries = new Map<string, unknown>();
    const store = createPreferenceStore(createMemoryKeyValueStorage(entries));
    await expect(store.update({ tour: { step: 2, finished: false } })).resolves.toEqual({
      tour: { step: 2, finished: false },
    });
    expect([...entries.keys()]).toEqual(["tour"]);
    const next = createPreferenceStore(createMemoryKeyValueStorage(entries));
    await expect(next.get()).resolves.toEqual({ tour: { step: 2, finished: false } });
  });

  it("leaves preferences that aren't named alone", async () => {
    const store = createPreferenceStore(createMemoryKeyValueStorage());
    await store.update({ tour: { step: 1, finished: true } });
    await expect(store.update({})).resolves.toEqual({ tour: { step: 1, finished: true } });
  });

  it("remembers favourite and recent recipes per pack, beside the tour", async () => {
    const entries = new Map<string, unknown>();
    const store = createPreferenceStore(createMemoryKeyValueStorage(entries));
    await store.update({ tour: { step: 0, finished: true } });
    const recipes = { factorio: { favourites: ["iron-gear-wheel"], recent: ["iron-plate", "copper-cable"] } };
    await expect(store.update({ recipes })).resolves.toEqual({ tour: { step: 0, finished: true }, recipes });
    await expect(createPreferenceStore(createMemoryKeyValueStorage(entries)).get()).resolves.toMatchObject({
      recipes,
    });
  });

  it("ignores stored values it can't read (from another version, say) and unknown keys", async () => {
    const entries = new Map<string, unknown>([
      ["tour", { step: "two" }],
      ["somethingElse", 1],
    ]);
    await expect(createPreferenceStore(createMemoryKeyValueStorage(entries)).get()).resolves.toEqual({});
  });
});
