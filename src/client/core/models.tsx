// The client's models of backend state, created once per connector and shared through React context:
// the read model (open documents' contents) and the workspace model (tabs, active document).
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { Document } from "../../contracts/document";
import type { DocumentInfo } from "../../contracts/managers";
import { useConnector } from "./connector";
import { createReadModel, selectDocument, type ReadModel } from "./read-model";
import { createWorkspaceModel, type WorkspaceModel, type WorkspaceState } from "./workspace-model";

interface ClientModels {
  readModel: ReadModel;
  workspace: WorkspaceModel;
}

const ModelsContext = createContext<ClientModels | null>(null);

/** Lives as long as the app; the models follow the backend until the page closes. */
export function ClientModelsProvider({ children }: { children: ReactNode }) {
  const connector = useConnector();
  const [models] = useState(() => ({
    readModel: createReadModel(connector),
    workspace: createWorkspaceModel(connector),
  }));
  return <ModelsContext value={models}>{children}</ModelsContext>;
}

export function useModels(): ClientModels {
  const models = useContext(ModelsContext);
  if (!models) throw new Error("useModels needs a ClientModelsProvider");
  return models;
}

export function useWorkspace<T>(selector: (state: WorkspaceState) => T): T {
  return useStore(useModels().workspace.store, selector);
}

/** The document on screen: its tab's info, and its contents once the read model has loaded them. */
export function useActiveDocument(): { info: DocumentInfo | null; document: Document | undefined } {
  const { readModel } = useModels();
  const info = useWorkspace(
    ({ documents, activeId }) => documents.find((document) => document.id === activeId) ?? null,
  );
  const id = info?.id;
  useEffect(() => {
    if (id) void readModel.open(id);
  }, [readModel, id]);
  const document = useStore(readModel.store, selectDocument(id ?? ""));
  return { info, document };
}
