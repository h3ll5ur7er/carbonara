// Workspace manager: the use cases around the set of open documents (the tabs): create, import, export, close
// and share. Publishes `documentsChanged` whenever the set changes; editing a document is the editing manager's.
import { documentInfo, type DocumentStore, type PackStore } from "../contracts/access";
import { readDocumentFile, writeDocumentFile } from "../access/documents/files";
import { readShareLink, writeShareLink } from "../access/documents/share-links";
import { CURRENT_DOCUMENT_VERSION, type Document } from "../contracts/document";
import type { Issue } from "../contracts/issues";
import type { DocumentInfo, Events, ManagerImplementation } from "../contracts/managers";
import { ok, type Result } from "../contracts/result";
import type { EventBus } from "../utilities/events";

export interface WorkspaceDependencies {
  documents: DocumentStore;
  packs: PackStore;
  events: EventBus<Events>;
  /** Ids for new documents, and for copies of documents that are open already. */
  newId: () => string;
  /** What went wrong restoring last session's documents; none by default. */
  restoreProblems?: () => Issue[];
}

export function createWorkspaceManager({
  documents,
  packs,
  events,
  newId,
  restoreProblems = () => [],
}: WorkspaceDependencies): ManagerImplementation<"workspace"> {
  function announce(): void {
    events.publish("documentsChanged", { documents: documents.list() });
  }

  function open(document: Document): DocumentInfo {
    // Opening a file twice, or one's own share link, gives a copy that edits separately.
    const info = documentInfo(documents.put(documents.get(document.id) ? { ...document, id: newId() } : document));
    announce();
    return info;
  }

  function openResult(result: Result<Document>): Result<DocumentInfo> {
    return result.ok ? ok(open(result.value)) : result;
  }

  function documentOf(documentId: string): Document {
    const found = documents.get(documentId);
    if (!found) throw new Error(`Unknown document ${documentId}`);
    return found.document;
  }

  return {
    ping: async () => "pong",
    createDocument: async ({ name, packId }) => {
      const pack = (await packs.list()).find((candidate) => candidate.manifest.id === packId);
      if (!pack) throw new Error(`Unknown pack ${packId}`);
      return open({
        format: "carbonara",
        version: CURRENT_DOCUMENT_VERSION,
        id: newId(),
        name,
        pack: { id: packId, version: pack.manifest.version, hash: pack.hash },
        graph: { nodes: {}, edges: {} },
        blueprints: {},
        layout: {},
        settings: {},
      });
    },
    listDocuments: async () => documents.list(),
    importDocument: async ({ bytes }) => openResult(readDocumentFile(bytes)),
    exportDocument: async ({ documentId }) => writeDocumentFile(documentOf(documentId)),
    closeDocument: async ({ documentId }) => {
      if (!documents.get(documentId)) return undefined;
      documents.remove(documentId);
      announce();
      return undefined;
    },
    createShareLink: async ({ documentId }) => writeShareLink(documentOf(documentId)),
    openShareLink: async ({ fragment }) => openResult(readShareLink(fragment)),
    getRestoreProblems: async () => restoreProblems(),
  };
}
