import { describe, expect, it } from "vitest";
import type { DocumentInfo, Events } from "../../contracts/managers";
import { createEventBus } from "../../utilities/events";
import { createWorkspaceModel, nextActive } from "./workspace-model";

const info = (id: string): DocumentInfo => ({ id, name: id.toUpperCase(), packId: "template", version: 1 });
const [a, b, c] = [info("a"), info("b"), info("c")];

describe("nextActive", () => {
  it("keeps the active document while it is open", () => {
    expect(nextActive([a, b], [a, b, c], "b")).toBe("b");
  });

  it("moves to the tab that takes a closed tab's place", () => {
    expect(nextActive([a, b, c], [a, c], "b")).toBe("c");
  });

  it("moves to the new last tab when the last tab closes", () => {
    expect(nextActive([a, b, c], [a, b], "c")).toBe("b");
  });

  it("has nothing active when nothing is open", () => {
    expect(nextActive([a], [], "a")).toBeNull();
  });

  it("activates the first document when none was active", () => {
    expect(nextActive([], [b, c], null)).toBe("b");
  });
});

function fakeConnector(initial: DocumentInfo[]) {
  const bus = createEventBus<Events>();
  return {
    bus,
    connector: {
      workspace: { listDocuments: async () => initial },
      on: bus.subscribe,
    },
  };
}

describe("createWorkspaceModel", () => {
  it("loads the open documents and activates the first", async () => {
    const { connector } = fakeConnector([a, b]);
    const model = createWorkspaceModel(connector);
    await model.ready;
    expect(model.store.getState()).toEqual({ documents: [a, b], activeId: "a", loaded: true });
  });

  it("follows documentsChanged and keeps a sensible tab active", async () => {
    const { connector, bus } = fakeConnector([a, b, c]);
    const model = createWorkspaceModel(connector);
    await model.ready;
    model.activate("b");
    bus.publish("documentsChanged", { documents: [a, c] });
    expect(model.store.getState()).toMatchObject({ documents: [a, c], activeId: "c" });
  });

  it("ignores activating a document that isn't open", async () => {
    const { connector } = fakeConnector([a]);
    const model = createWorkspaceModel(connector);
    await model.ready;
    model.activate("zzz");
    expect(model.store.getState().activeId).toBe("a");
  });

  it("can activate a document announced after the list loaded", async () => {
    const { connector, bus } = fakeConnector([a]);
    const model = createWorkspaceModel(connector);
    await model.ready;
    bus.publish("documentsChanged", { documents: [a, b] });
    model.activate("b");
    expect(model.store.getState().activeId).toBe("b");
  });

  it("stops following the backend when disposed", async () => {
    const { connector, bus } = fakeConnector([a]);
    const model = createWorkspaceModel(connector);
    await model.ready;
    model.dispose();
    bus.publish("documentsChanged", { documents: [] });
    expect(model.store.getState().documents).toEqual([a]);
  });
});
