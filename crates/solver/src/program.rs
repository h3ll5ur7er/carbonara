//! A linear program in the solver's own terms, and the backend trait that minimises it.
//! The trait is the seam for other LP libraries (clarabel for very large models, see
//! docs/Architecture/Solver.md); nothing outside this file knows microlp exists.

use crate::ir::{Comparison, Unsolvable};
use microlp::{ComparisonOp, Error, OptimizationDirection, Problem, Variable};

/// Index of a variable in a [`Program`].
pub type Var = usize;

/// `Σ coefficient · variable`
pub type Terms = Vec<(Var, f64)>;

#[derive(Debug, Clone, PartialEq)]
pub struct Row {
    pub terms: Terms,
    pub op: Comparison,
    pub rhs: f64,
}

/// Variables with bounds, and linear constraints over them.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Program {
    /// `(min, max)` per variable; `max` may be infinite.
    pub bounds: Vec<(f64, f64)>,
    pub rows: Vec<Row>,
}

impl Program {
    pub fn variable(&mut self, max: f64) -> Var {
        self.bounds.push((0.0, max));
        self.bounds.len() - 1
    }

    pub fn row(&mut self, terms: Terms, op: Comparison, rhs: f64) {
        self.rows.push(Row { terms, op, rhs });
    }
}

/// An objective, minimised without worsening the tiers before it.
pub struct Tier {
    pub terms: Terms,
    pub hold: Hold,
}

/// How a solved tier is kept at its optimum while later tiers are minimised.
pub enum Hold {
    /// Slacks at zero stay at zero and the others keep their total, so later tiers can't move a
    /// shortage to a port that had none (which used to show up as spurious diagnostics).
    Slacks,
    /// Only the total is kept.
    Total,
}

#[derive(Debug, Clone, PartialEq)]
pub enum BackendError {
    Unsolvable(Unsolvable),
    /// The LP library gave up for another reason: a bug or numerical trouble, not a user error.
    Failed(String),
}

/// Minimises linear objectives over a program; returns the value of every variable.
pub trait Backend {
    fn minimise(
        &self,
        program: &Program,
        objective: &[(Var, f64)],
    ) -> Result<Vec<f64>, BackendError>;

    /// Lexicographic minimisation: each tier is minimised, then held at its optimum for the tiers after
    /// it. Holds may be added to `program`. By default, one fresh LP per tier.
    fn minimise_in_order(
        &self,
        program: &mut Program,
        tiers: &[Tier],
    ) -> Result<Vec<f64>, BackendError> {
        minimise_each(self, program, tiers)
    }
}

/// How far a held tier may move, relative to its value, so that floating-point noise can't make a
/// later tier infeasible. microlp's values are accurate to about 1e-8.
const HOLD_TOLERANCE: f64 = 1e-8;

/// Below microlp's own working tolerance: a slack this small is zero.
const ZERO: f64 = 1e-10;

/// The leading slack tiers, when there are several: if they can all be zero at once, one LP proves it
/// and they're held at zero together. Exact and measured (bench/): a plan without shortages then needs
/// fewer LPs; one with shortages needs one more.
fn leading(tiers: &[&Tier]) -> usize {
    let count = tiers
        .iter()
        .take_while(|tier| matches!(tier.hold, Hold::Slacks))
        .count();
    if count > 1 { count } else { 0 }
}

