// Every manager method a client may call, with validated arguments and, where it is exposed, its MCP tool.
// The RPC dispatcher, the client connector and the MCP server are all derived from this file.
import { z } from "zod";
import { Clipboard, PasteOffset } from "./clipboard";
import { Command, GraphScope } from "./commands";
import { LocalId } from "./document";
import { ArrangeOptions } from "./layout";
import type { OpenDocument } from "./access";
import type { Patch } from "./patches";
import type { Issue } from "./issues";
import { Id, type PackData, type PackManifest, type RateUnit } from "./pack";
import type { PluginDescription } from "./plugin";
import { Preferences } from "./preferences";
import type { AnalysisResults, EdgeResult, NodeItems, NodeResult } from "./results";
import type { Result } from "./result";

export type McpGroup = "read" | "plan" | "edit" | "authoring";

/**
 * The part of a method's value that the MCP bridge passes on instead of the whole value, so one method can back
 * several focused tools (src/client/features/mcp/views.ts): `graph` is a document's graph, summarised when it's
 * large; `totals` and `diagnostics` are those parts of analysis results.
 */
export type McpView = "graph" | "totals" | "diagnostics";

/** How a method appears to MCP clients (docs/Architecture/MCP-server.md). */
export interface McpTool {
  tool: string;
  group: McpGroup;
  description: string;
  /** The whole value when left out. */
  view?: McpView;
}

export interface MethodContract<Args extends z.ZodType = z.ZodType, Value = unknown> {
  args: Args;
  /** The MCP tools the method backs: usually one, several when each shows a different view of the value. */
  mcp?: McpTool | readonly McpTool[];
  /** Type-level only: what the method resolves to. */
  readonly value?: Value;
}

/** `method<Value>()(args, mcp)`: the value type is given, the argument type is inferred from the schema. */
const method =
  <Value>() =>
  <Args extends z.ZodType>(args: Args, mcp?: McpTool | readonly McpTool[]): MethodContract<Args, Value> =>
    mcp ? { args, mcp } : { args };

const none = z.object({});
const documentRef = z.object({ documentId: z.string().min(1) });

export interface DocumentInfo {
  id: string;
  name: string;
  packId: string;
  /** Increases with every change; events and results carry it. */
  version: number;
}

/** What `editing.paste` did. */
export interface Pasted {
  document: DocumentInfo;
  /** The new nodes, in the clipboard's order. */
  nodeIds: LocalId[];
  /** What this graph can't hold and was left out, for the person: "1 subgraph this factory doesn't have". */
  leftOut: string[];
}

/** A document closed recently, which `workspace.openRecent` opens again. */
export interface RecentDocument {
  id: string;
  name: string;
  packId: string;
  /** When it was closed, in milliseconds since 1970. */
  closedAt: number;
}

export interface PackInfo {
  manifest: PackManifest;
  hash: string;
  builtIn: boolean;
}

export interface PackInspection {
  manifest: PackManifest | null;
  hash: string;
  issues: Issue[];
}

/** Something the planner should make: an item at a rate. */
export const PlanTarget = z.object({
  item: Id,
  perSecond: z.number().positive().describe("Items per second."),
});
export type PlanTarget = z.infer<typeof PlanTarget>;

/** How the planner chooses among recipes. */
export const PlanOptions = z.object({
  objective: z
    .enum(["resources", "buildings"])
    .default("resources")
    .describe("What to use as little of: raw resources, or buildings."),
  alternates: z.boolean().default(true).describe("Whether alternate recipes may be used."),
  exclude: z.array(Id).default([]).describe("Recipes the plan must not use."),
  buildings: z
    .array(Id)
    .default([])
    .describe(
      "Buildings to prefer, such as steel-furnace or assembling-machine-3: each recipe runs in the first of " +
        "these it can, otherwise in its default building (the first of its buildings).",
    ),
  resourceWeights: z
    .record(Id, z.number().positive())
    .default({})
    .describe(
      "What one item per second of a raw resource weighs against the others, by item; 1 when not named. " +
        "Weigh scarce or unwanted resources higher.",
    ),
});
export type PlanOptions = z.output<typeof PlanOptions>;

