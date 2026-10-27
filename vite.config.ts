import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { pluginSandbox } from "./src/shells/web/plugin-sandbox.vite.ts";
import { builtInPacks } from "./tools/pack-cli/vite-plugin.ts";

export default defineConfig({
  root: "src/shells/web",
  publicDir: false,
  plugins: [react(), tailwindcss(), builtInPacks(), pluginSandbox()],
  build: { outDir: "../../../dist", emptyOutDir: true, target: "es2023" },
  worker: { format: "es", plugins: () => [builtInPacks(), pluginSandbox()] },
  // Scan the backend worker's imports at startup too, and the read model's (which e2e tests load on their own),
  // so the dev server doesn't discover dependencies on first use and reload the page.
  optimizeDeps: { entries: ["index.html", "backend.worker.ts", "../../client/core/read-model.ts"] },
});
