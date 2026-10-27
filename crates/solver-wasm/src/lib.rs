//! WebAssembly bindings of the solver engine. Only `src/engines/solver/` calls these.
use wasm_bindgen::prelude::*;

/// Version of the solver IR the module understands.
#[wasm_bindgen(js_name = irVersion)]
pub fn ir_version() -> u32 {
    carbonara_solver::IR_VERSION
}