/** The options as they are when nobody chose any. */
export const DEFAULT_PLAN_OPTIONS: PlanOptions = PlanOptions.parse({});

/**
 * The options a plan is asked for with. Buildings and resource weights left out are the document's
 * (`settings.planning`), so a save that prefers steel furnaces or avoids asteroids says so once.
 */
export const PlanRequestOptions = PlanOptions.extend({
  buildings: PlanOptions.shape.buildings
    .unwrap()
    .optional()
    .describe(
      "Buildings to prefer, such as steel-furnace or assembling-machine-3: each recipe runs in the first of " +
        "these it can, otherwise in its default building (the first of its buildings). Left out: the ones saved " +
        "with the document, if any.",
    ),
  resourceWeights: PlanOptions.shape.resourceWeights
    .unwrap()
    .optional()
    .describe(
      "What one item per second of a raw resource weighs against the others, by item; 1 when not named. " +
        "Weigh scarce or unwanted resources higher. Left out: the weights saved with the document, if any.",
    ),
});
export type PlanRequestOptions = z.output<typeof PlanRequestOptions>;

/** What a proposal adds up to. All rates are items per second. */
export interface ProposalSummary {
  /** Buildings by building id (machine counts rounded up per node, as in `Totals`). */
  buildings: Record<Id, number>;
  /** Raw inputs by item. */
  raw: Record<Id, number>;
  /** What the plan makes but doesn't use, by item; the proposal sends it to outputs. */
  byproducts: Record<Id, number>;
  /** What couldn't be made, by item, e.g. because a raw resource ran into its map limit. Empty when all is met. */
  shortfalls: Record<Id, number>;
  /** Power the buildings draw, in MW (the plugin's `powerMW` where it derives one). */
  powerMW: number;
}

/** A planned factory, not yet part of the document: shown as a ghost until it's accepted or discarded. */
export interface Proposal {
  /** Names the proposal to `editing.applyProposal` and `planning.discardProposal`: `proposal-1`, `proposal-2` … */
  id: string;
  documentId: string;
  targets: PlanTarget[];
  /**
   * The planned nodes (`addNode`, with ids free in the graph planned into and positions next to its nodes), then
   * the flows between them (`connect`). Every command names that graph: `root`, or the blueprint planned inside.
   * Accepting applies them as one `editing.apply` batch: one undo step.
   */
  commands: Command[];
  /**
   * The planned solve, by the commands' node and edge ids, to preview machine counts and flows, with the items of
   * recipe nodes whose effective recipe differs from the pack's (as in `AnalysisResults.effectiveItems`).
   */
  results: {
    nodes: Record<string, NodeResult>;
    edges: Record<string, EdgeResult>;
    effectiveItems?: Record<string, NodeItems>;
  };
  summary: ProposalSummary;
}

/**
 * Where a proposal stands. It's `pending` (a ghost on the canvas) until it's accepted, discarded, or `replaced` by a
 * newer plan for its document.
 */
export type ProposalStatus = "pending" | "accepted" | "discarded" | "replaced";

/** A rate converted into items per second, with what it was converted from. */
export interface RateConversion {
  perSecond: number;
  /** The same rate in the document's unit. */
  inDocumentUnit: { rate: number; unit: RateUnit };
  /** How it was converted, e.g. "2 × Transport belt (15/s each)". */
  explanation: string;
}

/** One recipe for an item, planned on its own. */
export interface RecipeComparison {
  recipe: Id;
  summary: ProposalSummary;
}

const planRequest = z.object({
  documentId: z.string().min(1),
  options: PlanRequestOptions.default({ objective: "resources", alternates: true, exclude: [] }),
});

