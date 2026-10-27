// The Satisfactory plugin. For now it only regenerates the pack data from the game's Docs file;
// the game's mechanics (clock speed, power shards, somersloops, the power curve) come with CARB-43.
import { definePlugin } from "../../../src/contracts/plugin";
import { ACCEPTS, importDocs } from "./importer";

export default definePlugin({
  id: "satisfactory",
  importer: { accepts: ACCEPTS, run: importDocs },
});
