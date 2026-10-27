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

/** How a method appears to MCP clients (docs/Architecture/MCP-server.md). */
export interface McpTool {
  tool: string;
  group: McpGroup;
  description: string;
}

export interface MethodContract<Args extends z.ZodType = z.ZodType, Value = unknown> {
  args: Args;
  mcp?: McpTool;
  /** Type-level only: what the method resolves to. */
  readonly value?: Value;
}

/** `method<Value>()(args, mcp)`: the value type is given, the argument type is inferred from the schema. */
const method =
  <Value>() =>
  <Args extends z.ZodType>(args: Args, mcp?: McpTool): MethodContract<Args, Value> =>
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
      description: "List the open factory documents.",
    }),
    /** Opens a `.carbonara` file (gzipped JSON, or plain JSON). A document whose id is open already gets a new id. */
    importDocument: method<Result<DocumentInfo>>()(z.object({ bytes: z.instanceof(Uint8Array) })),
    /** The document as a `.carbonara` file: gzipped JSON. */
    exportDocument: method<Uint8Array<ArrayBuffer>>()(documentRef),
    closeDocument: method<undefined>()(documentRef),
    /** The URL fragment (without `#`) that opens a copy of the document: the compressed document itself. */
    createShareLink: method<string>()(documentRef),
    openShareLink: method<Result<DocumentInfo>>()(z.object({ fragment: z.string() })),
  },
  editing: {
    /** The document with its version, so a client knows which `documentChanged` events the snapshot includes. */
    getDocument: method<OpenDocument>()(documentRef),
    apply: method<Result<DocumentInfo>>()(
      documentRef.extend({ commands: z.array(Command).min(1), label: z.string().optional() }),
    ),
    undo: method<DocumentInfo>()(documentRef, {
      tool: "undo",
      group: "edit",
      description: "Undo the last change to a document.",
    }),
    redo: method<DocumentInfo>()(documentRef),
  },
  analysis: {
    getResults: method<AnalysisResults | null>()(documentRef.extend({ graph: z.string().default("root") })),
  },
  packs: {
    listPacks: method<PackInfo[]>()(none, {
      tool: "list_packs",
      group: "read",
      description: "List the installed game packs.",
    }),
    getPackData: method<PackData>()(z.object({ packId: z.string().min(1) })),
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
