// Upgrades stored documents of older versions to the current document contract.
// Each migration takes a document of version n and returns version n + 1, so MIGRATIONS[n] upgrades n → n + 1.
import { CURRENT_DOCUMENT_VERSION, Document } from "../../contracts/document";
import type { Issue } from "../../contracts/issues";
import { fail, ok, type Result } from "../../contracts/result";

type Raw = Record<string, unknown>;

export const MIGRATIONS: ((document: Raw) => Raw)[] = [
  // 0 → 1: positions moved from the nodes into `layout`, so moving a node never changes the logical graph.
  (document) => {
    const graph = document["graph"] as { nodes: Record<string, Raw>; edges: unknown };
    const nodes: Record<string, Raw> = {};
    const root: Record<string, { x: number; y: number }> = {};
    for (const [id, { x, y, ...node }] of Object.entries(graph.nodes)) {
      nodes[id] = node;
      if (typeof x === "number" && typeof y === "number") root[id] = { x, y };
    }
    return { ...document, version: 1, graph: { ...graph, nodes }, layout: { root } };
  },
];

export function upgradeDocument(raw: unknown): Result<Document> {
  if (!isObject(raw) || raw["format"] !== "carbonara" || typeof raw["version"] !== "number") {
    return fail([{ path: [], message: "Not a Carbonara document" }]);
  }
  const version = raw["version"];
  if (version > CURRENT_DOCUMENT_VERSION) {
    return fail([{ path: ["version"], message: `Made with a newer Carbonara (document version ${version})` }]);
  }
  let document: Raw = raw;
  for (const migrate of MIGRATIONS.slice(version)) document = migrate(document);

  const parsed = Document.safeParse(document);
  if (parsed.success) return ok(parsed.data);
  return fail(
    parsed.error.issues.map((issue): Issue => ({ path: issue.path as Issue["path"], message: issue.message })),
  );
}

function isObject(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
