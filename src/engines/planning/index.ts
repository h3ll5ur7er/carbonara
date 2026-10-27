// The planning engine: how goals become factories. It hides which recipes a plan considers (the
// superstructure), what makes one plan better than another (the objective) and how a solved plan is shaped
// into a proposal (nodes, flows, layout, placement, summary), and what rates people mean ("2 full yellow belts").
// Pure: the manager compiles and solves in between.
export { buildSuperstructure, type Role, type Superstructure, type SuperstructureInput } from "./superstructure";
export { weigh } from "./objective";
export { placeProposal, propose, type ProposeInput } from "./proposal";
export { convertRate } from "./rates";
export { rank, rivals } from "./compare";
