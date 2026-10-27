// The clipboard on the client: a copy as text (the system clipboard carries it to other tabs, windows and
// chats), and what the person is told when it comes from another game pack. What a copy keeps and how a paste
// lands are the editing engine's rules (src/engines/editing/clipboard.ts).
import { Clipboard } from "../../../contracts/clipboard";
import type { Graph } from "../../../contracts/document";
import type { Id, PackData } from "../../../contracts/pack";
import type { ToastInput } from "../../shell/toasts";

/** Compact JSON: it's pasted into chats, and people don't edit it by hand. */
export function clipboardText(clipboard: Clipboard): string {
  return JSON.stringify(clipboard);
}

/** The copy in the text, or null when the text is anything else (or a copy this version can't read). */
export function clipboardFromText(text: string): Clipboard | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = Clipboard.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** "1 node", "5 nodes". */
export function nodeCount(count: number): string {
  return `${count} ${count === 1 ? "node" : "nodes"}`;
}

/**
 * What to tell the person when the copy comes from another pack than the factory's: which of the recipes,
 * items, buildings and belts it uses don't exist here. Null within the same pack.
 */
export function packWarning(clipboard: Clipboard, packId: Id, pack: PackData): ToastInput | null {
  if (clipboard.pack.id === packId) return null;
  const title = `These nodes come from the ${clipboard.pack.id} pack`;
  const missing = missingIds(clipboard.graph, pack);
  const counts = (
    [
      [missing.recipes, "recipe"],
      [missing.items, "item"],
      [missing.buildings, "building"],
      [missing.logistics, "belt"],
    ] as const
  )
    .filter(([ids]) => ids.size > 0)
    .map(([ids, word]) => `${ids.size} ${word}${ids.size === 1 ? "" : "s"}`);
  if (counts.length === 0) {
    return { tone: "info", title, description: `Everything they use exists in ${packId} too.` };
  }
  const listed = counts.length === 1 ? counts[0] : `${counts.slice(0, -1).join(", ")} and ${counts.at(-1)}`;
  const verb = counts.length === 1 && counts[0]?.startsWith("1 ") ? "doesn't" : "don't";
  return {
    tone: "error",
    title,
    description: `${listed} ${verb} exist in ${packId} and will show as missing.`,
  };
}

function missingIds(graph: Graph, pack: PackData) {
  const known = {
    recipes: new Set(pack.recipes.map((recipe) => recipe.id)),
    items: new Set(pack.items.map((item) => item.id)),
    buildings: new Set(pack.buildings.map((building) => building.id)),
    logistics: new Set(pack.logistics.map((logistics) => logistics.id)),
  };
  const missing = {
    recipes: new Set<Id>(),
    items: new Set<Id>(),
    buildings: new Set<Id>(),
    logistics: new Set<Id>(),
  };
  const check = (kind: keyof typeof known, id: Id | undefined) => {
    if (id !== undefined && !known[kind].has(id)) missing[kind].add(id);
  };
  for (const node of Object.values(graph.nodes)) {
    if (node.kind === "recipe") {
      check("recipes", node.recipe);
      check("buildings", node.building);
    } else if (node.kind === "source" || node.kind === "sink" || node.kind === "port") check("items", node.item);
  }
  for (const edge of Object.values(graph.edges)) {
    check("items", edge.item);
    check("logistics", edge.logistics);
  }
  return missing;
}
