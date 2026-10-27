// The document workflows end to end, in the browser: a real backend worker with IndexedDB autosave, and the
// client's connector and read model. There's no tabs UI yet, so the tests drive the connector directly.
import { expect, test, type Page } from "@playwright/test";
import type { Connector } from "../src/client/core/connector";
import type { ReadModel } from "../src/client/core/read-model";
import { exampleDocument } from "../src/contracts/document.fixture";

declare global {
  interface Window {
    backend: Connector;
    readModel: ReadModel;
    documentsChanged: string[][];
    file(document: unknown): Uint8Array<ArrayBuffer>;
  }
}

/** Opens the app and connects a client of our own to a fresh backend worker. */
async function connect(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(async (root) => {
    // Vite serves files outside its root under /@fs/.
    const load = (path: string): Promise<unknown> => import(/* @vite-ignore */ `/@fs${root}/src/client/core/${path}`);
    const { createConnector } = (await load("connector.tsx")) as typeof import("../src/client/core/connector");
    const { createReadModel } = (await load("read-model.ts")) as typeof import("../src/client/core/read-model");
    const worker = new Worker(new URL("/backend.worker.ts", location.href), { type: "module" });
    const backend = createConnector({
      send: (message) => worker.postMessage(message),
      listen: (listener) => worker.addEventListener("message", (event) => listener(event.data)),
    });
    window.backend = backend;
    window.readModel = createReadModel(backend);
    window.documentsChanged = [];
    backend.on("documentsChanged", ({ documents }) => window.documentsChanged.push(documents.map(({ id }) => id)));
    window.file = (document) => new TextEncoder().encode(JSON.stringify(document));
  }, process.cwd());
}

/** The keys in the autosave database, read straight from IndexedDB. */
function autosaved(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open("carbonara-documents");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const keys = request.result.transaction("entries").objectStore("entries").getAllKeys();
          keys.onsuccess = () => resolve(keys.result.map(String).sort());
          request.result.close();
        };
      }),
  );
}

test("open documents are listed like tabs and survive a reload, closed ones don't", async ({ page }) => {
  await connect(page);
  await page.evaluate(async (iron) => {
    await window.backend.workspace.importDocument({ bytes: window.file(iron) });
    await window.backend.workspace.importDocument({ bytes: window.file({ ...iron, id: "doc-2", name: "Copper" }) });
    await window.backend.workspace.closeDocument({ documentId: "doc-1" });
  }, exampleDocument);
  expect(await page.evaluate(() => window.documentsChanged)).toEqual([["doc-1"], ["doc-1", "doc-2"], ["doc-2"]]);
  await expect.poll(() => autosaved(page)).toEqual(["doc-2"]);

  await page.reload();
  await connect(page);
  const tabs = await page.evaluate(() => window.backend.workspace.listDocuments({}));
  expect(tabs).toEqual([{ id: "doc-2", name: "Copper", packId: "satisfactory", version: 1 }]);
});

test("a share link opens a copy of the document", async ({ page }) => {
  await connect(page);
  const { fragment, copy } = await page.evaluate(async (iron) => {
    const { backend } = window;
    await backend.workspace.importDocument({ bytes: window.file(iron) });
    const fragment = await backend.workspace.createShareLink({ documentId: "doc-1" });
    const opened = await backend.workspace.openShareLink({ fragment });
    if (!opened.ok) throw new Error("The share link didn't open");
    return { fragment, copy: (await backend.editing.getDocument({ documentId: opened.value.id })).document };
  }, exampleDocument);
  expect(fragment).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(copy).toEqual({ ...exampleDocument, id: copy.id });
  expect(copy.id).not.toBe("doc-1");
});

test("the client's read model follows edits, undo and redo", async ({ page }) => {
  await connect(page);
  const { mirrored, actual } = await page.evaluate(async (iron) => {
    const { backend, readModel } = window;
    await backend.workspace.importDocument({ bytes: window.file(iron) });
    await readModel.open("doc-1");
    const documentId = "doc-1";
    await backend.editing.apply({ documentId, commands: [{ type: "moveNodes", positions: { ore: { x: 5, y: 5 } } }] });
    await backend.editing.apply({
      documentId,
      commands: [{ type: "addNode", node: { kind: "junction" }, position: { x: 0, y: 0 } }],
    });
    await backend.editing.apply({ documentId, commands: [{ type: "removeNodes", ids: ["smelt"] }] });
    await backend.editing.undo({ documentId });
    await backend.editing.undo({ documentId });
    await backend.editing.redo({ documentId });
    const actual = await backend.editing.getDocument({ documentId });
    return { mirrored: readModel.store.getState().documents[documentId], actual };
  }, exampleDocument);
  expect(actual.version).toBe(7);
  expect(mirrored).toEqual(actual);
});
