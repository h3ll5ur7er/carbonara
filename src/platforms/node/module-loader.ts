// Runs an ES module from source text in Node (the pack CLI, tests): Node imports data URLs, not Blob URLs.
import type { ModuleLoader } from "../../contracts/platform";

export const loadModule: ModuleLoader = (source) =>
  import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
