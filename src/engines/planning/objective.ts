// What "the best plan" means: the costs the solver minimises once the targets are met. The compiler prices
// raw inputs only; the planner also prices machines, so no free loops run and ties break towards fewer of them.
import type { LocalId } from "../../contracts/document";
import type { PlanOptions } from "../../contracts/managers";
import type { Model } from "../../contracts/solver";
import type { Role } from "./superstructure";

/** The weight of what the objective cares about second: small enough never to outweigh the first. */
export const TIE_BREAK = 1e-3;

/** The model with costs for the objective: per item/s of raw input and per machine. */
export function weigh(
  model: Model,
  nodeIds: LocalId[],
  roles: Record<LocalId, Role>,
  objective: PlanOptions["objective"],
): Model {
  const [raw, machine] = objective === "resources" ? [1, TIE_BREAK] : [TIE_BREAK, 1];
  return {
    ...model,
    nodes: model.nodes.map((node, index) => {
      const role = roles[nodeIds[index] ?? ""];
      const cost = role?.kind === "raw" ? raw : role?.kind === "recipe" ? machine : 0;
      return { ...node, cost };
    }),
  };
}
