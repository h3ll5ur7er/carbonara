//! A linear program in the solver's own terms, and the backend trait that minimises it.
//! The trait is the seam for other LP libraries (clarabel for very large models, see
//! docs/Architecture/Solver.md); nothing outside this file knows microlp exists.

use crate::ir::{Comparison, Unsolvable};
use microlp::{ComparisonOp, Error, OptimizationDirection, Problem, Variable};
use std::any::Any;

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
    /// Rows whose right-hand side may differ from one solve of the program to the next (pins): a backend
    /// may start from the last solve and re-solve for the new values (`Backend::minimise_in_order_from`).
    pub parameters: Vec<usize>,
}

impl Program {
    pub fn variable(&mut self, max: f64) -> Var {
        self.bounds.push((0.0, max));
        self.bounds.len() - 1
    }

    pub fn row(&mut self, terms: Terms, op: Comparison, rhs: f64) {
        self.rows.push(Row { terms, op, rhs });
    }

    /// The same program but for the right-hand sides of its parameter rows.
    fn shaped_like(&self, other: &Program) -> bool {
        self.bounds == other.bounds
            && self.parameters == other.parameters
            && self.rows.len() == other.rows.len()
            && self
                .rows
                .iter()
                .zip(&other.rows)
                .enumerate()
                .all(|(index, (a, b))| {
                    a.terms == b.terms
                        && a.op == b.op
                        && (a.rhs == b.rhs || self.parameters.binary_search(&index).is_ok())
                })
    }
}

/// What a backend keeps of a solve, to start the next solve of the same program from: opaque to callers.
pub type Start = Box<dyn Any>;

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

    /// `minimise_in_order`, starting from what an earlier solve of a program of the same shape (other
    /// parameter values) left, if the backend can. Returns what to start the next solve from.
    fn minimise_in_order_from(
        &self,
        program: &mut Program,
        tiers: &[Tier],
        _start: Option<Start>,
    ) -> Result<(Vec<f64>, Option<Start>), BackendError> {
        Ok((self.minimise_in_order(program, tiers)?, None))
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
    // The held tiers stay in the objective: a later tier that doesn't care where in a held tier's
    // tolerance it ends up then leaves that tier at its optimum, instead of on the tolerance's edge.
    let mut held_terms = Terms::new();
    for tier in &tiers[start..] {
        let objective: Terms = tier.terms.iter().chain(&held_terms).copied().collect();
        let solved = backend.minimise(program, &objective)?;
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
                    held_terms.extend(&positive);
                    program.row(positive, Comparison::AtMost, held(best));
                }
            }
            Hold::Total => {
                held_terms.extend(&tier.terms);
                program.row(tier.terms.clone(), Comparison::AtMost, held(best));
            }
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
    /// turn comes, and is bounded by its optimum (plus the tolerance) to hold it. Each step re-optimises from the last optimal basis (dual
    /// simplex) instead of solving from scratch. Tier terms must be non-negative, so totals can start at
    /// zero; otherwise, or if microlp stumbles, one LP per tier.
    fn minimise_in_order(
        &self,
        program: &mut Program,
        tiers: &[Tier],
    ) -> Result<Vec<f64>, BackendError> {
        Ok(self.minimise_in_order_from(program, tiers, None)?.0)
    }

    /// The warm LP of `minimise_in_order`, started from the state an earlier solve of the same program
    /// left after its first objective, with the parameter rows moved to their new values. The dual simplex
    /// then needs a few pivots where a fresh LP needs thousands.
    fn minimise_in_order_from(
        &self,
        program: &mut Program,
        tiers: &[Tier],
        start: Option<Start>,
    ) -> Result<(Vec<f64>, Option<Start>), BackendError> {
        let active: Vec<&Tier> = tiers.iter().filter(|tier| !tier.terms.is_empty()).collect();
        let non_negative = active.iter().all(|tier| {
            tier.terms
                .iter()
                .all(|&(var, coefficient)| coefficient >= 0.0 && program.bounds[var].0 >= 0.0)
        });
        if active.is_empty() || !non_negative {
            return Ok((minimise_each(self, program, tiers)?, None));
        }
        let start = start
            .and_then(|start| start.downcast::<Base>().ok())
            .filter(|base| base.program.shaped_like(program) && base.tiers == shape(&active));
        // Started where the last solve started, if it combined the leading tiers as this one does.
        let solved = match warm(program, &active, true, start.as_deref()) {
            Ok(None) => warm(program, &active, false, start.as_deref()),
            other => other,
        };
        match solved {
            Ok(Some((values, base))) => Ok((values, base.or(start).map(|base| base as Start))),
            _ => Ok((minimise_each(self, program, tiers)?, None)),
        }
    }
}

/// Weight of a parameter row's adjustment in the first objective: above the 1 of a pin miss, so the first
/// solve never adjusts a row a slack could meet instead (see `warm`).
const ADJUSTMENT_COST: f64 = 2.0;

/// The values of a warm solve, and the base it made when it didn't start from one.
type Warm = (Vec<f64>, Option<Box<Base>>);

/// The state of the warm LP after its first objective, with every parameter row at its value in `program`.
struct Base {
    program: Program,
    tiers: Vec<(Terms, bool)>,
    /// The totals the warm LP minimises one after another, with their terms and whether they hold slacks.
    objectives: Vec<(Terms, bool)>,
    combine: bool,
    state: microlp::Solution,
    variables: Vec<Variable>,
    totals: Vec<Variable>,
    /// Per parameter row, the variables that move its right-hand side up and down.
    adjust: Vec<(Variable, Variable)>,
}

