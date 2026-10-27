// The canvas's fixture scenes by name; src/client/scenes/registry.ts registers them for `?scene=<name>`.
import { buildScene, type Scene } from "./build";
import { chain } from "./chain";
import { congested } from "./congested";
import { perf, perf50k } from "./perf";
import { templatePack } from "../../scenes/template-pack";

/** Each scene's document and results, and the name the top bar shows. */
export const scenes = {
  chain: () => ({ ...buildScene(templatePack, chain), title: "Motor factory" }),
  congested: () => ({ ...buildScene(templatePack, congested), title: "Gear line" }),
  perf: () => ({ ...buildScene(templatePack, perf), title: "200 copper lines" }),
  "perf-50k": () => ({ ...buildScene(templatePack, perf50k()), title: "10,000 copper lines" }),
} satisfies Record<string, () => Scene & { title: string }>;
