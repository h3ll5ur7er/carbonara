//! A linear program in the solver's own terms, and the backend trait that minimises it.
//! The trait is the seam for other LP libraries (clarabel for very large models, see
//! docs/Architecture/Solver.md); nothing outside this file knows good_lp or microlp exist.

use crate::ir::{Comparison, Unsolvable};
use good_lp::{
    Expression, ProblemVariables, ResolutionError, Solution, SolverModel, microlp, variable,
};

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

#[derive(Debug, Clone, PartialEq)]
pub enum BackendError {
    Unsolvable(Unsolvable),
    /// The LP library gave up for another reason: a bug or numerical trouble, not a user error.
    Failed(String),
}

/// Minimises a linear objective over a program; returns the value of every variable.
pub trait Backend {
    fn minimise(
        &self,
        program: &Program,
        objective: &[(Var, f64)],
    ) -> Result<Vec<f64>, BackendError>;
}

/// `microlp` (pure Rust, so it builds for WebAssembly without a C toolchain), driven through `good_lp`.
pub struct MicroLp;

impl Backend for MicroLp {
    fn minimise(
        &self,
        program: &Program,
        objective: &[(Var, f64)],
    ) -> Result<Vec<f64>, BackendError> {
        let mut problem = ProblemVariables::new();
        let variables: Vec<_> = program
            .bounds
            .iter()
            .map(|&(min, max)| problem.add(variable().min(min).max(max)))
            .collect();
        let expression = |terms: &[(Var, f64)]| {
            let mut sum = Expression::with_capacity(terms.len());
            for &(var, coefficient) in terms {
                sum.add_mul(coefficient, variables[var]);
            }
            sum
        };
        let mut model = problem.minimise(expression(objective)).using(microlp);
        for row in &program.rows {
            let lhs = expression(&row.terms);
            model.add_constraint(match row.op {
                Comparison::AtMost => lhs.leq(row.rhs),
                Comparison::Equal => lhs.eq(row.rhs),
                Comparison::AtLeast => lhs.geq(row.rhs),
            });
        }
        let solution = model.solve().map_err(|error| match error {
            ResolutionError::Infeasible => BackendError::Unsolvable(Unsolvable::Infeasible),
            ResolutionError::Unbounded => BackendError::Unsolvable(Unsolvable::Unbounded),
            other => BackendError::Failed(other.to_string()),
        })?;
        Ok(variables.iter().map(|&var| solution.value(var)).collect())
    }
}