/// Lexicographic minimisation with one fresh LP per tier.
pub fn minimise_each<B: Backend + ?Sized>(
    backend: &B,
    program: &mut Program,
    tiers: &[Tier],
) -> Result<Vec<f64>, BackendError> {
    let tiers: Vec<&Tier> = tiers.iter().filter(|tier| !tier.terms.is_empty()).collect();
    let mut values = None;
    let leading = leading(&tiers);
    let mut start = 0;
    if leading > 0 {
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
        let best: f64 = tier.terms.iter().map(|&(var, c)| c * solved[var]).sum();
        match tier.hold {
            Hold::Slacks => {
                // A zero slack sits on its bound, so holding it at exactly zero stays feasible, and later
                // tiers can't nudge a met pin by the tolerance.
                let (zero, positive): (Terms, Terms) = tier
                    .terms
                    .iter()
                    .partition(|&&(var, _)| solved[var] <= ZERO);
                for (var, _) in zero {
                    program.bounds[var].1 = 0.0;
                }
                if !positive.is_empty() {
                    program.row(positive, Comparison::AtMost, held(best));
                }
            }
            Hold::Total => program.row(tier.terms.clone(), Comparison::AtMost, held(best)),
        }
        values = Some(solved);
    }
    match values {
        Some(values) => Ok(values),
        None => backend.minimise(program, &[]),
    }
}

/// The most a held tier may come to.
fn held(best: f64) -> f64 {
    best + HOLD_TOLERANCE * (1.0 + best.abs())
}

/// `microlp` (pure Rust, so it builds for WebAssembly without a C toolchain).
pub struct MicroLp;

impl Backend for MicroLp {
    fn minimise(
        &self,
        program: &Program,
        objective: &[(Var, f64)],
    ) -> Result<Vec<f64>, BackendError> {
        let mut costs = vec![0.0; program.bounds.len()];
        for &(var, coefficient) in objective {
            costs[var] += coefficient;
        }
        let (problem, variables) = problem(program, &costs);
        let solution = solution(problem.solve())?;
        Ok(variables
            .iter()
            .map(|&var| solution.var_value_raw(var))
            .collect())
    }

    /// One LP for all tiers: each tier's total `t ≥ Σ terms` joins the objective `Σ t` when the tier's
    /// turn comes, and is fixed to hold it. Each step re-optimises from the last optimal basis (dual
    /// simplex) instead of solving from scratch. Tier terms must be non-negative, so totals can start at
    /// zero; otherwise, or if microlp stumbles, one LP per tier.
    fn minimise_in_order(
        &self,
        program: &mut Program,
        tiers: &[Tier],
    ) -> Result<Vec<f64>, BackendError> {
        let active: Vec<&Tier> = tiers.iter().filter(|tier| !tier.terms.is_empty()).collect();
        let non_negative = active.iter().all(|tier| {
            tier.terms
                .iter()
                .all(|&(var, coefficient)| coefficient >= 0.0 && program.bounds[var].0 >= 0.0)
        });
        if active.is_empty() || !non_negative {
            return minimise_each(self, program, tiers);
        }
        let solved = match warm(program, &active, true) {
            Ok(None) => warm(program, &active, false),
            other => other,
        };
        match solved {
            Ok(Some(values)) => Ok(values),
            _ => minimise_each(self, program, tiers),
        }
    }
}

