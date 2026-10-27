//! The solver engine: turns the solver IR into machine counts and flows.
//! It hides the LP formulation, the LP backend, decomposition and caching
//! (see docs/Architecture/Solver.md).

/// Version of the solver IR this crate understands.
pub const IR_VERSION: u32 = 1;

mod decompose;
mod formulation;
mod incremental;
pub mod ir;
pub mod program;
pub mod validate;

pub use decompose::{Component, components};
pub use incremental::Solver;

use formulation::{Hold, Tier};
use ir::{Comparison, Model, Solution, Unsolvable};
use program::{Backend, BackendError, MicroLp, Program};
pub use validate::{InvalidModel, validate};

#[derive(Debug, Clone, PartialEq)]
pub enum SolveError {
    /// The compiler built an inconsistent model: a bug.
    Invalid(InvalidModel),
    /// An expected outcome the user can fix (contradicting plugin constraints).
    Unsolvable(Unsolvable),
    /// The LP backend failed: a bug or numerical trouble.
    Backend(String),
}

impl std::fmt::Display for SolveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SolveError::Invalid(invalid) => invalid.fmt(f),
            SolveError::Unsolvable(Unsolvable::Infeasible) => write!(f, "the model is infeasible"),
            SolveError::Unsolvable(Unsolvable::Unbounded) => write!(f, "the model is unbounded"),
            SolveError::Backend(message) => write!(f, "the LP backend failed: {message}"),
        }
    }
}

impl std::error::Error for SolveError {}

impl From<InvalidModel> for SolveError {
    fn from(invalid: InvalidModel) -> Self {
        SolveError::Invalid(invalid)
    }
}

impl From<BackendError> for SolveError {
    fn from(error: BackendError) -> Self {
        match error {
            BackendError::Unsolvable(reason) => SolveError::Unsolvable(reason),
            BackendError::Failed(message) => SolveError::Backend(message),
        }
    }
}

/// Solves a model component by component with the default backend.
pub fn solve(model: &Model) -> Result<Solution, SolveError> {
    Solver::new(MicroLp).solve(model)
}

/// Solves a model as one LP, however many components it has.
pub fn solve_whole(model: &Model, backend: &impl Backend) -> Result<Solution, SolveError> {
    validate(model)?;
    let mut formulation = formulation::formulate(model);
    let values = minimise_in_order(&mut formulation.program, &formulation.tiers, backend)?;
    Ok(formulation.read(&values))
}

/// How far a held tier may move, relative to its value, so that floating-point noise can't make a
/// later tier infeasible. microlp's values are accurate to about 1e-8.
const HOLD_TOLERANCE: f64 = 1e-8;

/// Below microlp's own working tolerance: a slack this small is zero.
const ZERO: f64 = 1e-10;

/// Lexicographic minimisation: each tier is minimised, then held at its optimum for the tiers after it.
fn minimise_in_order(
    program: &mut Program,
    tiers: &[Tier],
    backend: &impl Backend,
) -> Result<Vec<f64>, SolveError> {
    let mut values = None;
    for tier in tiers.iter().filter(|tier| !tier.terms.is_empty()) {
        let solved = backend.minimise(program, &tier.terms)?;
        match tier.hold {
            Hold::EachSlack => {
                // Bounds only ever tighten: a slack's own limits stay.
                for &(var, _) in &tier.terms {
                    let value = solved[var];
                    let (min, max) = &mut program.bounds[var];
                    if value <= ZERO {
                        // A zero slack sits on its bound, so holding it at exactly zero stays feasible,
                        // and later tiers can't nudge a met pin by the tolerance.
                        *max = 0.0;
                    } else {
                        let tolerance = HOLD_TOLERANCE * (1.0 + value);
                        *min = min.max(value - tolerance);
                        *max = max.min(value + tolerance);
                    }
                }
            }
            Hold::Total => {
                let best: f64 = tier.terms.iter().map(|&(var, c)| c * solved[var]).sum();
                let limit = best + HOLD_TOLERANCE * (1.0 + best.abs());
                program.row(tier.terms.clone(), Comparison::AtMost, limit);
            }
        }
        values = Some(solved);
    }
    match values {
        Some(values) => Ok(values),
        None => Ok(backend.minimise(program, &[])?),
    }
}
