// Desktop platform: durable key-value storage in the app data folder. Hides the Rust shell's `storage_*` commands
// (src/shells/tauri/src-tauri/src/storage.rs), which keep each value as JSON text in a file per key.
import type { KeyValueStorage } from "../../contracts/platform";
import type { Invoke } from "./invoke";

/** The commands this storage calls; the main thread lets the backend worker call exactly these. */
export const STORAGE_COMMANDS = ["storage_keys", "storage_get", "storage_set", "storage_delete"] as const;

/** `storage` names a folder of its own: lowercase letters, digits and dashes (`carbonara-documents`). */
export function createTauriStorage(storage: string, invoke: Invoke): KeyValueStorage {
  return {
    keys: async () => (await invoke("storage_keys", { storage })) as string[],
    get: async (key) => {
      const json = (await invoke("storage_get", { storage, key })) as string | null;
      return json === null ? undefined : JSON.parse(json);
    },
    set: async (key, value) => {
      await invoke("storage_set", { storage, key, value: JSON.stringify(value) });
    },
    delete: async (key) => {
      await invoke("storage_delete", { storage, key });
    },
  };
}
