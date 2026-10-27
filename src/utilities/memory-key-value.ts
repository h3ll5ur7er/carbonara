// A KeyValueStorage in memory: for tests at every layer (access and manager tests may not import platforms).
// Values are copied in and out, as IndexedDB's structured clone does.
import type { KeyValueStorage } from "../contracts/platform";

/** Pass the same `entries` to two storages to see what a later session would. */
export function createMemoryKeyValueStorage(entries = new Map<string, unknown>()): KeyValueStorage {
  return {
    keys: async () => [...entries.keys()],
    get: async (key) => structuredClone(entries.get(key)),
    set: async (key, value) => void entries.set(key, structuredClone(value)),
    delete: async (key) => void entries.delete(key),
  };
}
