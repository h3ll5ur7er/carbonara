// What "the best plan" means: the costs the solver minimises once the targets are met. The compiler prices
// raw inputs only; the planner also prices machines, so no free loops run and ties break towards fewer of them.
// Nodes are told apart by the compiler's conventions (docs/Architecture/Solver.md, From documents to the IR):
// a source costs 1 per item/s, a sink has one negative rate, recipes and junctions cost nothing.
import type { PlanOptions } from "../../contracts/managers";
import type { Model, ModelNode } from "../../contracts/solver";

/** The weight of what the objective cares about second: small enough never to outweigh the first. */
export const TIE_BREAK = 1e-3;

/** The model with costs for the objective: per item/s of raw input and per machine. */
export function weigh(model: Model, objective: PlanOptions["objective"]): Model {
  const [raw, machine] = objective === "resources" ? [1, TIE_BREAK] : [TIE_BREAK, 1];
  return {
    ...model,
    nodes: model.nodes.map((node) => {
      const role = roleOf(node);
      return { ...node, cost: role === "raw" ? raw : role === "machine" ? machine : 0 };
    }),
  };
}

function roleOf(node: ModelNode): "raw" | "machine" | "free" {
  if (node.kind === "junction") return "free";
  if (node.cost > 0) return "raw";
  const [only, ...others] = node.rates;
  if (only && others.length === 0 && only.perSecond < 0) return "free";
  return "machine";
}
