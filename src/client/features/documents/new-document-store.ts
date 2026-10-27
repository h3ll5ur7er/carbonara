import { create } from "zustand";

/** Whether the "New factory" dialog is open; the command palette and the tab bar both open it. */
export const useNewDocumentDialog = create<{ open: boolean }>(() => ({ open: false }));

export function setNewDocumentDialogOpen(open: boolean): void {
  useNewDocumentDialog.setState({ open });
}
