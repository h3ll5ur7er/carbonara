// The Factorio plugin. For now it only regenerates the pack data from the game's `--dump-data` output;
// modules, beacons, quality, heat and fluid temperatures come with CARB-44.
import { definePlugin } from "../../../src/contracts/plugin";
import { ACCEPTS, importDump } from "./importer";

export default definePlugin({
  id: "factorio",
  importer: { accepts: ACCEPTS, run: importDump },
});
