// The client's view of the workspace: the open documents (the tabs) and which one is on screen.
// The backend owns the set of open documents; which tab is active is the client's business alone.
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Backend, DocumentInfo, Events } from "../../contracts/managers";
import type { Subscribable } from "../../utilities/rpc";

export interface WorkspaceState {
  documents: DocumentInfo[];
  activeId: string | null;
  /** False until the first list arrived, so the UI doesn't flash its "nothing open" state. */
  loaded: boolean;
}

export type WorkspaceConnector = { workspace: Pick<Backend["workspace"], "listDocuments"> } & Pick<
  Subscribable<Events>,
  "on"
>;

export interface WorkspaceModel {
  store: StoreApi<WorkspaceState>;
  /** Resolves once the open documents are known. */
  ready: Promise<void>;
  activate(documentId: string): void;
  dispose(): void;
}

/** Which document is active after the open documents changed from `before` to `after`. */
export function nextActive(before: DocumentInfo[], after: DocumentInfo[], activeId: string | null): string | null {
  if (after.length === 0) return null;
  if (activeId && after.some((document) => document.id === activeId)) return activeId;
  if (activeId === null) return after[0]?.id ?? null;
  // The active tab closed: the tab that takes its place, or the new last one.
  const index = before.findIndex((document) => document.id === activeId);
  return (after[Math.min(Math.max(index, 0), after.length - 1)] ?? after[0])?.id ?? null;
}

export function createWorkspaceModel(connector: WorkspaceConnector): WorkspaceModel {
  const store = createStore<WorkspaceState>(() => ({ documents: [], activeId: null, loaded: false }));

  function update(documents: DocumentInfo[]): void {
    store.setState(({ documents: before, activeId }) => ({
      documents,
      activeId: nextActive(before, documents, activeId),
      loaded: true,
    }));
  }

  // Events can arrive before the initial list; whichever is newer wins.
  let changedBeforeList = false;
  const stop = connector.on("documentsChanged", ({ documents }) => {
    changedBeforeList = true;
    update(documents);
  });
  const ready = connector.workspace.listDocuments({}).then((documents) => {
    if (!changedBeforeList) update(documents);
  });

  return {
    store,
    ready,
    activate(documentId) {
      if (store.getState().documents.some((document) => document.id === documentId)) {
        store.setState({ activeId: documentId });
      }
    },
    dispose: stop,
  };
}
