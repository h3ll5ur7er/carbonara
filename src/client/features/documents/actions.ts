// What the File commands do: new, open, save, share and close the factory on screen. The command registry
// is built once at start-up, so its commands call through `documentActions`, which the live app wires up.
import type { Connector } from "../../core/connector";
import type { WorkspaceModel } from "../../core/workspace-model";
import { errorMessage, toast } from "../../shell/toasts";
import { fileNameFor, shareUrl } from "./links";
import { setNewDocumentDialogOpen } from "./new-document-store";

export interface DocumentActions {
  newDocument(): void;
  openFile(): void;
  saveFile(): void;
  copyShareLink(): void;
  /** Closes the given document, or the one on screen. */
  closeDocument(documentId?: string): void;
}

let current: DocumentActions | null = null;

export function setDocumentActions(actions: DocumentActions | null): void {
  current = actions;
}

/** Safe to call before the app is wired up (in scenes): then nothing happens. */
export const documentActions: DocumentActions = {
  newDocument: () => current?.newDocument(),
  openFile: () => current?.openFile(),
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

  return {
    newDocument: () => setNewDocumentDialogOpen(true),
    openFile() {
      void pickFile(".carbonara,.json,application/json")
        .then(async (file) => {
          if (!file) return;
          const result = await connector.workspace.importDocument({ bytes: new Uint8Array(await file.arrayBuffer()) });
          if (result.ok) {
            workspace.activate(result.value.id);
            toast({ title: `Opened ${result.value.name}`, tone: "success" });
          } else {
            toast({
              title: `Couldn't open ${file.name}`,
              description: result.error.map((issue) => issue.message).join("; "),
              tone: "error",
            });
          }
        })
        .catch(failed("Couldn't open the file"));
    },
    saveFile() {
      const document = active();
      if (!document) return;
      connector.workspace
        .exportDocument({ documentId: document.id })
        .then((bytes) => {
          const name = fileNameFor(document.name);
          download(new Blob([bytes], { type: "application/octet-stream" }), name);
          toast({ title: `Saved ${name}`, tone: "success" });
        })
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
