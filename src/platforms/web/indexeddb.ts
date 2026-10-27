// Web platform: durable key-value storage in the browser's IndexedDB (also available in workers).
// Hides the IndexedDB API; one database per storage, holding a single object store.
import type { KeyValueStorage } from "../../contracts/platform";

const STORE = "entries";

export function createIndexedDbStorage(databaseName: string): KeyValueStorage {
  let database: Promise<IDBDatabase> | undefined;
  const open = () =>
    (database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error(`Can't open IndexedDB ${databaseName}`));
    }));

  /** Runs one request in its own transaction and resolves with its result once the transaction commits. */
  async function run<T>(mode: IDBTransactionMode, request: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const transaction = (await open()).transaction(STORE, mode);
    const pending = request(transaction.objectStore(STORE));
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(pending.result);
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    });
  }

  return {
    keys: async () => (await run("readonly", (store) => store.getAllKeys())).map(String),
    get: (key) => run<unknown>("readonly", (store) => store.get(key)),
    set: async (key, value) => {
      await run("readwrite", (store) => store.put(value, key));
    },
    delete: async (key) => {
      await run("readwrite", (store) => store.delete(key));
    },
  };
}
