// Broken packs and the message each one produces: what a pack author reads in the app and in the CLI.
import { describe, expect, it } from "vitest";
import { describeIssue } from "../../utilities/issues";
import { readPackFiles } from "./files";

const valid: Record<string, string> = {
  "manifest.yaml": `id: demo
name: Demo Works
version: 1.0.0
engine: ^1
plugin: plugin/index.js
`,
  "plugin/index.js": "export default { id: 'demo' };",
  "data/items.yaml": `units: { rate: per_minute }
items:
  - { id: ore, name: Ore, form: solid }
  - { id: plate, name: Plate, form: solid }
`,
  "data/recipes.yaml": `buildings:
  - { id: furnace, name: Furnace }
recipes:
  - id: plate
    buildings: [furnace]
    time: 2
    in: { ore: 1 }
    out: { plate: 1 }
`,
};

/** Each fixture changes the valid pack: a string replaces or adds a file, `null` removes it. */
const broken: [name: string, change: Record<string, string | null>, messages: string[]][] = [
  ["no manifest", { "manifest.yaml": null }, ["manifest.yaml: Missing file"]],
  [
    "a key twice in the manifest",
    { "manifest.yaml": valid["manifest.yaml"] + "version: 1.0.1\n" },
    ["manifest.yaml:6:1: Map keys must be unique"],
  ],
  [
    "no plugin in the manifest",
    { "manifest.yaml": edit("manifest.yaml", "plugin: plugin/index.js\n", "") },
    ["manifest.yaml:1:1: plugin: Required"],
  ],
  [
    "a version that isn't semver",
    { "manifest.yaml": edit("manifest.yaml", "1.0.0", "v1.0.0") },
    ["manifest.yaml:3:1: version: a semantic version such as 1.2.0"],
  ],
  [
    "a version YAML reads as a number",
    { "manifest.yaml": edit("manifest.yaml", "1.0.0", "1.5") },
    ["manifest.yaml:3:1: version: Expected text, not the number 1.5; write it in quotes"],
  ],
  [
    "a pack for a newer pack format",
    { "manifest.yaml": edit("manifest.yaml", "^1", "^2") },
    ["manifest.yaml:4:1: engine: Needs pack format ^2, but this version of Carbonara reads pack format 1.2.0"],
  ],
  [
    "a missing plugin file",
    { "plugin/index.js": null },
    ["manifest.yaml:5:1: plugin: plugin/index.js is missing from the pack"],
  ],
  [
    "a misspelt section",
    { "data/items.yaml": edit("data/items.yaml", "items:", "itmes:") },
    [
      "data/items.yaml:2:1: itmes: Unknown section; use units, items, buildings, recipes, logistics, resources, categories or unlocks",
    ],
  ],
  [
    "an id with capitals",
    { "data/items.yaml": edit("data/items.yaml", "id: ore", "id: Ore") },
    ["data/items.yaml:3:7: items[0].id: lowercase letters, digits, . _ - and an optional @variant"],
  ],
  [
    "an item without a name",
    { "data/items.yaml": edit("data/items.yaml", " name: Plate,", "") },
    ["data/items.yaml:4:5: items[1].name: Required"],
  ],
  [
    "an item without a form",
    { "data/items.yaml": edit("data/items.yaml", ", form: solid }\n  - { id: plate", " }\n  - { id: plate") },
    ["data/items.yaml:3:5: items[0].form: Required"],
  ],
  [
    "a recipe using an unknown item",
    { "data/recipes.yaml": edit("data/recipes.yaml", "ore: 1", "coal: 1") },
    ["data/recipes.yaml:7:11: recipes[0].in.coal: Unknown item 'coal'"],
  ],
  [
    "a recipe in a category the pack doesn't list",
    {
      "data/recipes.yaml": edit("data/recipes.yaml", "time: 2", "time: 2\n    category: smelting"),
      "data/groups.yaml": "categories:\n  - { id: casting, name: Casting }\n",
    },
    ["data/recipes.yaml:7:5: recipes[0].category: Unknown category 'smelting'"],
  ],
  [
    "an unlock without a name",
    { "data/groups.yaml": "unlocks:\n  - { id: steel, section: Tier 2 }\n" },
    ["data/groups.yaml:2:5: unlocks[0].name: Required"],
  ],
  [
    "a building defined in two files",
    { "data/zz-extra.yaml": "buildings:\n  - { id: furnace, name: Big Furnace }\n" },
    ["data/zz-extra.yaml:2:7: buildings[0].id: Building 'furnace' is defined twice"],
  ],
  [
    "units defined in two files",
    { "data/zz-extra.yaml": "units: { rate: per_second }\n" },
    ["data/zz-extra.yaml:1:1: units: Units are already defined in data/items.yaml"],
  ],
  [
    "a JSON data file with a wrong form",
    { "data/zz-extra.json": `{"items": [{"id": "gear", "name": "Gear", "form": "liquid"}]}` },
    ['data/zz-extra.json:1:43: items[0].form: Invalid option: expected one of "solid"|"fluid"'],
  ],
  [
    "a starter without a name",
    { "starters/plates.yaml": "graph: { nodes: {}, edges: {} }\n" },
    ["starters/plates.yaml:1:1: name: Required"],
  ],
  [
    "a starter named in capitals",
    { "starters/Plates.yaml": "name: Plates\ngraph: { nodes: {}, edges: {} }\n" },
    ["starters/Plates.yaml: A starter's file name is its id: lowercase letters, digits, . _ - (plates.yaml)"],
  ],
  [
    "a starter using a recipe the pack doesn't have",
    {
      "starters/plates.yaml":
        "name: Plates\ngraph:\n  nodes:\n    press: { kind: recipe, recipe: gear }\n  edges: {}\n",
    },
    ["starters/plates.yaml:4:28: graph.nodes.press.recipe: Unknown recipe 'gear'"],
  ],
  [
    "a starter with a flow from a node that isn't there",
    {
      "starters/plates.yaml":
        "name: Plates\ngraph:\n  nodes: { out: { kind: sink, item: plate } }\n" +
        "  edges: { a: { from: smelt, to: out, item: plate } }\n",
    },
    ["starters/plates.yaml:4:17: graph.edges.a.from: Unknown node 'smelt'"],
  ],
  [
    "a data file that isn't YAML",
    { "data/zz-extra.yaml": "items:\n  - { id: gear\n" },
    ["data/zz-extra.yaml:3:1: Flow map in block collection must be sufficiently indented and end with a }"],
  ],
];

describe("broken packs", () => {
  it("the valid pack is valid", () => {
    expect(readPackFiles(encode(valid))).toMatchObject({ ok: true });
  });

  it.each(broken)("%s", (_name, change, messages) => {
    const files = Object.entries({ ...valid, ...change }).filter(
      (entry): entry is [string, string] => entry[1] !== null,
    );
    const result = readPackFiles(encode(Object.fromEntries(files)));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.map(describeIssue)).toEqual(messages);
  });
});

function edit(file: string, from: string, to: string): string {
  return (valid[file] ?? "").replace(from, to);
}

function encode(files: Record<string, string>): Record<string, Uint8Array> {
  return Object.fromEntries(Object.entries(files).map(([name, text]) => [name, new TextEncoder().encode(text)]));
}
