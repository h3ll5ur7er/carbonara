import { defineConfig } from "vitest/config";
import { builtInPacks } from "./tools/pack-cli/vite-plugin.ts";

export default defineConfig({
  plugins: [builtInPacks()],
  test: {
    include: ["src/**/*.test.{ts,tsx}", "eslint-rules/**/*.test.js", "tools/**/*.test.ts"],
  },
});
