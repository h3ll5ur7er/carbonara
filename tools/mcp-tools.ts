// Writes the MCP server's manifest (crates/mcp/manifest.json) from the manager contracts: every method with `mcp`
// metadata becomes a tool whose input schema is the JSON Schema of its zod arguments. The Rust server embeds the
// manifest, so tools never have to be written down twice. `pnpm mcp:tools` writes it; tools/mcp-tools.test.ts
// fails when the committed file is out of date.
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { mcpTools } from "../src/client/features/mcp/tools";
import { Document } from "../src/contracts/document";
import { managers, type Contracts, type McpGroup } from "../src/contracts/managers";
import { render as renderSchema, SCHEMAS } from "./schema";
import { isMain } from "./is-main";

export const MANIFEST_FILE = "crates/mcp/manifest.json";

export interface ManifestTool {
  name: string;
  description: string;
  group: McpGroup;
  manager: string;
  method: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; openWorldHint: false };
}

interface ResourceBase {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/** A resource is fixed text, or what a read tool answers for fixed arguments. */
export type ManifestResource =
  (ResourceBase & { text: string }) | (ResourceBase & { tool: string; arguments: Record<string, unknown> });

export interface ManifestPrompt {
  name: string;
  description: string;
  arguments: { name: string; description: string; required: boolean }[];
  /** The prompt's message; `{{argument}}` is replaced with the argument's value. */
  text: string;
}

export interface McpManifest {
  instructions: string;
  tools: ManifestTool[];
  resources: ManifestResource[];
  prompts: ManifestPrompt[];
}

const INSTRUCTIONS = `Carbonara is a node-based factory planner for automation games. A document is a factory: a graph of recipe nodes (machines running a recipe), sources (raw inputs), sinks (targets) and junctions, connected by edges that each carry one item. Carbonara solves every document for the rates of every edge and the number of machines of every node.

Tools take a documentId; "active" names the document on screen. Rates in results are items per second. Read tools are always allowed. Planning, editing and pack authoring tools only work once the person allows them in Carbonara (AI access); if a tool is refused, ask them to switch its group on. Every edit is one undoable step in the document's history, shown as "AI: <label>".`;

const ACTIVE_DOCUMENT = 'The document\'s id from list_documents, or "active" for the document on screen in Carbonara.';

export function buildManifest(contracts: Contracts = managers): McpManifest {
  return {
    instructions: INSTRUCTIONS,
    tools: mcpTools(contracts).map(({ tool, description, group, manager, method, args }) => ({
      name: tool,
      description,
      group,
      manager,
      method,
      inputSchema: inputSchema(args),
      annotations: { readOnlyHint: group === "read", openWorldHint: false },
    })),
    resources: resources(),
    prompts: PROMPTS,
  };
}

function inputSchema(args: z.ZodType): Record<string, unknown> {
  const { $schema: _dialect, ...schema } = z.toJSONSchema(args, { io: "input" }) as Record<string, unknown>;
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (properties?.documentId) properties.documentId = { ...properties.documentId, description: ACTIVE_DOCUMENT };
  return schema;
}

function resources(): ManifestResource[] {
  const json = (uri: string, name: string, description: string, text: string): ManifestResource => ({
    uri: `carbonara://${uri}`,
    name,
    description,
    mimeType: "application/json",
    text,
  });
  const [manifestSchema, dataSchema] = Object.values(SCHEMAS).map(({ schema, title }) => renderSchema(schema, title));
  return [
    json(
      "schemas/pack-manifest.json",
      "Pack manifest schema",
      "JSON Schema of a pack's manifest.yaml.",
      manifestSchema ?? "",
    ),
    json("schemas/pack-data.json", "Pack data schema", "JSON Schema of a pack's data/*.yaml files.", dataSchema ?? ""),
    json(
      "schemas/document.json",
      "Document schema",
      "JSON Schema of a Carbonara document: graph, blueprints, layout and settings.",
      renderSchema(Document, "Carbonara document (.carbonara)"),
    ),
    {
      uri: "carbonara://docs/plugin-api.ts",
      name: "Plugin API",
      description: "The TypeScript API a pack's plugin implements (plugin/index.ts), with its documentation.",
      mimeType: "text/x-typescript",
      text: readFileSync(new URL("../src/contracts/plugin.ts", import.meta.url), "utf8"),
    },
    {
      uri: "carbonara://documents/active",
      name: "Active document",
      description: "The graph of the document on screen in Carbonara, summarised when it's large.",
      mimeType: "application/json",
      tool: "get_graph",
      arguments: { documentId: "active" },
    },
  ];
}

const PROMPTS: ManifestPrompt[] = [
  {
    name: "design_production_line",
    description: "Design a production line for an item and a rate in the document on screen.",
    arguments: [
      { name: "item", description: "What to make, such as steel plate.", required: true },
      { name: "rate", description: 'How much, such as "2 full yellow belts" or "60 per minute".', required: true },
    ],
    text: `Design a production line in Carbonara that makes {{item}} at {{rate}}.

1. Work in the document on screen (documentId "active") unless I name another one. Read its game pack with get_pack_data: the item, the recipes that make it and, if the rate is given in belts, the belt's capacity (logistics, in the pack's rate unit).
2. Convert the rate to items per second.
3. If plan_production is available, plan with it and show me the proposal. Otherwise build the line with one edit_graph batch: a sink with the target rate, a recipe node for each step, sources for the raw inputs, and edges between them. Label the batch.
4. Check get_diagnostics and fix any deficit. Then report get_totals: machines per building and raw inputs.`,
  },
  {
    name: "create_pack",
    description: "Create a Carbonara game pack for a game.",
    arguments: [{ name: "game", description: "The game the pack is for.", required: true }],
    text: `Help me create a Carbonara game pack for {{game}}.

Read the resources carbonara://schemas/pack-manifest.json, carbonara://schemas/pack-data.json and carbonara://docs/plugin-api.ts first. A pack is a folder with a manifest.yaml, data/*.yaml files (items, buildings, recipes, logistics, resources) and, for rules the data can't express, a plugin/index.ts. Take the numbers from the game's own data, and use no assets the game's publisher hasn't allowed. Write the files for me, then have me run \`pnpm carbonara-pack validate <folder>\` and fix what it reports.`,
  },
];

export function render(manifest: McpManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

if (isMain(import.meta.url)) writeFileSync(MANIFEST_FILE, render(buildManifest()));
