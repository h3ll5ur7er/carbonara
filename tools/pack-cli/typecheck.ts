// Type-checks a pack's TypeScript plugin with this repository's compiler options. Building only bundles it
// (esbuild strips types), so `carbonara-pack validate` runs this to catch mistakes a pack author's editor may miss.
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { Issue } from "../../src/contracts/issues";
import { PLUGIN_SOURCE } from "./build";

const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Problems in `plugin/index.ts` and what it imports from the pack, as issues on files in the pack folder. */
export function typecheckPlugin(folder: string): Issue[] {
  const entry = resolve(folder, PLUGIN_SOURCE);
  if (!existsSync(entry)) return [];
  const program = ts.createProgram([entry], compilerOptions());
  const pack = resolve(folder) + sep;
  return ts
    .getPreEmitDiagnostics(program)
    .filter(({ file }) => file !== undefined && resolve(file.fileName).startsWith(pack))
    .map(({ file, start, messageText }) => {
      const { line, character } = file && start !== undefined ? file.getLineAndCharacterOfPosition(start) : {};
      const name = file ? relative(folder, file.fileName).split(sep).join("/") : PLUGIN_SOURCE;
      return {
        path: [name],
        message: ts.flattenDiagnosticMessageText(messageText, " ").replace(/\s+/g, " "),
        ...(line !== undefined && { line: line + 1, column: (character ?? 0) + 1 }),
      };
    });
}

/** The repository's tsconfig, which the built-in packs are checked with too. */
function compilerOptions(): ts.CompilerOptions {
  const config = ts.readConfigFile(join(REPOSITORY, "tsconfig.json"), (path) => ts.sys.readFile(path));
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, REPOSITORY);
  // Plugins run in workers and in Node; they never see the app's Vite types.
  return { ...options, noEmit: true, types: ["node"] };
}
