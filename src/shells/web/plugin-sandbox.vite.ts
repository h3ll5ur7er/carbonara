// Serves the plugin sandbox (plugin-sandbox.entry.ts) as the virtual module `virtual:plugin-sandbox`: its whole
// code, bundled into one ES module, as a string. The backend worker starts it from a data: URL, which gives the
// sandbox an opaque origin; that only works with a self-contained module, which the dev server doesn't serve.
// Imports only Node built-ins and esbuild, so the Vite config can load it (see tools/pack-cli/vite-plugin.ts).
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { Plugin } from "vite";

const ID = "virtual:plugin-sandbox";
const ENTRY = fileURLToPath(new URL("./plugin-sandbox.entry.ts", import.meta.url));

export function pluginSandbox(): Plugin {
  return {
    name: "carbonara:plugin-sandbox",
    resolveId: (id) => (id === ID ? `\0${ID}` : undefined),
    async load(id) {
      if (id !== `\0${ID}`) return undefined;
      const bundle = await build({
        entryPoints: [ENTRY],
        bundle: true,
        format: "esm",
        target: "es2023",
        minify: true,
        metafile: true,
        write: false,
      });
      // Editing the sandbox, the compiler or anything else it bundles rebuilds it.
      for (const input of Object.keys(bundle.metafile.inputs)) this.addWatchFile(resolve(input));
      return `export default ${JSON.stringify(bundle.outputFiles[0]?.text ?? "")};`;
    },
  };
}
