// For tests: the Rust shell's `storage_*` commands as it answers them, over JSON text in memory. The Rust store
// itself passes the KeyValueStorage contract's cases in src/shells/tauri/src-tauri/src/storage.rs.
import type { Invoke } from "./invoke";

export function fakeStorageCommands(): Invoke {
  const storages = new Map<string, Map<string, string>>();
  return async (command, args = {}) => {
    const { storage, key, value } = args as { storage: string; key: string; value: string };
    // As the shell does: storage names become folder names.
    if (!/^[a-z0-9-]+$/.test(storage)) throw `Not a storage name: ${storage}`;
    const entries = storages.get(storage) ?? new Map<string, string>();
    storages.set(storage, entries);
    switch (command) {
      case "storage_keys":
        return [...entries.keys()];
      case "storage_get":
        return entries.get(key) ?? null;
      case "storage_set":
        entries.set(key, value);
        return null;
      case "storage_delete":
        entries.delete(key);
        return null;
    }
    throw `Unknown command ${command}`;
  };
}
