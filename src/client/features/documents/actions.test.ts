import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentInfo } from "../../../contracts/managers";
import type { FileAccess, PickedFile } from "../../../contracts/platform";
import { ok } from "../../../contracts/result";
import type { Connector } from "../../core/connector";
import type { WorkspaceModel } from "../../core/workspace-model";
import { useToasts } from "../../shell/toasts";
import { createDocumentActions, setFileAccess } from "./actions";
import { useRenaming } from "./new-document-store";

const iron: DocumentInfo = { id: "doc-1", name: "Iron" } as DocumentInfo;
const file: PickedFile = { name: "Iron.carbonara", bytes: new Uint8Array([1, 2]) };

function setUp(files: Partial<FileAccess>) {
  setFileAccess({ open: async () => undefined, save: async () => undefined, ...files });
  const importDocument = vi.fn(async () => ok(iron));
  const exportDocument = vi.fn(async () => new Uint8Array([7]));
  const apply = vi.fn(async () => ok(iron));
  const connector = { workspace: { importDocument, exportDocument }, editing: { apply } } as unknown as Connector;
  const activate = vi.fn();
  const workspace = {
    store: { getState: () => ({ documents: [iron], activeId: iron.id, loaded: true }) },
    ready: Promise.resolve(),
    activate,
  } as unknown as WorkspaceModel;
  return { actions: createDocumentActions(connector, workspace), importDocument, exportDocument, activate, apply };
}

const toastTitles = () => useToasts.getState().toasts.map((toast) => toast.title);

afterEach(() => useToasts.setState({ toasts: [] }));

describe("the File actions on a platform's files", () => {
  it("opens the factory file the platform picks and shows it", async () => {
    const open = vi.fn(async () => file);
    const { actions, importDocument, activate } = setUp({ open });
    actions.openFile();
    await vi.waitFor(() => expect(activate).toHaveBeenCalledWith("doc-1"));
    expect(open).toHaveBeenCalledWith({ description: "Carbonara factory", extensions: ["carbonara", "json"] });
    expect(importDocument).toHaveBeenCalledWith({ bytes: file.bytes });
  });

  it("opens a factory file opened with the app", async () => {
    const { actions, importDocument, activate } = setUp({});
    actions.importFile(file);
    await vi.waitFor(() => expect(activate).toHaveBeenCalledWith("doc-1"));
    expect(importDocument).toHaveBeenCalledWith({ bytes: file.bytes });
    expect(toastTitles()).toEqual(["Opened Iron"]);
  });

  it("saves the factory on screen through the platform, named after it", async () => {
    const save = vi.fn(async () => "Iron.carbonara");
    const { actions } = setUp({ save });
    actions.saveFile();
    await vi.waitFor(() => expect(toastTitles()).toEqual(["Saved Iron.carbonara"]));
    expect(save).toHaveBeenCalledWith(new Uint8Array([7]), "Iron.carbonara", {
      description: "Carbonara factory",
      extensions: ["carbonara"],
    });
  });

  it("says nothing when the person cancels saving", async () => {
    const save = vi.fn(async () => undefined);
    const { actions } = setUp({ save });
    actions.saveFile();
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    await Promise.resolve();
    expect(toastTitles()).toEqual([]);
  });
});

describe("renaming a factory", () => {
  afterEach(() => useRenaming.setState({ documentId: null }));

  it("starts editing the name of the factory on screen", () => {
    const { actions } = setUp({});
    actions.renameDocument();
    expect(useRenaming.getState().documentId).toBe("doc-1");
  });

  it("renames with one editing command, trimmed, and stops editing", async () => {
    const { actions, apply } = setUp({});
    useRenaming.setState({ documentId: "doc-1" });
    actions.commitRename("doc-1", "  Iron works ");
    expect(useRenaming.getState().documentId).toBeNull();
    expect(apply).toHaveBeenCalledWith({
      documentId: "doc-1",
      commands: [{ type: "renameDocument", name: "Iron works" }],
      label: "Rename to Iron works",
    });
  });

  it("keeps the old name when the new one is empty or the same", () => {
    const { actions, apply } = setUp({});
    actions.commitRename("doc-1", "   ");
    actions.commitRename("doc-1", "Iron");
    expect(apply).not.toHaveBeenCalled();
  });
});
