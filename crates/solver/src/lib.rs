//! The solver engine: turns the solver IR into machine counts and flows.
//! It hides the LP formulation, the LP backend, decomposition and caching
//! (see docs/Architecture/Solver.md).

/// Version of the solver IR this crate understands.
pub const IR_VERSION: u32 = 1;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ir_version_is_one() {
        assert_eq!(IR_VERSION, 1);
    }
}
