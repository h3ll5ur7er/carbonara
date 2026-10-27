// Documents access with autosave: the open documents, written through to durable storage (IndexedDB on the web)
// after every change, and restored, upgraded to the current format, in the next session. Closed documents move to
// a second storage, the recent ones, until newer closes push them out.
import type { DocumentStore } from "../../contracts/access";
import type { Issue } from "../../contracts/issues";
import type { KeyValueStorage } from "../../contracts/platform";
import { createMemoryDocumentStore, type ClosedDocument } from "./memory";
import { upgradeDocument } from "./migrations";

export interface AutosavedDocumentStore extends DocumentStore {
  /**
   * Opens the documents saved by earlier sessions, and lists those closed there as recent. Returns the problems
   * with the open ones it can't load (from a newer Carbonara, say); they stay saved.
   */
  restore(): Promise<Issue[]>;
  /** Resolves once every change so far is saved; rejects with the last failed write since the previous flush. */
  flush(): Promise<void>;
}

/**
 * `storage` holds the open documents by id, `recentStorage` the recently closed ones (`{ closedAt, document }`).
 * `now` stamps closed documents.
 */
export function createAutosavedDocumentStore(
  storage: KeyValueStorage,
  recentStorage: KeyValueStorage,
  now: () => number = Date.now,
): AutosavedDocumentStore {
  const memory = createMemoryDocumentStore(now);
  let saving = Promise.resolve();
  let failure: unknown;
  // Documents waiting for their write: a burst of changes is written once, with its latest state.
  const queued = new Set<string>();

  function enqueue(write: () => Promise<void>): void {
    saving = saving.then(write).catch((error: unknown) => {
      failure = error;
    });
  }

  function save(documentId: string): void {
    if (queued.has(documentId)) return;
    queued.add(documentId);
    enqueue(() => {
      queued.delete(documentId);
      const open = memory.get(documentId);
      return open ? storage.set(documentId, open.document) : storage.delete(documentId);
    });
  }

  /** Writes the recent list as it is now: each closed document once, and nothing that has left the list. */
  function saveRecent(before: ClosedDocument[]): void {
    const after = memory.closed();
    const kept = new Set(after.map(({ document }) => document.id));
    const written = new Set(before);
    enqueue(async () => {
      for (const { document } of before) if (!kept.has(document.id)) await recentStorage.delete(document.id);
      for (const entry of after) if (!written.has(entry)) await recentStorage.set(entry.document.id, entry);
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
      const before = memory.closed();
      memory.remove(documentId);
      save(documentId);
      saveRecent(before);
    },
    recent: () => memory.recent(),
    takeRecent(documentId) {
      const before = memory.closed();
      const document = memory.takeRecent(documentId);
      saveRecent(before);
      return document;
    },
    async restore() {
      const issues: Issue[] = [];
      for (const key of await storage.keys()) {
        const result = upgradeDocument(await storage.get(key));
        if (result.ok) memory.put(result.value);
        else issues.push(...result.error.map((issue) => ({ path: [key, ...issue.path], message: issue.message })));
      }
      memory.restoreClosed(await readClosed(recentStorage));
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

/** The recent documents saved by earlier sessions; ones that can't be loaded any more are left out. */
async function readClosed(storage: KeyValueStorage): Promise<ClosedDocument[]> {
  const closed: ClosedDocument[] = [];
  for (const key of await storage.keys()) {
    const entry = (await storage.get(key)) as Partial<ClosedDocument> | undefined;
    const document = upgradeDocument(entry?.document);
    if (document.ok && typeof entry?.closedAt === "number") {
      closed.push({ document: document.value, closedAt: entry.closedAt });
    }
  }
  return closed.sort((a, b) => b.closedAt - a.closedAt);
}
