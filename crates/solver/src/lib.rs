//! The solver engine: turns the solver IR into machine counts and flows.
//! It hides the LP formulation, the LP backend, decomposition, caching and how subgraphs are summarised
//! (see docs/Architecture/Solver.md and docs/Architecture/Subgraphs.md).

/// Version of the solver IR this crate understands.
pub const IR_VERSION: u32 = 3;

mod changes;
mod decompose;
mod fingerprint;
mod formulation;
mod graph;
mod incremental;
pub mod ir;
pub mod program;
mod subgraphs;
pub mod validate;

pub use decompose::{Component, components};
pub use incremental::Solver;

use ir::{Model, Solution, Unsolvable};
use program::{Backend, BackendError, MicroLp};
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
    if model.blueprints.is_empty() {
        return solve_flat(model, backend);
    }
    let mut summaries = subgraphs::Summaries::default();
    let flat = subgraphs::flatten(model, model.graph(), &mut summaries.context(backend))?;
    Ok(flat.solution(&solve_flat(&flat.model, backend)?))
}

/// Solves a model with every instance inlined (flattened into the LP around it) instead of summarised:
/// the reference that summaries must agree with.
pub fn solve_inline(model: &Model) -> Result<Solution, SolveError> {
    validate(model)?;
    let flat = subgraphs::flatten(model, model.graph(), &mut subgraphs::InlineAll)?;
    Ok(flat.solution(&solve_flat(&flat.model, &MicroLp)?))
}

/// One LP for a model without instances.
fn solve_flat(model: &Model, backend: &impl Backend) -> Result<Solution, SolveError> {
    Ok(solve_flat_from(model, backend, None)?.0)
}

/// `solve_flat`, starting from what an earlier solve of a model of the same shape left (`fingerprint::shape`).
fn solve_flat_from(
    model: &Model,
    backend: &impl Backend,
    start: Option<program::Start>,
) -> Result<(Solution, Option<program::Start>), SolveError> {
    let mut formulation = formulation::formulate(model);
    let (values, start) =
        backend.minimise_in_order_from(&mut formulation.program, &formulation.tiers, start)?;
    Ok((formulation.read(&values), start))
}
