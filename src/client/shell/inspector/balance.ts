// Hides how a machine count is fitted to its neighbours from the latest solve: to what the consumers downstream
// want of its main product (demand), or to what the producers upstream can spare of its inputs (supply).
// Junctions pass both through. Pure, so it's tested without a UI; the inspector pins the count it gives.
import type { Document, LocalId } from "../../../contracts/document";
import type { Id, PackData } from "../../../contracts/pack";
import type { AnalysisResults } from "../../../contracts/results";

export interface Balance {
  /** Machines that make exactly what the consumers want; undefined when nothing downstream wants a set amount. */
  demand: number | undefined;
  /** Machines the producers can keep busy; undefined when nothing upstream limits it. */
  supply: number | undefined;
}

export function balanceMachines(
  document: Document,
  pack: PackData,
  results: AnalysisResults | null | undefined,
  nodeId: LocalId,
): Balance {
  const graph = document.graph;
  const node = graph.nodes[nodeId];
  if (node?.kind !== "recipe") return { demand: undefined, supply: undefined };
  const rates = perMachine(pack, results, nodeId, node.recipe, node.building);
  const flow = (edgeId: string) => results?.edges[edgeId]?.perSecond ?? 0;
  const edges = Object.entries(graph.edges);

  /** What `consumer` wants of `item` beyond what reaches it by other flows than `via`. */
  const wanted = (consumer: LocalId, item: Id, via: string, seen: Set<string>): number => {
    const target = graph.nodes[consumer];
    const others = edges
      .filter(([id, edge]) => id !== via && edge.to === consumer && edge.item === item)
      .reduce((total, [id]) => total + flow(id), 0);
    switch (target?.kind) {
      case "sink":
        return target.targetPerSecond !== undefined ? Math.max(0, target.targetPerSecond - others) : flow(via);
      case "recipe":
        return Math.max(0, (results?.nodes[consumer]?.inputs[item] ?? 0) - others);
      case "junction": {
        if (seen.has(consumer)) return 0;
        seen.add(consumer);
        const onward = edges
          .filter(([, edge]) => edge.from === consumer && edge.item === item)
          .reduce((total, [id, edge]) => total + wanted(edge.to, item, id, seen), 0);
        return Math.max(0, onward - others);
      }
      default:
        return flow(via);
    }
  };

  /** What `producer` can spare of `item` for the flow `via`; Infinity when nothing limits it. */
  const spare = (producer: LocalId, item: Id, via: string, seen: Set<string>): number => {
    const source = graph.nodes[producer];
    const others = edges
      .filter(([id, edge]) => id !== via && edge.from === producer && edge.item === item)
      .reduce((total, [id]) => total + flow(id), 0);
    switch (source?.kind) {
      case "source":
        return source.maxPerSecond === undefined ? Infinity : Math.max(0, source.maxPerSecond - others);
      case "recipe":
        return Math.max(0, (results?.nodes[producer]?.outputs[item] ?? 0) - others);
      case "junction": {
        if (seen.has(producer)) return 0;
        seen.add(producer);
        const incoming = edges
          .filter(([, edge]) => edge.to === producer && edge.item === item)
          .reduce((total, [id, edge]) => total + spare(edge.from, item, id, seen), 0);
        return Math.max(0, incoming - others);
      }
      default:
        return flow(via);
    }
  };

  // The main product is the recipe's first output.
  const [main] = Object.keys(pack.recipes.find((recipe) => recipe.id === node.recipe)?.out ?? rates.out);
  const consumers = edges.filter(([, edge]) => edge.from === nodeId && edge.item === main);
  const mainRate = main !== undefined ? rates.out[main] : undefined;
  const demand =
    main !== undefined && mainRate && consumers.length > 0
      ? consumers.reduce((total, [id, edge]) => total + wanted(edge.to, main, id, new Set()), 0) / mainRate
      : undefined;

  const limits = Object.entries(rates.in).flatMap(([item, rate]) => {
    const feeds = edges.filter(([, edge]) => edge.to === nodeId && edge.item === item);
    if (feeds.length === 0 || rate <= 0) return [];
    const available = feeds.reduce((total, [id, edge]) => total + spare(edge.from, item, id, new Set()), 0);
    return Number.isFinite(available) ? [available / rate] : [];
  });
  return { demand, supply: limits.length > 0 ? Math.min(...limits) : undefined };
}

/** Items per second one machine takes and makes: from the solve when it ran, else from the pack's recipe. */
function perMachine(
  pack: PackData,
  results: AnalysisResults | null | undefined,
  nodeId: LocalId,
  recipeId: Id,
  buildingId: Id | undefined,
): { in: Record<Id, number>; out: Record<Id, number> } {
  const result = results?.nodes[nodeId];
  if (result && result.activity > 0) {
    const per = (rates: Record<Id, number>) =>
      Object.fromEntries(Object.entries(rates).map(([item, rate]) => [item, rate / result.activity]));
    return { in: per(result.inputs), out: per(result.outputs) };
  }
  const recipe = pack.recipes.find((candidate) => candidate.id === recipeId);
  const building = pack.buildings.find((candidate) => candidate.id === (buildingId ?? recipe?.buildings[0]));
  const crafts = (building?.speed ?? 1) / (recipe?.time ?? 1);
  const scale = (amounts: Record<Id, number>) =>
    Object.fromEntries(Object.entries(amounts).map(([item, amount]) => [item, amount * crafts]));
  return { in: scale(recipe?.in ?? {}), out: scale(recipe?.out ?? {}) };
}
