// `carbonara-pack`: the pack author's command line. Run it with `pnpm carbonara-pack <command>`.
// It calls the packs engine directly rather than the packs manager; see docs/Architecture/Game-packs.md, Authoring.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { sha256 } from "../../src/access/packs/archive";
import type { Issue } from "../../src/contracts/issues";
import { describeIssue } from "../../src/utilities/issues";
import { buildPack, packFolder } from "./build";
import { watchPack } from "./dev";
import { importPack } from "./import";
import { newPack } from "./new";
import { typecheckPlugin } from "./typecheck";

const USAGE = `Usage:
  carbonara-pack new <id> [--into packs] [--name <name>]   Create a pack from the template
  carbonara-pack validate <folder>                         Check a pack (and type-check its plugin) and list its problems
  carbonara-pack build <folder> [--out dist/packs]         Build <out>/<id>-<version>.cpack
  carbonara-pack dev <folder> [--out dist/packs]           Build, then rebuild on every change
  carbonara-pack import <folder> <file>… [--icons <folder>]…
                                                           Regenerate data/ and icons/ with the pack's importer

A <folder> may also be the id of a pack in packs/.`;

export interface Output {
  log(line: string): void;
  error(line: string): void;
}

/** Runs one command and returns the exit code: 0 done, 1 the pack has problems, 2 the command was wrong. */
export async function run(argv: string[], output: Output): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        into: { type: "string", default: "packs" },
        name: { type: "string" },
        out: { type: "string", default: "dist/packs" },
        icons: { type: "string", multiple: true, default: [] },
      },
    });
  } catch (error) {
    output.error(`${String(error)}\n\n${USAGE}`);
    return 2;
  }
  const { positionals, values } = parsed;
  const [command, given, ...files] = positionals;
  // `satisfactory` is short for `packs/satisfactory`.
  const target =
    command !== "new" && given && !existsSync(given) && existsSync(join("packs", given)) ? join("packs", given) : given;
  const problems = (issues: Issue[], folder = "") => {
    for (const issue of issues) output.error(describeIssue(inFolder(issue, folder)));
    return 1;
  };

  if (!target) {
    output.error(USAGE);
    return 2;
  }
  switch (command) {
    case "new": {
      const created = newPack(target, { into: values.into, ...(values.name && { name: values.name }) });
      if (!created.ok) return problems(created.error);
      output.log(`Created ${created.value.folder}`);
      return 0;
    }
    case "validate": {
      const pack = await packFolder(target);
      if (!pack.ok) return problems(pack.error, target);
      const typeErrors = typecheckPlugin(target);
      if (typeErrors.length > 0) return problems(typeErrors, target);
      output.log(`${pack.value.contents.manifest.name} ${pack.value.contents.manifest.version} is valid`);
      return 0;
    }
    case "build": {
      const built = await buildPack(target, values.out);
      if (!built.ok) return problems(built.error, target);
      output.log(`Built ${built.value.file}`);
      output.log(`SHA-256 ${await sha256(readFileSync(built.value.file))}`);
      return 0;
    }
    case "dev": {
      const controller = new AbortController();
      process.once("SIGINT", () => controller.abort());
      output.log(`Watching ${target}; Ctrl+C stops`);
      await watchPack(target, values.out, {
        signal: controller.signal,
        onBuild: (result) => {
          if (result.ok) output.log(`${new Date().toLocaleTimeString()} Built ${result.value.file}`);
          else problems(result.error, target);
        },
      });
      return 0;
    }
    case "import": {
      if (files.length === 0) {
        output.error(`import needs the game's data files\n\n${USAGE}`);
        return 2;
      }
      const imported = await importPack(target, files, values.icons);
      if (!imported.ok) return problems(imported.error);
      output.log(`Wrote ${imported.value.files} data files and ${imported.value.icons} icons to ${target}`);
      // What the importer wrote is checked like anything an author writes.
      const pack = await packFolder(target);
      return pack.ok ? 0 : problems(pack.error, target);
    }
    default:
      output.error(USAGE);
      return 2;
  }
}

/** Pack issues start with a file inside the pack; prefixed with the folder, terminals and editors can open them. */
function inFolder(issue: Issue, folder: string): Issue {
  const [file, ...rest] = issue.path;
  if (!folder || typeof file !== "string" || issue.line === undefined) return issue;
  return { ...issue, path: [join(folder, file), ...rest] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await run(process.argv.slice(2), { log: console.log, error: console.error });
}
