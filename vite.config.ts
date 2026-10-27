import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { builtInPacks } from "./tools/pack-cli/built-in-packs";

export default defineConfig({
  root: "src/shells/web",
  publicDir: false,
  plugins: [react(), tailwindcss(), builtInPacks()],
  build: { outDir: "../../../dist", emptyOutDir: true, target: "es2023" },
  worker: { format: "es", plugins: () => [builtInPacks()] },
  // Scan the backend worker's imports at startup too, and the read model's (which e2e tests load on their own),
  // so the dev server doesn't discover dependencies on first use and reload the page.
  optimizeDeps: { entries: ["index.html", "backend.worker.ts", "../../client/core/read-model.ts"] },
});
