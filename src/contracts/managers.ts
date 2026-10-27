// Every manager method a client may call, with validated arguments and, where it is exposed, its MCP tool.
// The RPC dispatcher, the client connector and the MCP server are all derived from this file.
import { z } from "zod";
import { Command } from "./commands";
import type { OpenDocument } from "./access";
import type { Patch } from "./patches";
import type { Issue } from "./issues";
import type { PackData, PackManifest } from "./pack";
import type { AnalysisResults } from "./results";
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

export const managers = {
  workspace: {
    ping: method<"pong">()(none),
    createDocument: method<DocumentInfo>()(z.object({ name: z.string(), packId: z.string().min(1) })),
    listDocuments: method<DocumentInfo[]>()(none, {
      tool: "list_documents",
      group: "read",
      description: "List the factory documents open in Carbonara: id, name, game pack and version.",
    }),
    /** Opens a `.carbonara` file (gzipped JSON, or plain JSON). A document whose id is open already gets a new id. */
    importDocument: method<Result<DocumentInfo>>()(z.object({ bytes: z.instanceof(Uint8Array) })),
    /** The document as a `.carbonara` file: gzipped JSON. */
    exportDocument: method<Uint8Array<ArrayBuffer>>()(documentRef),
    closeDocument: method<undefined>()(documentRef),
    /** Problems restoring last session's documents (e.g. made with a newer Carbonara); they stay saved. */
    getRestoreProblems: method<Issue[]>()(none),
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
    undo: method<DocumentInfo>()(documentRef, {
      tool: "undo",
      group: "edit",
      description: "Undo the last change to a document.",
    }),
    redo: method<DocumentInfo>()(documentRef),
  },
  analysis: {
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
}