export const managers = {
  workspace: {
    ping: method<"pong">()(none),
    /** An empty document for a pack, or a copy of one of its starter factories (`PackData.starters`, by id). */
    createDocument: method<DocumentInfo>()(
      z.object({ name: z.string(), packId: z.string().min(1), starter: Id.optional() }),
    ),
    listDocuments: method<DocumentInfo[]>()(none, {
      tool: "list_documents",
      group: "read",
      description: "List the factory documents open in Carbonara: id, name, game pack and version.",
    }),
    /** Opens a `.carbonara` file (gzipped JSON, or plain JSON). A document whose id is open already gets a new id. */
    importDocument: method<Result<DocumentInfo>>()(z.object({ bytes: z.instanceof(Uint8Array) })),
    /** The document as a `.carbonara` file: gzipped JSON. */
    exportDocument: method<Uint8Array<ArrayBuffer>>()(documentRef),
    /** Closes a document; it stays among the recent documents (a few, newest first) to open again. */
    closeDocument: method<undefined>()(documentRef),
    listRecent: method<RecentDocument[]>()(none),
    /** Opens a recently closed document again (under a new id if one with its id is open). */
    openRecent: method<Result<DocumentInfo>>()(documentRef),
    /** Problems restoring last session's documents (e.g. made with a newer Carbonara); they stay saved. */
    getRestoreProblems: method<Issue[]>()(none),
    /** What Carbonara remembers about the person across sessions. */
    getPreferences: method<Preferences>()(none),
    /** Changes the preferences given (the others stay) and answers them all. */
    setPreferences: method<Preferences>()(z.object({ preferences: Preferences })),
    /** The URL fragment (without `#`) that opens a copy of the document: the compressed document itself. */
    createShareLink: method<string>()(documentRef),
    openShareLink: method<Result<DocumentInfo>>()(z.object({ fragment: z.string() })),
  },
  editing: {
    /** The document with its version, so a client knows which `documentChanged` events the snapshot includes. */
    getDocument: method<OpenDocument>()(documentRef, {
      tool: "get_graph",
      group: "read",
      view: "graph",
      description:
        "A document's graph: its nodes (recipes, sources, sinks, junctions …), the edges between them and the " +
        "nodes' positions. Large graphs come back summarised: node counts per recipe and item instead of every node.",
    }),
    apply: method<Result<DocumentInfo>>()(
      documentRef.extend({ commands: z.array(Command).min(1), label: z.string().optional() }),
      {
        tool: "edit_graph",
        group: "edit",
        description:
          "Change a document with a batch of commands: add nodes, connect them, set node fields, rates and pins, " +
          "move, disconnect or remove nodes. The whole batch is one step in the undo history; give it a short " +
          'label saying what it does, such as "Add steel smelting". Nodes connect by item; recipe nodes take ' +
          "recipe ids from get_pack_data. Positions are canvas pixels: lay nodes out left to right along the flow, " +
          "about 320 apart. Answers the document's new version, or the problems that stopped the batch.",
      },
    ),
    /**
     * Adds a pending proposal (`planning.planProduction`) to its document as one undo step, its nodes moved by
     * `offset` (where its ghost was left); the proposal is then accepted. Proposals that aren't pending any more
     * fail with why: the person accepted or discarded them, or a newer plan replaced them.
     */
    applyProposal: method<Result<DocumentInfo>>()(
      z.object({
        proposalId: z.string().min(1).describe("The id of a proposal from plan_production."),
        label: z
          .string()
          .min(1)
          .describe('How the step reads in the undo history, such as "Steel for 2 yellow belts".'),
        offset: z
          .object({ x: z.number(), y: z.number() })
          .default({ x: 0, y: 0 })
          .describe("How far to move the proposal from where it was planned, in canvas pixels."),
      }),
      {
        tool: "apply_proposal",
        group: "edit",
        description:
          "Accept a proposal from plan_production: add its nodes and flows to its document as one step in the " +
          "undo history. The person sees every proposal as a ghost in Carbonara and may accept or discard it " +
          "there first: if they discarded it, or a newer plan replaced it, this fails and says so; then ask what " +
          "to change and plan again. Answers the document's new version.",
      },
    ),
    undo: method<DocumentInfo>()(documentRef, {
      tool: "undo",
      group: "edit",
      description: "Undo the last change to a document.",
    }),
    redo: method<DocumentInfo>()(documentRef),
    /** Lays the graph (or some of its nodes) out automatically; one `moveNodes` step, labelled "Arrange". */
    arrange: method<Result<DocumentInfo>>()(documentRef.extend({ graph: GraphScope, ...ArrangeOptions.shape })),
    /** What the clipboard holds after copying these nodes: them, the flows among them and those they leave. */
    copy: method<Result<Clipboard>>()(documentRef.extend({ graph: GraphScope, nodeIds: z.array(LocalId).min(1) })),
    /**
     * Adds a copy's nodes under fresh ids, `offset` from where they were, with the flows among them; with
     * `connections`, also the flows to the nodes they were connected to (same document and graph). One undo step,
     * "Paste 5 nodes" unless `label` says otherwise.
     */
    paste: method<Result<Pasted>>()(
      documentRef.extend({
        graph: GraphScope,
        clipboard: Clipboard,
        offset: PasteOffset.default({ x: 0, y: 0 }),
        connections: z.boolean().default(false),
        label: z.string().optional(),
      }),
    ),
  },
  analysis: {
    /**
     * The latest results of a graph: `root`, or a blueprint id for the inside of all its instances together
     * (the blueprint as designed when it has none). Blueprints are solved only when asked for.
     */
    getResults: method<AnalysisResults | null>()(documentRef.extend({ graph: z.string().default("root") }), [
      {
        tool: "get_totals",
        group: "read",
        view: "totals",
        description:
          "Totals of a solved document: raw inputs by item (items per second) and buildings by building id. " +
          "Null while the document isn't solved.",
      },
      {
        tool: "get_diagnostics",
        group: "read",
        view: "diagnostics",
        description:
          "Problems of a solved document: deficits, surpluses (byproducts), overflowing belts and pipes, missed " +
          "pins and errors, with rates in items per second. An empty list means the factory runs as planned.",
      },
    ]),
    /**
     * While a blueprint graph is watched, every solve of its document publishes its results with
     * `resultsChanged` too (the root graph's always are). Watches count: each needs its `unwatchResults`.
     */
    watchResults: method<undefined>()(documentRef.extend({ graph: z.string().min(1) })),
    unwatchResults: method<undefined>()(documentRef.extend({ graph: z.string().min(1) })),
  },
  planning: {
    planProduction: method<Result<Proposal>>()(
      planRequest.extend({
        graph: GraphScope.describe(
          "Where the plan goes: root (the factory), or a blueprint id to plan inside that subgraph.",
        ),
        targets: z.array(PlanTarget).min(1),
      }),
      {
        tool: "plan_production",
        group: "plan",
        description:
          "Plan a production chain that makes the target items at the given rates (items per second) with the " +
          "document's pack, using as few raw resources (or buildings) as possible. Returns a proposal: the nodes " +
          "and flows to add next to the existing factory, a summary (buildings, raw inputs, byproducts, power) and " +
          "anything that can't be met. The person sees it in Carbonara as a ghost beside the factory, with Accept, " +
          "Adjust and Discard. Nothing changes until it's accepted there or with apply_proposal (by its id); a " +
          "newer plan for the same document replaces it. The preferred buildings and resource weights saved with " +
          "the document (its settings.planning, changed with edit_graph's setSettings) apply unless options name others.",
      },
    ),
    compareRecipes: method<Result<RecipeComparison[]>>()(planRequest.extend(PlanTarget.shape), {
      tool: "compare_recipes",
      group: "plan",
      description:
        "Compare the recipes that make an item: plan the item at the given rate (items per second) once with " +
        "each recipe and report each plan's buildings, raw inputs, byproducts and power, best first.",
    }),
    /** Drops a pending proposal (the planner's Discard); a settled one stays as it is. */
    discardProposal: method<Result<undefined>>()(z.object({ proposalId: z.string().min(1) })),
    convertRate: method<Result<RateConversion>>()(
      documentRef.extend({
        amount: z.number().positive().describe("How many of the unit, such as 2 for two full belts."),
        unit: z
          .string()
          .min(1)
          .describe(
            'A belt or pipe of the pack by id, name or alias ("yellow belt", "transport-belt"), meaning its full ' +
              'capacity; or a rate unit: "per_second", "per_minute", "per_hour" (or "/s", "/min", "/h").',
          ),
      }),
      {
        tool: "convert_rate",
        group: "read",
        description:
          'Convert a rate such as "2 full yellow belts" or "1800 per minute" into items per second, the unit ' +
          "plan_production and the other tools use, with the document's pack (its belt and pipe capacities). " +
          "Also gives the rate in the document's unit.",
      },
    ),
  },
  packs: {
    listPacks: method<PackInfo[]>()(none, {
      tool: "list_packs",
      group: "read",
      description: "List the installed game packs.",
    }),
    getPackData: method<PackData>()(z.object({ packId: z.string().min(1) }), {
      tool: "get_pack_data",
      group: "read",
      description:
        "A game pack's data: items, recipes (inputs and outputs per craft, seconds per craft, buildings), " +
        "buildings, logistics (belt and pipe capacities, in the pack's rate unit) and raw resources.",
    }),
    /**
     * The pack's icons as URLs (data URLs today), by the path its data names them by. Empty unless the build brings
     * them: a game's art ships only with its publisher's OK (CARB-31, docs/Development.md, Pack icons).
     */
    getPackIcons: method<Record<string, string>>()(z.object({ packId: z.string().min(1) })),
    /** The pack plugin's node fields, document settings and metrics under a document's `settings.plugin`. */
    describePlugin: method<PluginDescription>()(
      z.object({ packId: z.string().min(1), settings: z.record(z.string(), z.unknown()).default({}) }),
    ),
    inspectPack: method<PackInspection>()(z.object({ bytes: z.instanceof(Uint8Array) })),
    installPack: method<Result<PackInfo>>()(z.object({ bytes: z.instanceof(Uint8Array) })),
    removePack: method<undefined>()(z.object({ packId: z.string().min(1) })),
  },
} as const;

