// What managers need from the access components that more than one manager uses.
// Each access component implements its interface; managers get it injected by the composition root.
import type { Document } from "./document";
import type { DocumentInfo, PackInfo } from "./managers";
import type { PackData } from "./pack";
import type { Plugin } from "./plugin";

export interface OpenDocument {
  document: Document;
  /** Increases by one with every change. */
  version: number;
}

/** How an open document is listed to clients. */
export function documentInfo({ document, version }: OpenDocument): DocumentInfo {
  return { id: document.id, name: document.name, packId: document.pack.id, version };
}

/**
 * The documents open in this session (documents access). The editing and workspace managers change them;
 * the analysis manager only reads. The web store autosaves every change, so open documents survive a reload.
 */
export interface DocumentStore {
  list(): DocumentInfo[];
  get(documentId: string): OpenDocument | undefined;
  /** Stores a new or changed document and returns it with its new version. */
  put(document: Document): OpenDocument;
  remove(documentId: string): void;
}

/** A pack ready to use: its data and its plugin module, loaded. */
export interface LoadedPack {
  info: PackInfo;
  data: PackData;
  plugin: Plugin;
}

/** Built-in and installed packs (packs access). Installing and removing come with CARB-25 and CARB-27. */
export interface PackStore {
  list(): Promise<PackInfo[]>;
  get(packId: string): Promise<LoadedPack | undefined>;
}
