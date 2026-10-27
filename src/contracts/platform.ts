// What access components need from the machine (platform ports). Each platform (web, Tauri, Node) implements
// them, and every implementation passes the same contract tests (platform.contract.ts).

/** Durable key-value storage that survives reloads: IndexedDB in the browser. Values are structured-cloneable. */
export interface KeyValueStorage {
  keys(): Promise<string[]>;
  /** The stored value, or `undefined` when the key isn't stored. */
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  /** Deleting a key that isn't stored is harmless. */
  delete(key: string): Promise<void>;
}

/** Runs an ES module given as source text and returns its exports: a Blob URL on the web, a data URL in Node. */
export type ModuleLoader = (source: string) => Promise<Record<string, unknown>>;
