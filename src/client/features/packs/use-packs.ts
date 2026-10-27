// The packs the backend knows, kept current by `packsChanged`.
import { useEffect, useState } from "react";
import type { PackInfo } from "../../../contracts/managers";
import { useConnector } from "../../core/connector";

export function usePacks(): PackInfo[] | undefined {
  const connector = useConnector();
  const [packs, setPacks] = useState<PackInfo[]>();
  useEffect(() => {
    let current = true;
    const stop = connector.on("packsChanged", (event) => setPacks(event.packs));
    connector.packs
      .listPacks({})
      .then((list) => current && setPacks(list))
      .catch(() => current && setPacks([]));
    return () => {
      current = false;
      stop();
    };
  }, [connector]);
  return packs;
}
