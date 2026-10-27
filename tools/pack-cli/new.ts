// `carbonara-pack new <id>`: a new pack folder, copied from the template pack.
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isMap, isScalar, parseDocument } from "yaml";
import { Id } from "../../src/contracts/pack";
import { fail, ok, type Result } from "../../src/contracts/result";

const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TEMPLATE = join(REPOSITORY, "packs", "_template");

export interface NewPackOptions {
  /** The folder the pack folder is created in. */
  into?: string;
  /** The pack's and the game's name; by default the id in title case. */
  name?: string;
}

export function newPack(
  id: string,
  { into = "packs", name = titleCase(id) }: NewPackOptions = {},
): Result<{
  folder: string;
}> {
  const valid = Id.safeParse(id);
  if (!valid.success) return fail([{ path: ["id"], message: valid.error.issues[0]?.message ?? "Invalid id" }]);
  const folder = join(into, id);
  if (existsSync(folder)) return fail([{ path: [folder], message: "Already exists" }]);

  // The template's starter factory fits its data only, which the new pack replaces (an import wipes data/).
  cpSync(TEMPLATE, folder, { recursive: true, filter: (source) => source !== join(TEMPLATE, "starters") });

  const manifestPath = join(folder, "manifest.yaml");
  const manifest = parseDocument(readFileSync(manifestPath, "utf8"));
  // The template's own comment describes the template.
  manifest.commentBefore = null;
  const firstKey = isMap(manifest.contents) ? manifest.contents.items[0]?.key : undefined;
  if (isScalar(firstKey)) firstKey.commentBefore = null;
  manifest.set("id", id);
  manifest.set("name", name);
  manifest.set("version", "0.1.0");
  manifest.setIn(["game", "name"], name);
  writeFileSync(manifestPath, manifest.toString());

  // The plugin imports the contracts from this repository, wherever the pack is.
  const contracts = relative(join(folder, "plugin"), join(REPOSITORY, "src", "contracts", "plugin"))
    .split(sep)
    .join("/");
  writeFileSync(
    join(folder, "plugin", "index.ts"),
    `// The plugin of ${name}. It does nothing yet: add hooks when the game needs them (docs/Guides/Plugin-authoring.md).
import { definePlugin } from "${contracts.startsWith(".") ? contracts : `./${contracts}`}";

export default definePlugin({ id: "${id}" });
`,
  );
  writeFileSync(
    join(folder, "README.md"),
    `# ${name}\n\nA game pack for Carbonara. Say which game and version it covers; the pack manager shows this file.\n`,
  );
  writeFileSync(
    join(folder, "CREDITS.md"),
    "# Credits\n\nRecord where the data and icons come from, and the publisher's permission or the fan-content policy that covers them.\n",
  );
  return ok({ folder });
}

function titleCase(id: string): string {
  return id
    .split(/[-_.]/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}
