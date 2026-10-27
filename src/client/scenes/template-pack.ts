// The template pack's data for scenes, read from its own files so scenes never drift from the pack.
import { parse } from "yaml";
import { PackData } from "../../contracts/pack";
import buildings from "../../../packs/_template/data/buildings.yaml?raw";
import items from "../../../packs/_template/data/items.yaml?raw";
import logistics from "../../../packs/_template/data/logistics.yaml?raw";
import recipes from "../../../packs/_template/data/recipes.yaml?raw";

/** Each data file holds different sections, so merging them is a plain spread. */
export const templatePack: PackData = PackData.parse(
  Object.assign({}, ...[buildings, items, logistics, recipes].map((file) => parse(file) as object)),
);
