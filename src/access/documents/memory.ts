// Documents access, in memory: the documents open in this session with their versions, and the few closed last.
// Hides how open documents are held; the autosaved store adds persistence on top of it.
import { documentInfo, type DocumentStore, type OpenDocument } from "../../contracts/access";
import type { Document } from "../../contracts/document";
import type { RecentDocument } from "../../contracts/managers";

/** How many closed documents are kept to reopen. */
export const RECENT_LIMIT = 10;

export interface ClosedDocument {
  document: Document;
  closedAt: number;
}

export interface MemoryDocumentStore extends DocumentStore {
  /** The recently closed documents with their contents, newest first. */
  closed(): ClosedDocument[];
  /** Puts back documents closed in an earlier session (newest first), as recent ones. */
  restoreClosed(closed: ClosedDocument[]): void;
}

/** `now` stamps closed documents (milliseconds since 1970). */
export function createMemoryDocumentStore(now: () => number = Date.now): MemoryDocumentStore {
  const documents = new Map<string, OpenDocument>();
  /** Newest first. */
  let closed: ClosedDocument[] = [];
  const without = (documentId: string) => closed.filter(({ document }) => document.id !== documentId);

  return {
    list: () => [...documents.values()].map(documentInfo),
    get: (documentId) => documents.get(documentId),
    put(document) {
      const open = { document, version: (documents.get(document.id)?.version ?? 0) + 1 };
      documents.set(document.id, open);
      return open;
    },
    remove(documentId) {
      const open = documents.get(documentId);
      if (!open) return;
      documents.delete(documentId);
      closed = [{ document: open.document, closedAt: now() }, ...without(documentId)].slice(0, RECENT_LIMIT);
    },
    recent: () => closed.map(recentDocument),
    takeRecent(documentId) {
      const found = closed.find(({ document }) => document.id === documentId);
      closed = without(documentId);
      return found?.document;
    },
    closed: () => closed,
    restoreClosed(restored) {
      const ids = new Set(restored.map(({ document }) => document.id));
      closed = [...restored, ...closed.filter(({ document }) => !ids.has(document.id))]
        .sort((a, b) => b.closedAt - a.closedAt)
        .slice(0, RECENT_LIMIT);
    },
  };
}

function recentDocument({ document, closedAt }: ClosedDocument): RecentDocument {
  return { id: document.id, name: document.name, packId: document.pack.id, closedAt };
}
