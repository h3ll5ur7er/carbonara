// The contract tests every DocumentStore implementation passes (memory, autosaved).
import { describe, expect, it } from "vitest";
import type { DocumentStore } from "../../contracts/access";
import { Document } from "../../contracts/document";
import { exampleDocument } from "../../contracts/document.fixture";
import { RECENT_LIMIT } from "./memory";

const iron = Document.parse(exampleDocument);
const copper: Document = { ...iron, id: "doc-2", name: "Copper" };

export function testDocumentStore(name: string, create: () => DocumentStore): void {
  describe(`${name} (DocumentStore contract)`, () => {
    it("starts empty", () => {
      const store = create();
      expect(store.list()).toEqual([]);
      expect(store.get("doc-1")).toBeUndefined();
    });

    it("counts versions per document, starting at 1", () => {
      const store = create();
      expect(store.put(iron)).toEqual({ document: iron, version: 1 });
      expect(store.put({ ...iron, name: "Iron 2" }).version).toBe(2);
      expect(store.put(copper).version).toBe(1);
    });

    it("returns the latest document with its version", () => {
      const store = create();
      store.put(iron);
      const renamed = { ...iron, name: "Renamed" };
      store.put(renamed);
      expect(store.get("doc-1")).toEqual({ document: renamed, version: 2 });
    });

    it("lists the documents in the order they were opened", () => {
      const store = create();
      store.put(iron);
      store.put(copper);
      store.put(iron);
      expect(store.list()).toEqual([
        { id: "doc-1", name: "Iron", packId: "satisfactory", version: 2 },
        { id: "doc-2", name: "Copper", packId: "satisfactory", version: 1 },
      ]);
    });

    it("closes removed documents, and removing unknown ones is harmless", () => {
      const store = create();
      store.put(iron);
      store.remove("doc-1");
      store.remove("ghost");
      expect(store.get("doc-1")).toBeUndefined();
      expect(store.list()).toEqual([]);
      expect(store.recent().map(({ id }) => id)).toEqual(["doc-1"]);
    });

    it("keeps closed documents as recent, newest first, and takes them back out to reopen them", () => {
      const store = create();
      store.put(iron);
      store.put(copper);
      store.remove("doc-1");
      store.remove("doc-2");
      expect(store.recent()).toEqual([
        { id: "doc-2", name: "Copper", packId: "satisfactory", closedAt: expect.any(Number) },
        { id: "doc-1", name: "Iron", packId: "satisfactory", closedAt: expect.any(Number) },
      ]);
      expect(store.takeRecent("doc-1")).toEqual(iron);
      expect(store.takeRecent("doc-1")).toBeUndefined();
      expect(store.recent().map(({ id }) => id)).toEqual(["doc-2"]);
    });

    it(`keeps only the ${RECENT_LIMIT} documents closed last`, () => {
      const store = create();
      for (let index = 0; index <= RECENT_LIMIT; index++) {
        store.put({ ...iron, id: `doc-${index}` });
        store.remove(`doc-${index}`);
      }
      const recent = store.recent().map(({ id }) => id);
      expect(recent).toHaveLength(RECENT_LIMIT);
      expect(recent[0]).toBe(`doc-${RECENT_LIMIT}`);
      expect(recent).not.toContain("doc-0");
    });
  });
}
