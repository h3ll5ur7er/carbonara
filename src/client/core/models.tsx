// The client's models of backend state, created once per connector and shared through React context:
// the read model (open documents' contents) and the workspace model (tabs, active document).
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { Document } from "../../contracts/document";
import type { DocumentInfo } from "../../contracts/managers";
import type { PackData } from "../../contracts/pack";
import type { AnalysisResults } from "../../contracts/results";
import { useConnector, type Connector } from "./connector";
import { createReadModel, selectDocument, type ReadModel } from "./read-model";
import { createResultsModel, type ResultsModel } from "./results-model";
import { createWorkspaceModel, type WorkspaceModel, type WorkspaceState } from "./workspace-model";

interface ClientModels {
  readModel: ReadModel;
  workspace: WorkspaceModel;
  results: ResultsModel;
  /** Pack data by pack id, loaded once per session (packs change rarely and are large). */
  packData: (packId: string) => Promise<PackData>;
}

const ModelsContext = createContext<ClientModels | null>(null);

/** Lives as long as the app; the models follow the backend until the page closes. */
export function ClientModelsProvider({ children }: { children: ReactNode }) {
  const connector = useConnector();
  const [models] = useState(() => ({
    readModel: createReadModel(connector),
    workspace: createWorkspaceModel(connector),
    results: createResultsModel(connector),
    packData: packDataLoader(connector),
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

export interface ActiveDocument {
  info: DocumentInfo | null;
  /** The contents, once the read model has loaded them. */
  document: Document | undefined;
  /** The latest solve, once there is one. */
  results: AnalysisResults | undefined;
  /** The document's pack data, once loaded. */
  packData: PackData | undefined;
}

/** The document on screen, with what's needed to draw it. */
export function useActiveDocument(): ActiveDocument {
  const { readModel, results: resultsModel } = useModels();
  const info = useWorkspace(
    ({ documents, activeId }) => documents.find((document) => document.id === activeId) ?? null,
  );
  const id = info?.id;
  useEffect(() => {
    if (!id) return;
    void readModel.open(id);
    void resultsModel.watch(id);
  }, [readModel, resultsModel, id]);
  const document = useStore(readModel.store, selectDocument(id ?? ""));
  const results = useStore(resultsModel.store, (state) => (id ? state.results[id] : undefined));
  const packData = usePackData(info?.packId);
  return { info, document, results, packData };
}

export function usePackData(packId: string | undefined): PackData | undefined {
  const { packData: load } = useModels();
  const [loaded, setLoaded] = useState<{ packId: string; data: PackData }>();
  useEffect(() => {
    if (!packId) return;
    let current = true;
    load(packId)
      .then((data) => current && setLoaded({ packId, data }))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [load, packId]);
  return loaded && loaded.packId === packId ? loaded.data : undefined;
}

function packDataLoader(connector: Connector): (packId: string) => Promise<PackData> {
  const cache = new Map<string, Promise<PackData>>();
  return (packId) => {
    let data = cache.get(packId);
    if (!data) {
      data = connector.packs.getPackData({ packId });
      // A failed load (pack removed, backend restarting) may succeed next time.
      data.catch(() => cache.delete(packId));
      cache.set(packId, data);
    }
    return data;
  };
}
