import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { pluginSandbox } from "./src/shells/web/plugin-sandbox.vite.ts";
import { builtInPacks, iconPacks } from "./tools/pack-cli/vite-plugin.ts";

export default defineConfig(({ mode }) => {
  // Which packs' icons the app brings: none unless asked for, until their publishers agree (CARB-31). Set in the
  // environment or a .env.local file at the repository's root (docs/Development.md).
  const icons = iconPacks(loadEnv(mode, process.cwd(), "CARBONARA_").CARBONARA_PACK_ICONS);
  return {
    root: "src/shells/web",
    publicDir: false,
    plugins: [react(), tailwindcss(), builtInPacks({ icons }), pluginSandbox()],
    build: { outDir: "../../../dist", emptyOutDir: true, target: "es2023" },
    worker: { format: "es", plugins: () => [builtInPacks({ icons }), pluginSandbox()] },
    // Scan the backend worker's imports at startup too, and the read model's (which e2e tests load on their own),
    // so the dev server doesn't discover dependencies on first use and reload the page.
    optimizeDeps: { entries: ["index.html", "backend.worker.ts", "../../client/core/read-model.ts"] },
  };
});
