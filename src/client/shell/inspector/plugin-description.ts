// The pack plugin's description for a document: its node fields, settings and metrics. The plugin runs in the
// backend (or its sandbox), never in the client, so the inspector asks the packs manager for it.
import { useEffect, useState } from "react";
import type { PluginDescription } from "../../../contracts/plugin";
import { useConnector } from "../../core/connector";

/**
 * Loads the description again when the pack or the document's plugin settings change (an unchanged document keeps
 * its settings object, so edits elsewhere don't reload it). Undefined until it's loaded or when it can't be.
 */
export function usePluginDescription(
  packId: string | undefined,
  settings: Record<string, unknown> | undefined,
): PluginDescription | undefined {
  const connector = useConnector();
  const [loaded, setLoaded] = useState<{ key: unknown[]; description: PluginDescription }>();
  useEffect(() => {
    if (!packId) return;
    let current = true;
    connector.packs
      .describePlugin({ packId, settings: settings ?? {} })
      .then((description) => current && setLoaded({ key: [packId, settings], description }))
      // A pack that can't describe itself shows no plugin fields; its solve reports what's wrong.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [connector, packId, settings]);
  return loaded && loaded.key[0] === packId ? loaded.description : undefined;
}