/// The tiers in one LP, with the leading slack tiers combined when `combine` (`None` when they can't
/// all be zero).
fn warm(
    program: &Program,
    tiers: &[&Tier],
    combine: bool,
) -> Result<Option<Vec<f64>>, BackendError> {
    let (mut problem, variables) = problem(program, &vec![0.0; program.bounds.len()]);
    let leading = if combine { leading(tiers) } else { 0 };
    // One total per objective: the combined leading tiers, if any, then each tier after them; each with
    // its terms (each variable once) and whether it holds slacks.
    let combined = (leading > 0).then(|| {
        let terms: Terms = tiers[..leading]
            .iter()
            .flat_map(|tier| tier.terms.iter().copied())
            .collect();
        (merged(&terms), true)
    });
    let objectives: Vec<(Terms, bool)> = combined
        .into_iter()
        .chain(
            tiers[leading..]
                .iter()
                .map(|tier| (merged(&tier.terms), matches!(tier.hold, Hold::Slacks))),
        )
        .collect();
    let totals: Vec<Variable> = objectives
        .iter()
        .map(|_| problem.add_var(1.0, (0.0, f64::INFINITY)))
        .collect();
    let total_row = |k: usize, terms: &[(Var, f64)]| -> Vec<(Variable, f64)> {
        let mut row: Vec<(Variable, f64)> = terms
            .iter()
            .map(|&(var, coefficient)| (variables[var], -coefficient))
            .collect();
        row.push((totals[k], 1.0));
        row
    };
    problem.add_constraint(total_row(0, &objectives[0].0), ComparisonOp::Ge, 0.0);
    let mut current = solution(problem.solve())?;
    let last = objectives.len() - 1;
    for (k, (terms, slacks)) in objectives.iter().enumerate() {
        if k > 0 {
            let row = total_row(k, terms);
            current = solution(current.add_constraint(row, ComparisonOp::Ge, 0.0))?;
        }
        let value = |var: Var| current.var_value_raw(variables[var]);
        let best: f64 = terms.iter().map(|&(var, c)| c * value(var)).sum();
        if k == 0 && leading > 0 && best > ZERO {
            return Ok(None);
        }
        if k == last {
            break;
        }
        let zero: Vec<(Variable, f64)> = terms
            .iter()
            .filter(|&&(var, _)| *slacks && value(var) <= ZERO)
            .map(|&(var, _)| (variables[var], 1.0))
            .collect();
        if *slacks && zero.len() == terms.len() {
            // All zero: a total of zero holds every slack at zero.
            current = solution(current.fix_var(totals[k], 0.0))?;
            continue;
        }
        if !zero.is_empty() {
            current = solution(current.add_constraint(zero, ComparisonOp::Le, 0.0))?;
        }
        current = solution(current.fix_var(totals[k], held(best)))?;
    }
    Ok(Some(
        variables
            .iter()
            .map(|&var| current.var_value_raw(var))
            .collect(),
    ))
}

fn solution(
    outcome: Result<microlp::SolveOutcome, Error>,
) -> Result<microlp::Solution, BackendError> {
    outcome
        .map_err(failure)?
        .into_solution()
        .map_err(|_| BackendError::Failed("interrupted".into()))
}

/// The program as a microlp problem with these objective coefficients.
fn problem(program: &Program, costs: &[f64]) -> (Problem, Vec<Variable>) {
    let mut problem = Problem::new(OptimizationDirection::Minimize);
    let variables: Vec<Variable> = program
        .bounds
        .iter()
        .zip(costs)
        .map(|(&bounds, &cost)| problem.add_var(cost, bounds))
        .collect();
    for row in &program.rows {
        let terms: Vec<(Variable, f64)> = merged(&row.terms)
            .into_iter()
            .map(|(var, coefficient)| (variables[var], coefficient))
            .collect();
        let op = match row.op {
            Comparison::AtMost => ComparisonOp::Le,
            Comparison::Equal => ComparisonOp::Eq,
            Comparison::AtLeast => ComparisonOp::Ge,
        };
        problem.add_constraint(terms, op, row.rhs);
    }
    (problem, variables)
}

/// Terms with each variable once (microlp refuses repeats), in variable order.
fn merged(terms: &[(Var, f64)]) -> Terms {
    let mut sorted = terms.to_vec();
    sorted.sort_by_key(|&(var, _)| var);
    let mut merged: Terms = Vec::with_capacity(sorted.len());
    for (var, coefficient) in sorted {
        match merged.last_mut() {
            Some((last, sum)) if *last == var => *sum += coefficient,
            _ => merged.push((var, coefficient)),
        }
    }
    merged
}

fn failure(error: Error) -> BackendError {
    match error {
        Error::Infeasible => BackendError::Unsolvable(Unsolvable::Infeasible),
        Error::Unbounded => BackendError::Unsolvable(Unsolvable::Unbounded),
        other => BackendError::Failed(other.to_string()),
    }
}
