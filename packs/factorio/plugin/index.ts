// The Factorio plugin: the game's production mechanics (mechanics.ts, with the game's numbers in effects.ts) and
// the importer that regenerates the pack data from the game's `--dump-data` output (importer.ts).
import { definePlugin } from "../../../src/contracts/plugin";
import { ACCEPTS, importDump } from "./importer";
import { derive, effectiveRecipe, metrics, nodeFields, recipeAvailable, settingsFields, validate } from "./mechanics";

export default definePlugin({
  id: "factorio",
  nodeFields,
  settingsFields,
  metrics,
  recipeAvailable,
  effectiveRecipe,
  validate,
  derive,
  importer: { accepts: ACCEPTS, run: importDump },
});
