import { create } from "zustand";

/** Whether the "New factory" dialog is open; the command palette and the tab bar both open it. */
export const useNewDocumentDialog = create<{ open: boolean }>(() => ({ open: false }));

export function setNewDocumentDialogOpen(open: boolean): void {
  useNewDocumentDialog.setState({ open });
}

/** The tab whose name is being edited in place, if any; double-clicking a tab or "Rename factory…" starts it. */
export const useRenaming = create<{ documentId: string | null }>(() => ({ documentId: null }));

export function setRenaming(documentId: string | null): void {
  useRenaming.setState({ documentId });
}
