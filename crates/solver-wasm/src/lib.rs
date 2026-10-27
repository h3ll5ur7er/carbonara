//! WebAssembly bindings of the solver engine. Only `src/engines/solver/` calls these.
//! Values cross the boundary as plain JS objects shaped like the IR types in `src/contracts/ir/`.
use carbonara_solver::ir::Model;
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
