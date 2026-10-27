// The client's read model: a mirror of the documents the client shows, kept in sync with the backend.
// Loads a snapshot with `editing.getDocument`, then applies the Immer patches of each `documentChanged` event.
// Unchanged parts keep their identity, so components that select them with the selectors below don't re-render.
import { applyPatches, enablePatches } from "immer";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { OpenDocument } from "../../contracts/access";
import type { Backend, Events } from "../../contracts/managers";
import type { Subscribable } from "../../utilities/rpc";

enablePatches();

export interface ReadModelState {
  /** The documents the client opened, by id, at the latest version it has seen. */
  documents: Record<string, OpenDocument>;
}

/** What the read model needs from the connector. */
export type ReadModelConnector = Pick<Backend, "editing"> & Subscribable<Events>;

export interface ReadModel {
  store: StoreApi<ReadModelState>;
  /** Loads the document and follows its changes until it is closed. */
  open(documentId: string): Promise<void>;
  /** Stops following the document and forgets it. */
  close(documentId: string): void;
  /** Stops listening to the backend. */
  dispose(): void;
}

export function createReadModel(connector: ReadModelConnector): ReadModel {
  const store = createStore<ReadModelState>(() => ({ documents: {} }));
  const shown = new Set<string>();

  function set(documentId: string, open: OpenDocument | undefined): void {
    store.setState(({ documents }) => {
      const next = { ...documents };
      if (open) next[documentId] = open;
      else Reflect.deleteProperty(next, documentId);
      return { documents: next };
    });
  }

  async function load(documentId: string): Promise<void> {
    const snapshot = await connector.editing.getDocument({ documentId });
    const current = store.getState().documents[documentId];
    // Closed while loading, or events already brought it further than this snapshot.
    if (!shown.has(documentId) || (current && current.version >= snapshot.version)) return;
    set(documentId, snapshot);
  }

  function close(documentId: string): void {
    shown.delete(documentId);
    set(documentId, undefined);
  }

  const stops = [
    connector.on("documentChanged", ({ documentId, version, patches }) => {
      const current = store.getState().documents[documentId];
      // Not shown (or still loading: the snapshot will include this), or already included in the snapshot.
      if (!current || version <= current.version) return;
      if (version > current.version + 1) {
        // A change went missing; patches only apply to the version they were made from.
        load(documentId).catch(() => close(documentId));
        return;
      }
      set(documentId, { document: applyPatches(current.document, patches), version });
    }),
    connector.on("documentsChanged", ({ documents }) => {
      const open = new Set(documents.map((document) => document.id));
      for (const documentId of [...shown]) if (!open.has(documentId)) close(documentId);
    }),
  ];

  return {
    store,
    async open(documentId) {
      shown.add(documentId);
      await load(documentId);
    },
    close,
    dispose() {
      for (const stop of stops) stop();
    },
  };
}

export const selectDocument = (documentId: string) => (state: ReadModelState) => state.documents[documentId]?.document;

export const selectVersion = (documentId: string) => (state: ReadModelState) => state.documents[documentId]?.version;

/** The root graph, or a blueprint's graph. */
export const selectGraph =
  (documentId: string, graph = "root") =>
  (state: ReadModelState) => {
    const document = state.documents[documentId]?.document;
    return graph === "root" ? document?.graph : document?.blueprints[graph]?.graph;
  };

/** Positions of the root graph's nodes, or a blueprint's. */
export const selectLayout =
  (documentId: string, graph = "root") =>
  (state: ReadModelState) =>
    state.documents[documentId]?.document.layout[graph];
