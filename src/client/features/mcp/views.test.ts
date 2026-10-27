import { describe, expect, it } from "vitest";
import type { OpenDocument } from "../../../contracts/access";
import { Document } from "../../../contracts/document";
import { exampleDocument } from "../../../contracts/document.fixture";
import type { AnalysisResults } from "../../../contracts/results";
import { GRAPH_LIST_LIMIT, views } from "./views";

const open = (document: Document, version = 3): OpenDocument => ({ document, version });

function factory(smelters: number): Document {
  const document = Document.parse(structuredClone(exampleDocument));
  for (let index = 0; index < smelters; index++) {
    document.graph.nodes[`smelt-${index}`] = { kind: "recipe", recipe: "iron-ingot" };
  }
  return document;
}

const results: AnalysisResults = {
  documentId: "doc-1",
  version: 3,
  graph: "root",
  nodes: { smelt: { activity: 4, inputs: { "iron-ore": 2 }, outputs: { "iron-ingot": 2 } } },
  edges: { e1: { perSecond: 2 } },
  diagnostics: [{ kind: "deficit", node: "out", item: "iron-ingot", perSecond: 0.5 }],
  totals: { raw: { "iron-ore": 2 }, buildings: { smelter: 4 } },
};

describe("the graph view", () => {
  it("lists every node, edge and position of a small graph", () => {
    const view = views.graph(open(factory(0)));
    expect(view).toMatchObject({
      id: "doc-1",
      name: "Iron",
      pack: "satisfactory",
      version: 3,
      blueprints: { rods: "Iron rods" },
      nodes: exampleDocument.graph.nodes,
      edges: exampleDocument.graph.edges,
      positions: exampleDocument.layout.root,
    });
  });

  it("summarises a large graph by node kind, recipe and item instead of listing it", () => {
    const view = views.graph(open(factory(GRAPH_LIST_LIMIT)));
    expect(view).not.toHaveProperty("nodes");
    expect(view).toMatchObject({
      summarised: true,
      nodeCount: GRAPH_LIST_LIMIT + 7,
      edgeCount: 4,
      nodesByKind: { recipe: GRAPH_LIST_LIMIT + 1, source: 1, sink: 1 },
      recipes: { "iron-ingot": GRAPH_LIST_LIMIT + 1 },
      sources: { "iron-ore": 1 },
      sinks: { "iron-ingot": 1 },
    });
  });
});

describe("the results views", () => {
  it("pass on only the totals or only the diagnostics, with the version they belong to", () => {
    expect(views.totals(results)).toEqual({ version: 3, totals: results.totals });
    expect(views.diagnostics(results)).toEqual({ version: 3, diagnostics: results.diagnostics });
  });

  it("stay null while there are no results", () => {
    expect(views.totals(null)).toBeNull();
    expect(views.diagnostics(null)).toBeNull();
  });
});
