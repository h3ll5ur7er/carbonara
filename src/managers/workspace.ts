// Workspace manager: the use cases around the set of open documents (the tabs): create (empty or from a pack's
// starter factory), import, export, close, reopen recent ones and share; and the person's preferences. Publishes
// `documentsChanged` whenever the set (or a name in it) changes; editing a document is the editing manager's.
import { documentInfo, type DocumentStore, type PackStore } from "../contracts/access";
import { readDocumentFile, writeDocumentFile } from "../access/documents/files";
import { readShareLink, writeShareLink } from "../access/documents/share-links";
import type { PreferenceStore } from "../access/preferences/preferences";
import { CURRENT_DOCUMENT_VERSION, type Document } from "../contracts/document";
import type { Issue } from "../contracts/issues";
import type { DocumentInfo, Events, ManagerImplementation } from "../contracts/managers";
import { fail, ok, type Result } from "../contracts/result";
import type { EventBus } from "../utilities/events";

export interface WorkspaceDependencies {
  documents: DocumentStore;
  packs: PackStore;
  preferences: PreferenceStore;
  events: EventBus<Events>;
  /** Ids for new documents, and for copies of documents that are open already. */
  newId: () => string;
  /** What went wrong restoring last session's documents; none by default. */
  restoreProblems?: () => Issue[];
}

export function createWorkspaceManager({
  documents,
  packs,
  preferences,
  events,
  newId,
  restoreProblems = () => [],
}: WorkspaceDependencies): ManagerImplementation<"workspace"> {
  function announce(): void {
    events.publish("documentsChanged", { documents: documents.list() });
  }

  // The tabs show names: a rename (or its undo) in the editing manager changes the list.
  events.subscribe("documentChanged", ({ patches }) => {
    if (patches.some(({ path }) => path.length === 1 && path[0] === "name")) announce();
  });

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
    createDocument: async ({ name, packId, starter }) => {
      const pack = (await packs.list()).find((candidate) => candidate.manifest.id === packId);
      if (!pack) throw new Error(`Unknown pack ${packId}`);
      const from =
        starter === undefined ? undefined : (await packs.get(packId))?.data.starters.find(({ id }) => id === starter);
      if (starter !== undefined && !from) throw new Error(`${pack.manifest.name} has no starter factory ${starter}`);
      // A copy: the document is edited, the pack's starter stays as it is.
      const contents = structuredClone({
        graph: from?.graph ?? { nodes: {}, edges: {} },
        blueprints: from?.blueprints ?? {},
        layout: from?.layout ?? {},
        settings: from?.settings ?? {},
      });
      return open({
        format: "carbonara",
        version: CURRENT_DOCUMENT_VERSION,
        id: newId(),
        name,
        pack: { id: packId, version: pack.manifest.version, hash: pack.hash },
        ...contents,
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
    listRecent: async () => documents.recent(),
    openRecent: async ({ documentId }) => {
      const document = documents.takeRecent(documentId);
      if (!document) return fail([{ path: ["documentId"], message: "That factory isn't among the recent ones" }]);
      return ok(open(document));
    },
    createShareLink: async ({ documentId }) => writeShareLink(documentOf(documentId)),
    openShareLink: async ({ fragment }) => openResult(readShareLink(fragment)),
    getRestoreProblems: async () => restoreProblems(),
    getPreferences: () => preferences.get(),
    setPreferences: ({ preferences: changes }) => preferences.update(changes),
  };
}
