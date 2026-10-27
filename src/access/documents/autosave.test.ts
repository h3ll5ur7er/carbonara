import { describe, expect, it } from "vitest";
import { Document } from "../../contracts/document";
import { exampleDocument } from "../../contracts/document.fixture";
import type { KeyValueStorage } from "../../contracts/platform";
import { createAutosavedDocumentStore } from "./autosave";
import { RECENT_LIMIT } from "./memory";
import { testDocumentStore } from "./store.contract";

/** A fake platform: storage in a Map, which tests can inspect, and that can be told to fail. */
function memoryStorage(
  entries = new Map<string, unknown>(),
): KeyValueStorage & { entries: Map<string, unknown>; writes: number; failing: boolean } {
  return {
    entries,
    writes: 0,
    failing: false,
    keys: async () => [...entries.keys()],
    get: async (key) => entries.get(key),
    async set(key, value) {
      this.writes++;
      if (this.failing) throw new Error("Quota exceeded");
      entries.set(key, structuredClone(value));
    },
    async delete(key) {
      entries.delete(key);
    },
  };
}

const iron = Document.parse(exampleDocument);

testDocumentStore("autosaved document store", () => createAutosavedDocumentStore(memoryStorage(), memoryStorage()));

describe("autosave", () => {
  it("saves every change, so the next session restores it", async () => {
    const storage = memoryStorage();
    const store = createAutosavedDocumentStore(storage, memoryStorage());
    store.put(iron);
    store.put({ ...iron, name: "Iron 2" });
    await store.flush();

    const next = createAutosavedDocumentStore(memoryStorage(storage.entries), memoryStorage());
    await expect(next.restore()).resolves.toEqual([]);
    expect(next.get("doc-1")).toEqual({ document: { ...iron, name: "Iron 2" }, version: 1 });
  });

  it("doesn't reopen removed documents in the next session, but remembers them as recent", async () => {
    const storage = memoryStorage();
    const recent = memoryStorage();
    const store = createAutosavedDocumentStore(storage, recent, () => 1000);
    store.put(iron);
    store.remove("doc-1");
    await store.flush();
    expect(storage.entries.size).toBe(0);

    const next = createAutosavedDocumentStore(memoryStorage(storage.entries), memoryStorage(recent.entries));
    await next.restore();
    expect(next.list()).toEqual([]);
    expect(next.recent()).toEqual([{ id: "doc-1", name: "Iron", packId: "satisfactory", closedAt: 1000 }]);
    expect(next.takeRecent("doc-1")).toEqual(iron);
  });

  it("forgets a reopened document's and the oldest recent documents' saved copies", async () => {
    const recent = memoryStorage();
    const store = createAutosavedDocumentStore(memoryStorage(), recent);
    for (let index = 0; index <= RECENT_LIMIT; index++) {
      store.put({ ...iron, id: `doc-${index}` });
      store.remove(`doc-${index}`);
    }
    store.takeRecent(`doc-${RECENT_LIMIT}`);
    await store.flush();
    expect(recent.entries.size).toBe(RECENT_LIMIT - 1);
    expect(recent.entries.has("doc-0")).toBe(false);
    expect(recent.entries.has(`doc-${RECENT_LIMIT}`)).toBe(false);
  });

  it("writes a document once for a burst of changes", async () => {
    const storage = memoryStorage();
    const store = createAutosavedDocumentStore(storage, memoryStorage());
    for (let index = 0; index < 10; index++) store.put({ ...iron, name: `Iron ${index}` });
    await store.flush();
    expect(storage.writes).toBe(1);
    expect(storage.entries.get("doc-1")).toMatchObject({ name: "Iron 9" });
  });

  it("upgrades documents saved by older versions", async () => {
    const old = {
      ...exampleDocument,
      version: 0,
      graph: { nodes: { ore: { kind: "source", item: "iron-ore", x: 1, y: 2 } }, edges: {} },
    };
    const store = createAutosavedDocumentStore(memoryStorage(new Map([["doc-1", old]])), memoryStorage());
    await store.restore();
    expect(store.get("doc-1")?.document.layout["root"]).toEqual({ ore: { x: 1, y: 2 } });
  });

  it("reports saved documents it can't load, and keeps them saved", async () => {
    const storage = memoryStorage(new Map<string, unknown>([["broken", { format: "carbonara", version: 99 }]]));
    const store = createAutosavedDocumentStore(storage, memoryStorage());
    await expect(store.restore()).resolves.toEqual([
      { path: ["broken", "version"], message: "Made with a newer Carbonara (document version 99)" },
    ]);
    expect(store.list()).toEqual([]);
    expect(storage.entries.has("broken")).toBe(true);
  });

  it("reports a failed write when flushed, and keeps saving later changes", async () => {
    const storage = memoryStorage();
    const store = createAutosavedDocumentStore(storage, memoryStorage());
    storage.failing = true;
    store.put(iron);
    await expect(store.flush()).rejects.toThrow("Quota exceeded");
    storage.failing = false;
    store.put({ ...iron, name: "Saved" });
    await store.flush();
    expect(storage.entries.get("doc-1")).toMatchObject({ name: "Saved" });
  });
});
