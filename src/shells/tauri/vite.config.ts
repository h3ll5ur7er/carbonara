// The desktop app's web build: the web build's configuration (vite.config.ts at the root) with this shell's
// entry, built into dist/desktop for Tauri (src-tauri/tauri.conf.json, frontendDist).
import { defineConfig, mergeConfig } from "vite";
import web from "../../../vite.config.ts";

export default defineConfig((env) =>
  mergeConfig(web(env), {
    root: import.meta.dirname,
    build: { outDir: "../../../dist/desktop" },
    // `tauri dev` loads this port (tauri.conf.json, devUrl); the web app's dev server keeps 5173.
    // The Rust shell is rebuilt by `tauri dev` itself; its files changing must not reload the page.
    server: { port: 5190, strictPort: true, host: "127.0.0.1", watch: { ignored: ["**/src-tauri/**"] } },
    // Keep `tauri dev`'s Rust output on screen.
    clearScreen: false,
  }),
);
