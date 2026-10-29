// The open pack's icons for everything that draws an item chip or a building tile, through context: loaded once per
// connector and pack through `packs.getPackIcons`. A pack has icons only when the build brings them (CARB-31,
// docs/Development.md, Pack icons); without, chips and tiles draw their monograms.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PackData } from "../../contracts/pack";
import { useConnector, type Connector } from "./connector";

export interface PackIcons {
  /** Icon URLs by item id. */
  items: ReadonlyMap<string, string>;
  /** Icon URLs by building id. */
  buildings: ReadonlyMap<string, string>;
}

const NONE: PackIcons = { items: new Map(), buildings: new Map() };
const PackIconsContext = createContext<PackIcons>(NONE);
export const PackIconsProvider = PackIconsContext.Provider;

/** The icon URL of each item and building of the pack that has one, by id. */
export function iconsOf(pack: PackData | undefined, urls: Readonly<Record<string, string>>): PackIcons {
  if (!pack) return NONE;
  const byId = (entries: { id: string; icon?: string | undefined }[]) =>
    new Map(entries.flatMap(({ id, icon }) => (icon && urls[icon] ? [[id, urls[icon]] as const] : [])));
  return { items: byId(pack.items), buildings: byId(pack.buildings) };
}

const loads = new WeakMap<Connector, Map<string, Promise<Record<string, string>>>>();

function load(connector: Connector, packId: string): Promise<Record<string, string>> {
  let packs = loads.get(connector);
  if (!packs) loads.set(connector, (packs = new Map()));
  let icons = packs.get(packId);
  if (!icons) {
    // No icons is a fine answer (a backend without them, as in scenes): the monograms stand in.
    icons = connector.packs.getPackIcons({ packId }).catch(() => ({}));
    packs.set(packId, icons);
  }
  return icons;
}

/** The icons of the pack whose data this is; none until they load. */
export function usePackIconsOf(packId: string | undefined, pack: PackData | undefined): PackIcons {
  const connector = useConnector();
  const [loaded, setLoaded] = useState<{ packId: string; urls: Record<string, string> }>();
  useEffect(() => {
    if (!packId) return;
    let current = true;
    void load(connector, packId).then((urls) => current && setLoaded({ packId, urls }));
    return () => {
      current = false;
    };
  }, [connector, packId]);
  const urls = loaded && loaded.packId === packId ? loaded.urls : undefined;
  return useMemo(() => (urls ? iconsOf(pack, urls) : NONE), [pack, urls]);
}

/** The item's icon URL, if its pack has one. */
export function useItemIcon(itemId: string): string | undefined {
  return useContext(PackIconsContext).items.get(itemId);
}

/** The building's icon URL, if its pack has one. */
export function useBuildingIcon(buildingId: string): string | undefined {
  return useContext(PackIconsContext).buildings.get(buildingId);
}
