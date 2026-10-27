// The canvas's fixture scenes by name, as `?scene=<name>` shows them in development.
import { buildScene, type Scene } from "./build";
import { chain } from "./chain";
import { congested } from "./congested";
import { templatePack } from "./template-pack";

export const scenes: Record<string, () => Scene> = {
  chain: () => buildScene(templatePack, chain),
  congested: () => buildScene(templatePack, congested),
};
