// The template pack's data for the canvas scenes, read straight from packs/_template so the scenes follow
// the pack. Dev and test fixture only: the app gets pack data from the packs manager.
import { parse } from "yaml";
import { PackData, PackDataFile } from "../../../contracts/pack";

const files = import.meta.glob<string>("../../../../packs/_template/data/*.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
});

function load(): PackData {
  const merged = { items: [], buildings: [], recipes: [], logistics: [], resources: [] } as Record<string, unknown[]>;
  let units: PackDataFile["units"];
  for (const name of Object.keys(files).sort()) {
    const { units: fileUnits, ...sections } = PackDataFile.parse(parse(files[name] ?? "") ?? {});
    units ??= fileUnits;
    for (const [section, entries] of Object.entries(sections)) merged[section]?.push(...(entries as unknown[]));
  }
  return PackData.parse({ ...merged, ...(units && { units }) });
}

export const templatePack: PackData = load();
