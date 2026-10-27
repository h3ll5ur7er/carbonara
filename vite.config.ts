import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/shells/web",
  publicDir: false,
  plugins: [react(), tailwindcss()],
  build: { outDir: "../../../dist", emptyOutDir: true, target: "es2023" },
  worker: { format: "es" },
});
