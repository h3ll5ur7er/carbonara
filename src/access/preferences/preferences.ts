// Preferences access: what Carbonara remembers about the person across sessions, in the platform's key-value
// storage (IndexedDB on the web, the app data folder on desktop). Hides how preferences are stored: one key each.
import type { KeyValueStorage } from "../../contracts/platform";
import { Preferences } from "../../contracts/preferences";

export interface PreferenceStore {
  get(): Promise<Preferences>;
  /** Stores the preferences given and returns them all; the ones not named stay as they are. */
  update(changes: Preferences): Promise<Preferences>;
}

const KEYS = Object.keys(Preferences.shape) as (keyof Preferences)[];

export function createPreferenceStore(storage: KeyValueStorage): PreferenceStore {
  async function get(): Promise<Preferences> {
    const preferences: Preferences = {};
    for (const key of KEYS) {
      // Each key on its own, so one unreadable value doesn't lose the others.
      const parsed = Preferences.shape[key].safeParse(await storage.get(key));
      if (parsed.success && parsed.data !== undefined) Object.assign(preferences, { [key]: parsed.data });
    }
    return preferences;
  }

  return {
    get,
    async update(changes) {
      for (const key of KEYS) if (changes[key] !== undefined) await storage.set(key, changes[key]);
      return get();
    },
  };
}
