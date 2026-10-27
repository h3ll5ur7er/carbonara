import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}", "eslint-rules/**/*.test.js", "tools/**/*.test.ts"],
  },
});
