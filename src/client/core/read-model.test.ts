import fc from "fast-check";
import { enablePatches, produceWithPatches, type Draft } from "immer";
import { describe, expect, it } from "vitest";
import type { OpenDocument } from "../../contracts/access";
import { Document } from "../../contracts/document";
import { exampleDocument } from "../../contracts/document.fixture";
import type { Events } from "../../contracts/managers";
import {
  createReadModel,
  selectDocument,
  selectGraph,
  selectLayout,
  selectVersion,
  type ReadModelConnector,
} from "./read-model";

enablePatches();

/** A stand-in for the backend: one document that changes, announced the way the editing manager does. */
function fakeBackend() {
  let open: OpenDocument = { document: Document.parse(exampleDocument), version: 1 };
  const listeners = new Map<string, Set<(payload: never) => void>>();
  let snapshots = 0;

  const emit = <K extends keyof Events>(event: K, payload: Events[K]) => {
    for (const listener of listeners.get(event) ?? []) listener(payload as never);
  };

  const connector: ReadModelConnector = {
    editing: {
      getDocument: async ({ documentId }) => {
        if (documentId !== open.document.id) throw new Error(`Unknown document ${documentId}`);
        snapshots++;
        return open;
      },
      apply: () => Promise.reject(new Error("not used")),
      undo: () => Promise.reject(new Error("not used")),
      redo: () => Promise.reject(new Error("not used")),
    },
    on(event, listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener as (payload: never) => void);
      listeners.set(event, set);
      return () => set.delete(listener as (payload: never) => void);
    },
  };

  return {
    connector,
    emit,
    get open() {
      return open;
    },
    get snapshots() {
      return snapshots;
    },
    /** Changes the document; `announce: false` loses the event, as if it was missed. */
    change(recipe: (draft: Draft<Document>) => void, announce = true) {
      const [document, patches] = produceWithPatches(open.document, recipe);
      open = { document, version: open.version + 1 };
      if (announce) emit("documentChanged", { documentId: document.id, version: open.version, patches });
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the read model", () => {
  it("shows a document once it is opened", async () => {
    const backend = fakeBackend();
    const model = createReadModel(backend.connector);
    expect(selectDocument("doc-1")(model.store.getState())).toBeUndefined();
    await model.open("doc-1");
    expect(selectDocument("doc-1")(model.store.getState())).toEqual(backend.open.document);
    expect(selectVersion("doc-1")(model.store.getState())).toBe(1);
  });

  it("applies the patches of each change", async () => {
    const backend = fakeBackend();
    const model = createReadModel(backend.connector);
    await model.open("doc-1");
    backend.change((draft) => {
      draft.graph.nodes["bus"] = { kind: "junction" };
    });
    backend.change((draft) => {
      delete draft.graph.nodes["ore"];
    });
    expect(model.store.getState().documents["doc-1"]).toEqual(backend.open);
  });

  it("stays in sync through random changes", async () => {
    const change = fc.oneof(
      fc.record({ type: fc.constant("move" as const), x: fc.integer(), y: fc.integer() }),
      fc.record({ type: fc.constant("add" as const), id: fc.constantFrom("a", "b", "c") }),
      fc.record({ type: fc.constant("remove" as const), id: fc.constantFrom("a", "b", "ore", "smelt") }),
      fc.record({ type: fc.constant("rename" as const), name: fc.string() }),
    );
    await fc.assert(
      fc.asyncProperty(fc.array(change, { maxLength: 20 }), async (changes) => {
        const backend = fakeBackend();
        const model = createReadModel(backend.connector);
        await model.open("doc-1");
        for (const step of changes) {
          backend.change((draft) => {
            if (step.type === "move") (draft.layout["root"] ??= {})["ore"] = { x: step.x, y: step.y };
            else if (step.type === "add") draft.graph.nodes[step.id] = { kind: "junction" };
            else if (step.type === "remove") Reflect.deleteProperty(draft.graph.nodes, step.id);
            else draft.name = step.name;
          });
        }
        expect(model.store.getState().documents["doc-1"]).toEqual(backend.open);
        model.dispose();
      }),
    );
  });

  it("ignores changes to documents it doesn't show", () => {
    const backend = fakeBackend();
    const model = createReadModel(backend.connector);
    backend.change((draft) => {
      draft.name = "Changed";
    });
    expect(model.store.getState().documents).toEqual({});
  });

  it("ignores changes its snapshot already includes", async () => {
    const backend = fakeBackend();
    const model = createReadModel(backend.connector);
    backend.change((draft) => {
      draft.graph.nodes["bus"] = { kind: "junction" };
    }, false);
    await model.open("doc-1");
    // A late event for version 2, which the snapshot already contains: applying it again would duplicate work.
    backend.emit("documentChanged", { documentId: "doc-1", version: 2, patches: [{ op: "remove", path: ["name"] }] });
    expect(model.store.getState().documents["doc-1"]).toEqual(backend.open);
  });

  it("reloads the document when it missed a change", async () => {
    const backend = fakeBackend();
    const model = createReadModel(backend.connector);
    await model.open("doc-1");
    backend.change((draft) => {
      draft.name = "Missed";
    }, false);
    backend.change((draft) => {
      draft.graph.nodes["bus"] = { kind: "junction" };
    });
    await settle();
    expect(backend.snapshots).toBe(2);
    expect(model.store.getState().documents["doc-1"]).toEqual(backend.open);
  });

  it("drops documents that were closed", async () => {
    const backend = fakeBackend();
    const model = createReadModel(backend.connector);
    await model.open("doc-1");
    backend.emit("documentsChanged", { documents: [] });
    expect(model.store.getState().documents).toEqual({});
  });

  it("drops documents the client closes", async () => {
    const backend = fakeBackend();
    const model = createReadModel(backend.connector);
    await model.open("doc-1");
    model.close("doc-1");
    backend.change((draft) => {
      draft.name = "Changed";
    });
    expect(model.store.getState().documents).toEqual({});
  });

  it("keeps the graph object when only positions change, so graph views don't re-render", async () => {
    const backend = fakeBackend();
    const model = createReadModel(backend.connector);
    await model.open("doc-1");
    const graph = selectGraph("doc-1")(model.store.getState());
    const layout = selectLayout("doc-1")(model.store.getState());
    backend.change((draft) => {
      (draft.layout["root"] ??= {})["ore"] = { x: 50, y: 50 };
    });
    expect(selectGraph("doc-1")(model.store.getState())).toBe(graph);
    expect(selectLayout("doc-1")(model.store.getState())).not.toBe(layout);
  });

  it("selects blueprint graphs and layouts", async () => {
    const backend = fakeBackend();
    const model = createReadModel(backend.connector);
    await model.open("doc-1");
    const state = model.store.getState();
    expect(selectGraph("doc-1", "rods")(state)).toBe(backend.open.document.blueprints["rods"]?.graph);
    expect(selectLayout("doc-1", "rods")(state)).toEqual({ in: { x: 0, y: 0 } });
  });

  it("stops following the backend once disposed", async () => {
    const backend = fakeBackend();
    const model = createReadModel(backend.connector);
    await model.open("doc-1");
    model.dispose();
    backend.change((draft) => {
      draft.name = "Changed";
    });
    expect(selectDocument("doc-1")(model.store.getState())?.name).toBe("Iron");
  });
});
