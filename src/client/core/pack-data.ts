// A pack's data for the parts of the shell that work with the open document's pack (quick-add, the recipe browser),
// loaded once per connector and pack through `packs.getPackData`. Works with any connector, so scenes get it too.
import { useEffect, useState } from "react";
import type { PackData } from "../../contracts/pack";
import { useConnector, type Connector } from "./connector";

const loads = new WeakMap<Connector, Map<string, Promise<PackData>>>();

function load(connector: Connector, packId: string): Promise<PackData> {
  let packs = loads.get(connector);
  if (!packs) loads.set(connector, (packs = new Map()));
  let data = packs.get(packId);
  if (!data) {
    data = connector.packs.getPackData({ packId });
    // A failed load (pack removed, backend restarting) may succeed next time.
    data.catch(() => packs.delete(packId));
    packs.set(packId, data);
  }
  return data;
}

/** The pack's data once loaded; undefined before, and without a pack. `onError` hears why a load failed. */
export function usePackDataOf(packId: string | undefined, onError?: (error: unknown) => void): PackData | undefined {
  const connector = useConnector();
  const [loaded, setLoaded] = useState<{ packId: string; data: PackData }>();
  useEffect(() => {
    if (!packId) return;
    let current = true;
    load(connector, packId).then(
      (data) => current && setLoaded({ packId, data }),
      (error: unknown) => current && onError?.(error),
    );
    return () => {
      current = false;
    };
    // The error report is for this load; a new callback doesn't load again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connector, packId]);
  return loaded && loaded.packId === packId ? loaded.data : undefined;
}
