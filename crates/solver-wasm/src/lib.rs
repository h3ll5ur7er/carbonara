//! WebAssembly bindings of the solver engine. Only `src/engines/solver/` calls these.
//! Values cross the boundary as JSON text shaped like the IR types in `src/contracts/ir/`: for large
//! models, `JSON.stringify` and serde_json are several times faster than building and walking JS
//! objects field by field (measured in bench/). A `Solver` holds the last model and solution, so an edit
//! sends only the changes to the model and gets back only the changes to the solution. Solving returns
//! `{ ok: true, value } | { ok: false, error: Unsolvable }` (the value a `Solution`, or `SolutionChanges`);
//! anything else (an inconsistent model, a failing LP backend) is a bug and throws.
use carbonara_solver::SolveError;
use carbonara_solver::ir::{Model, ModelChanges, Unsolvable};
use serde::Serialize;
use wasm_bindgen::prelude::*;

/// Version of the solver IR the module understands.
#[wasm_bindgen(js_name = irVersion)]
pub fn ir_version() -> u32 {
    carbonara_solver::IR_VERSION
}

fn model(json: &str) -> Result<Model, JsError> {
    serde_json::from_str(json)
        .map_err(|error| JsError::new(&format!("not a solver model: {error}")))
}

fn changes(json: &str) -> Result<ModelChanges, JsError> {
    serde_json::from_str(json).map_err(|error| JsError::new(&format!("not model changes: {error}")))
}

/// Throws when the model doesn't match the IR or isn't internally consistent.
#[wasm_bindgen(js_name = validateModel)]
pub fn validate_model(json: &str) -> Result<(), JsError> {
    carbonara_solver::validate(&model(json)?)?;
    Ok(())
}

/// Solves a model from scratch.
#[wasm_bindgen]
pub fn solve(json: &str) -> Result<String, JsError> {
    outcome(carbonara_solver::solve(&model(json)?))
}

/// Solves a document's models one after another, re-solving only the components that changed since the
/// last one. Keep one per document.
#[wasm_bindgen]
pub struct Solver(carbonara_solver::Solver);

#[wasm_bindgen]
impl Solver {
    #[wasm_bindgen(constructor)]
    #[allow(clippy::new_without_default)] // wasm-bindgen constructors can't come from `Default`
    pub fn new() -> Solver {
        Solver(carbonara_solver::Solver::new(
            carbonara_solver::program::MicroLp,
        ))
    }

    /// `ModelChanges` to the model of the last call in, `SolutionChanges` to its solution out.
    #[wasm_bindgen(js_name = solveChanges)]
    pub fn solve_changes(&mut self, json: &str) -> Result<String, JsError> {
        outcome(self.0.solve_changes(changes(json)?))
    }

    /// The inside of a blueprint's instances in the last model with `ModelChanges` made to it, for the
    /// boundary flows they get there. Returns a whole `Solution` of the blueprint's inside.
    #[wasm_bindgen(js_name = expandChanges)]
    pub fn expand_changes(&mut self, json: &str, blueprint: u32) -> Result<String, JsError> {
        outcome(self.0.expand_changes(changes(json)?, blueprint))
    }

    /// Forgets the last model and solution: the next call sends the whole model again.
    pub fn forget(&mut self) {
        self.0.forget();
    }

    /// Components the last solve had to solve (the others came from the cache).
    #[wasm_bindgen(js_name = lastSolved)]
    pub fn last_solved(&self) -> usize {
        self.0.last_solved()
    }

    /// Blueprint summaries the last solve had to compute (the others came from the cache).
    #[wasm_bindgen(js_name = lastSummarised)]
    pub fn last_summarised(&self) -> usize {
        self.0.last_summarised()
    }
}

#[derive(Serialize)]
#[serde(untagged)]
enum Outcome<T> {
    Solved { ok: bool, value: T },
    Unsolvable { ok: bool, error: Unsolvable },
}

fn outcome<T: Serialize>(result: Result<T, SolveError>) -> Result<String, JsError> {
    let outcome = match result {
        Ok(value) => Outcome::Solved { ok: true, value },
        Err(SolveError::Unsolvable(error)) => Outcome::Unsolvable { ok: false, error },
        Err(bug) => return Err(bug.into()),
    };
    serde_json::to_string(&outcome).map_err(|error| JsError::new(&error.to_string()))
}
