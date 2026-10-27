// The views of `McpView` (src/contracts/managers.ts): what an MCP tool passes on of its method's value. They keep
// answers small enough for a model's context, and let one method back several focused tools.
import type { OpenDocument } from "../../../contracts/access";
import type { McpView } from "../../../contracts/managers";
import type { AnalysisResults } from "../../../contracts/results";

/** Graphs with more nodes than this are summarised: listing them would crowd out everything else. */
export const GRAPH_LIST_LIMIT = 200;

/** Each view gets the value of the method its tool is declared on. */
export const views = {
  graph({ document, version }: OpenDocument) {
    const { nodes, edges } = document.graph;
    const about = {
      id: document.id,
      name: document.name,
      pack: document.pack.id,
      version,
      blueprints: Object.fromEntries(Object.entries(document.blueprints).map(([id, { name }]) => [id, name])),
    };
    const nodeList = Object.values(nodes);
    if (nodeList.length <= GRAPH_LIST_LIMIT) {
      return { ...about, nodes, edges, positions: document.layout.root ?? {} };
    }
    const nodesByKind: Record<string, number> = {};
    const recipes: Record<string, number> = {};
    const sources: Record<string, number> = {};
    const sinks: Record<string, number> = {};
    const count = (tally: Record<string, number>, key: string) => (tally[key] = (tally[key] ?? 0) + 1);
    for (const node of nodeList) {
      count(nodesByKind, node.kind);
      if (node.kind === "recipe") count(recipes, node.recipe);
      else if (node.kind === "source") count(sources, node.item);
      else if (node.kind === "sink") count(sinks, node.item);
    }
    return {
      ...about,
      summarised: true,
      nodeCount: nodeList.length,
      edgeCount: Object.keys(edges).length,
      nodesByKind,
      recipes,
      sources,
      sinks,
    };
  },
  totals: (results: AnalysisResults | null) => results && { version: results.version, totals: results.totals },
  diagnostics: (results: AnalysisResults | null) =>
    results && { version: results.version, diagnostics: results.diagnostics },
} satisfies Record<McpView, (value: never) => unknown>;
