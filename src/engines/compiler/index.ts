// The compiler engine: document + pack + plugin → solver IR, and the solver's answer → analysis results.
// It hides how a game's concepts map onto the solver IR; plugins hook in here, never into the solver.
export { compile, compileMemo, type CompileInput, type CompileMemo, type Compiled, type NodeInfo } from "./compile";
export { describePlugin, unavailableRecipes } from "./hooks";
export { findBlueprint } from "./instances";
export { toResults } from "./results";
export { localRuntime, runtimeOf } from "./runtime";
