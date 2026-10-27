// Documents access, in memory: the documents open in this session and their versions.
// Hides how open documents are held; the autosaved store adds persistence on top of it.
import { documentInfo, type DocumentStore, type OpenDocument } from "../../contracts/access";

export function createMemoryDocumentStore(): DocumentStore {
  const documents = new Map<string, OpenDocument>();
  return {
    list: () => [...documents.values()].map(documentInfo),
    get: (documentId) => documents.get(documentId),
    put(document) {
      const open = { document, version: (documents.get(document.id)?.version ?? 0) + 1 };
      documents.set(document.id, open);
      return open;
    },
    remove(documentId) {
      documents.delete(documentId);
    },
  };
}
