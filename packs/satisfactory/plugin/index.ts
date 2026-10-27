// The Satisfactory plugin: the game's production mechanics (mechanics.ts) and the importer that regenerates the
// pack data from the game's Docs file (importer.ts).
import { definePlugin } from "../../../src/contracts/plugin";
import { ACCEPTS, importDocs } from "./importer";
import {
  constraints,
  derive,
  effectiveRecipe,
  metrics,
  nodeFields,
  recipeAvailable,
  settingsFields,
  validate,
} from "./mechanics";

export default definePlugin({
  id: "satisfactory",
  nodeFields,
  settingsFields,
  metrics,
  recipeAvailable,
  effectiveRecipe,
  validate,
  constraints,
  derive,
  importer: { accepts: ACCEPTS, run: importDocs },
});
