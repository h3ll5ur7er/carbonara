// What the File commands do: new, open, save, share and close the factory on screen. The command registry
// is built once at start-up, so its commands call through `documentActions`, which the live app wires up.
// Files are picked and saved through the platform's `FileAccess`: the browser's by default, native dialogs on
// desktop (the shell calls `setFileAccess`).
import type { FileAccess, FileType, PickedFile } from "../../../contracts/platform";
import type { Connector } from "../../core/connector";
import type { WorkspaceModel } from "../../core/workspace-model";
import { errorMessage, toast } from "../../shell/toasts";
import { fileNameFor, shareUrl } from "./links";
import { setNewDocumentDialogOpen } from "./new-document-store";

export interface DocumentActions {
  newDocument(): void;
  openFile(): void;
  /** Opens a factory file that arrived another way: opened with the desktop app. */
  importFile(file: PickedFile): void;
  saveFile(): void;
  copyShareLink(): void;
  /** Closes the given document, or the one on screen. */
  closeDocument(documentId?: string): void;
}

let current: DocumentActions | null = null;

const openableFiles: FileType = { description: "Carbonara factory", extensions: ["carbonara", "json"] };
const savedFiles: FileType = { description: "Carbonara factory", extensions: ["carbonara"] };

/** In the browser: a file input to open, a download to save. */
const browserFiles: FileAccess = {
  async open(type) {
    const file = await pickFile(type.extensions.map((extension) => `.${extension}`).join(","));
    return file && { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
  },
  async save(bytes, name) {
    download(new Blob([bytes], { type: "application/octet-stream" }), name);
    return name;
  },
};

let files = browserFiles;

/** The shell's file dialogs; call before the app starts. */
export function setFileAccess(access: FileAccess): void {
  files = access;
}

export function setDocumentActions(actions: DocumentActions | null): void {
  current = actions;
}

/** Safe to call before the app is wired up (in scenes): then nothing happens. */
export const documentActions: DocumentActions = {
  newDocument: () => current?.newDocument(),
  openFile: () => current?.openFile(),
  importFile: (file) => current?.importFile(file),
  saveFile: () => current?.saveFile(),
  copyShareLink: () => current?.copyShareLink(),
  closeDocument: (documentId) => current?.closeDocument(documentId),
};

export function createDocumentActions(connector: Connector, workspace: WorkspaceModel): DocumentActions {
  const active = () => {
    const { documents, activeId } = workspace.store.getState();
    const document = documents.find((candidate) => candidate.id === activeId);
    if (!document) toast({ title: "No factory is open" });
    return document;
  };
  const failed = (title: string) => (error: unknown) =>
    toast({ title, description: errorMessage(error), tone: "error" });

  async function importFile(file: PickedFile): Promise<void> {
    const result = await connector.workspace.importDocument({ bytes: file.bytes });
    if (result.ok) {
      // A file opened with the desktop app can arrive while the tabs are still loading.
      await workspace.ready;
      workspace.activate(result.value.id);
      toast({ title: `Opened ${result.value.name}`, tone: "success" });
    } else {
      toast({
        title: `Couldn't open ${file.name}`,
        description: result.error.map((issue) => issue.message).join("; "),
        tone: "error",
      });
    }
  }

  return {
    newDocument: () => setNewDocumentDialogOpen(true),
    openFile() {
      files
        .open(openableFiles)
        .then((file) => file && importFile(file))
        .catch(failed("Couldn't open the file"));
    },
    importFile: (file) => void importFile(file).catch(failed(`Couldn't open ${file.name}`)),
    saveFile() {
      const document = active();
      if (!document) return;
      connector.workspace
        .exportDocument({ documentId: document.id })
        .then((bytes) => files.save(bytes, fileNameFor(document.name), savedFiles))
        .then((saved) => saved && toast({ title: `Saved ${saved}`, tone: "success" }))
        .catch(failed("Couldn't save the factory"));
    },
    copyShareLink() {
      const document = active();
      if (!document) return;
      connector.workspace
        .createShareLink({ documentId: document.id })
        .then((fragment) => navigator.clipboard.writeText(shareUrl(location.href, fragment)))
        .then(() =>
          toast({
            title: "Share link copied",
            description: "Anyone with the link opens their own copy. Nothing is uploaded.",
            tone: "success",
          }),
        )
        .catch(failed("Couldn't copy the share link"));
    },
    closeDocument(documentId) {
      const id = documentId ?? active()?.id;
      if (id) connector.workspace.closeDocument({ documentId: id }).catch(failed("Couldn't close the factory"));
    },
  };
}

/** Asks for one file; resolves with nothing when the person cancels. */
function pickFile(accept: string): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept });
    input.addEventListener("change", () => resolve(input.files?.[0]));
    input.addEventListener("cancel", () => resolve(undefined));
    input.click();
  });
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
