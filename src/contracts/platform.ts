// What access components and the client need from the machine (platform ports). Each platform (web, Tauri, Node)
// implements them, and every implementation passes the same contract tests (platform.contract.ts).

/**
 * Durable key-value storage that survives reloads: IndexedDB in the browser, files in the app data folder on
 * desktop. Values are JSON values (objects, arrays, strings, finite numbers, booleans, null), the part of
 * structured cloning every platform can store; keys are any strings.
 */
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

/** A kind of file a dialog offers: `{ description: "Carbonara factory", extensions: ["carbonara"] }`. */
export interface FileType {
  description: string;
  /** Without the dot. */
  extensions: string[];
}

/** A file the person picked or opened with the app: its name (without folders) and its contents. */
export interface PickedFile {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/**
 * Asking the person which file to open and where to save one: a file input and a download in the browser, native
 * dialogs on desktop. Only the client uses it, for the File commands.
 */
export interface FileAccess {
  /** The file the person picks, or `undefined` when they cancel. */
  open(type: FileType): Promise<PickedFile | undefined>;
  /**
   * Saves `bytes`, suggesting `name`. Resolves with the name it was saved under, or `undefined` when the person
   * cancels. Browsers save to the downloads folder without asking.
   */
  save(bytes: Uint8Array<ArrayBuffer>, name: string, type: FileType): Promise<string | undefined>;
}