/// What a start must match of the tiers: their terms and holds.
fn shape(tiers: &[&Tier]) -> Vec<(Terms, bool)> {
    tiers
        .iter()
        .map(|tier| (tier.terms.clone(), matches!(tier.hold, Hold::Slacks)))
        .collect()
}

/// The tiers in one LP, with the leading slack tiers combined when `combine` (`None` when they can't
/// all be zero), started from `start` when it combined them too. Returns the values, and the base this
/// solve made when it didn't start from one.
fn warm(
    program: &Program,
    tiers: &[&Tier],
    combine: bool,
    start: Option<&Base>,
) -> Result<Option<Warm>, BackendError> {
    let leading = if combine { leading(tiers) } else { 0 };
    let made = match start.filter(|base| base.combine == combine) {
        Some(_) => None,
        None => Some(Box::new(first(program, tiers, leading, combine)?)),
    };
    let Some(base) = made.as_deref().or(start) else {
        return Ok(None);
    };
    let mut current = base.state.clone();
    if made.is_none() {
        // The parameter rows moved by the difference of their right-hand sides.
        for (&row, &(up, down)) in program.parameters.iter().zip(&base.adjust) {
            let difference = program.rows[row].rhs - base.program.rows[row].rhs;
            if difference != 0.0 {
                // `row + up − down = old rhs`: the row is at the new one with `down − up = difference`.
                current = solution(current.fix_var(up, (-difference).max(0.0)))?;
                current = solution(current.fix_var(down, difference.max(0.0)))?;
            }
        }
    }
    let (variables, totals) = (&base.variables, &base.totals);
    let total_row = |k: usize, terms: &[(Var, f64)]| -> Vec<(Variable, f64)> {
        let mut row: Vec<(Variable, f64)> = terms
            .iter()
            .map(|&(var, coefficient)| (variables[var], -coefficient))
            .collect();
        row.push((totals[k], 1.0));
        row
    };
    let last = base.objectives.len() - 1;
    for (k, (terms, slacks)) in base.objectives.iter().enumerate() {
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
        // Held below its tolerance, but still in the objective: later tiers that don't care leave it at
        // its optimum rather than on the tolerance's edge.
        current =
            solution(current.add_constraint([(totals[k], 1.0)], ComparisonOp::Le, held(best)))?;
    }
    let values = variables
        .iter()
        .map(|&var| current.var_value_raw(var))
        .collect();
    Ok(Some((values, made)))
}

/// The warm LP solved for its first objective from scratch. Each parameter row gets two adjustments,
/// `row + up − down = rhs`, free while the first objective is solved but dearer than any slack in it, so
/// they stay at zero; then they're fixed at zero. A later solve of the same program with other right-hand
/// sides starts from this state and fixes them at the differences instead.
fn first(
    program: &Program,
    tiers: &[&Tier],
    leading: usize,
    combine: bool,
) -> Result<Base, BackendError> {
    let mut problem = Problem::new(OptimizationDirection::Minimize);
    let variables = add_variables(&mut problem, program, &vec![0.0; program.bounds.len()]);
    let adjust: Vec<(Variable, Variable)> = program
        .parameters
        .iter()
        .map(|_| {
            let up = problem.add_var(ADJUSTMENT_COST, (0.0, f64::INFINITY));
            (up, problem.add_var(ADJUSTMENT_COST, (0.0, f64::INFINITY)))
        })
        .collect();
    let adjustments = |row: usize| {
        let at = program.parameters.binary_search(&row).ok()?;
        let (up, down) = adjust[at];
        Some([(up, 1.0), (down, -1.0)])
    };
    add_rows(&mut problem, program, &variables, adjustments);
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
    let mut row: Vec<(Variable, f64)> = objectives[0]
        .0
        .iter()
        .map(|&(var, coefficient)| (variables[var], -coefficient))
        .collect();
    row.push((totals[0], 1.0));
    problem.add_constraint(row, ComparisonOp::Ge, 0.0);
    let mut state = solution(problem.solve())?;
    for &(up, down) in &adjust {
        state = solution(state.fix_var(up, 0.0))?;
        state = solution(state.fix_var(down, 0.0))?;
    }
    Ok(Base {
        program: program.clone(),
        tiers: shape(tiers),
        objectives,
        combine,
        state,
        variables,
        totals,
        adjust,
    })
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
    let variables = add_variables(&mut problem, program, costs);
    add_rows::<0>(&mut problem, program, &variables, |_| None);
    (problem, variables)
}

fn add_variables(problem: &mut Problem, program: &Program, costs: &[f64]) -> Vec<Variable> {
    program
        .bounds
        .iter()
        .zip(costs)
        .map(|(&bounds, &cost)| problem.add_var(cost, bounds))
        .collect()
}

/// The program's rows, each with the extra terms `extra` gives it.
fn add_rows<const N: usize>(
    problem: &mut Problem,
    program: &Program,
    variables: &[Variable],
    extra: impl Fn(usize) -> Option<[(Variable, f64); N]>,
) {
    for (index, row) in program.rows.iter().enumerate() {
        let mut terms: Vec<(Variable, f64)> = merged(&row.terms)
            .into_iter()
            .map(|(var, coefficient)| (variables[var], coefficient))
            .collect();
        terms.extend(extra(index).into_iter().flatten());
        let op = match row.op {
            Comparison::AtMost => ComparisonOp::Le,
            Comparison::Equal => ComparisonOp::Eq,
            Comparison::AtLeast => ComparisonOp::Ge,
        };
        problem.add_constraint(terms, op, row.rhs);
    }
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
