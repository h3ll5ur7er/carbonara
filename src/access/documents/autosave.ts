// Documents access with autosave: the open documents, written through to durable storage (IndexedDB on the web)
// after every change, and restored, upgraded to the current format, in the next session.
import type { DocumentStore } from "../../contracts/access";
import type { Issue } from "../../contracts/issues";
import type { KeyValueStorage } from "../../contracts/platform";
import { createMemoryDocumentStore } from "./memory";
import { upgradeDocument } from "./migrations";

export interface AutosavedDocumentStore extends DocumentStore {
  /**
   * Opens the documents saved by earlier sessions. Returns the problems with those it can't load
   * (from a newer Carbonara, say); they stay saved.
   */
  restore(): Promise<Issue[]>;
  /** Resolves once every change so far is saved; rejects with the last failed write since the previous flush. */
  flush(): Promise<void>;
}

export function createAutosavedDocumentStore(storage: KeyValueStorage): AutosavedDocumentStore {
  const memory = createMemoryDocumentStore();
  let saving = Promise.resolve();
  let failure: unknown;
  // Documents waiting for their write: a burst of changes is written once, with its latest state.
  const queued = new Set<string>();

  function save(documentId: string): void {
    if (queued.has(documentId)) return;
    queued.add(documentId);
    saving = saving
      .then(() => {
        queued.delete(documentId);
        const open = memory.get(documentId);
        return open ? storage.set(documentId, open.document) : storage.delete(documentId);
      })
      .catch((error: unknown) => {
        failure = error;
      });
  }

  return {
    list: () => memory.list(),
    get: (documentId) => memory.get(documentId),
    put(document) {
      const open = memory.put(document);
      save(document.id);
      return open;
    },
    remove(documentId) {
      memory.remove(documentId);
      save(documentId);
    },
    async restore() {
      const issues: Issue[] = [];
      for (const key of await storage.keys()) {
        const result = upgradeDocument(await storage.get(key));
        if (result.ok) memory.put(result.value);
        else issues.push(...result.error.map((issue) => ({ path: [key, ...issue.path], message: issue.message })));
      }
      return issues;
    },
    async flush() {
      await saving;
      const error = failure;
      failure = undefined;
      if (error !== undefined) throw error;
    },
  };
}
