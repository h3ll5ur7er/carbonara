//! The solver engine: turns the solver IR into machine counts and flows.
//! It hides the LP formulation, the LP backend, decomposition, caching and how subgraphs are summarised
//! (see docs/Architecture/Solver.md and docs/Architecture/Subgraphs.md).

/// Version of the solver IR this crate understands.
pub const IR_VERSION: u32 = 2;

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

use formulation::{Hold, Tier};
use ir::{Comparison, Model, Solution, Unsolvable};
use program::{Backend, BackendError, MicroLp, Program, Terms};
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
pub(crate) fn minimise_in_order(
    program: &mut Program,
    tiers: &[Tier],
    backend: &impl Backend,
) -> Result<Vec<f64>, SolveError> {
    let tiers: Vec<&Tier> = tiers.iter().filter(|tier| !tier.terms.is_empty()).collect();
    let mut values = None;
    // Shortcut, exact and measured (bench/): when the leading slack tiers can all be zero at once, one LP
    // proves it, and they're held at zero together. A plan without shortages then needs two LPs fewer;
    // one with shortages needs one more.
    let leading = tiers
        .iter()
        .take_while(|tier| matches!(tier.hold, Hold::EachSlack))
        .count();
    let mut start = 0;
    if leading > 1 {
        let combined: Terms = tiers[..leading]
            .iter()
            .flat_map(|tier| tier.terms.iter().copied())
            .collect();
        let solved = backend.minimise(program, &combined)?;
        if combined.iter().all(|&(var, _)| solved[var] <= ZERO) {
            for &(var, _) in &combined {
                program.bounds[var].1 = 0.0;
            }
            values = Some(solved);
            start = leading;
        }
    }
    for tier in &tiers[start..] {
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
