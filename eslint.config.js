import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";
import local from "./eslint-rules/layers.js";

export default tseslint.config(
  {
    ignores: [
      ".claude/worktrees",
      "dist",
      "node_modules",
      "target",
      "src/engines/solver/wasm",
      "playwright-report",
      "test-results",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
    plugins: { local, "react-hooks": reactHooks },
    rules: {
      "local/layers": "error",
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["eslint-rules/**", "*.config.{js,ts}", "tools/**", "bench/**"],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
