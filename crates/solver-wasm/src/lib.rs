//! WebAssembly bindings of the solver engine. Only `src/engines/solver/` calls these.
//! Values cross the boundary as plain JS objects shaped like the IR types in `src/contracts/ir/`.
//! Solving returns `{ ok: true, value: Solution } | { ok: false, error: Unsolvable }`; anything else
//! (an inconsistent model, a failing LP backend) is a bug and throws.
use carbonara_solver::SolveError;
use carbonara_solver::ir::{Model, Solution, Unsolvable};
use serde::Serialize;
use wasm_bindgen::prelude::*;

/// Version of the solver IR the module understands.
#[wasm_bindgen(js_name = irVersion)]
pub fn ir_version() -> u32 {
    carbonara_solver::IR_VERSION
}

/// Throws when the model doesn't match the IR or isn't internally consistent.
#[wasm_bindgen(js_name = validateModel)]
pub fn validate_model(model: JsValue) -> Result<(), JsError> {
    let model: Model = serde_wasm_bindgen::from_value(model)?;
    carbonara_solver::validate(&model)?;
    Ok(())
}

/// Solves a model from scratch.
#[wasm_bindgen]
pub fn solve(model: JsValue) -> Result<JsValue, JsError> {
    let model: Model = serde_wasm_bindgen::from_value(model)?;
    outcome(carbonara_solver::solve(&model))
}

/// Solves models one after another, re-solving only the components that changed since the last one.
/// Keep one per document.
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

    pub fn solve(&mut self, model: JsValue) -> Result<JsValue, JsError> {
        let model: Model = serde_wasm_bindgen::from_value(model)?;
        outcome(self.0.solve(&model))
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
enum Outcome {
    Solved { ok: bool, value: Solution },
    Unsolvable { ok: bool, error: Unsolvable },
}

fn outcome(result: Result<Solution, SolveError>) -> Result<JsValue, JsError> {
    let outcome = match result {
        Ok(value) => Outcome::Solved { ok: true, value },
        Err(SolveError::Unsolvable(error)) => Outcome::Unsolvable { ok: false, error },
        Err(bug) => return Err(bug.into()),
    };
    Ok(serde_wasm_bindgen::to_value(&outcome)?)
}