export type Managers = typeof managers;
export type ManagerName = keyof Managers;

export type Contracts = Record<string, Record<string, MethodContract>>;

/** How clients call a set of contracts: arguments as they may be written (defaults optional). */
export type ClientApi<C extends Contracts> = {
  [M in keyof C]: {
    [K in keyof C[M]]: C[M][K] extends MethodContract<infer Args, infer Value>
      ? (args: z.input<Args>) => Promise<Value>
      : never;
  };
};

/** How managers implement a set of contracts: arguments as validated (defaults filled in). */
export type Implementation<C extends Contracts> = {
  [M in keyof C]: {
    [K in keyof C[M]]: C[M][K] extends MethodContract<infer Args, infer Value>
      ? (args: z.output<Args>) => Promise<Value>
      : never;
  };
};

export type Backend = ClientApi<Managers>;
export type ManagerImplementation<M extends ManagerName> = Implementation<Managers>[M];

/** Events the backend sends to every client. */
export interface Events {
  documentChanged: { documentId: string; version: number; patches: Patch[]; label?: string };
  documentsChanged: { documents: DocumentInfo[] };
  resultsChanged: AnalysisResults;
  packsChanged: { packs: PackInfo[] };
  /** A proposal was made, or it was accepted, discarded or replaced. */
  proposalChanged: { proposal: Proposal; status: ProposalStatus };
}
