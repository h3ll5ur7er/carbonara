//! Re-solves only what changed: solutions are cached per component, keyed by a hash of the component's
//! own model, so an edit re-solves the components it touched and reuses the others.

use crate::decompose::{Component, components, merge};
use crate::ir::{Model, Solution};
use crate::program::{Backend, MicroLp};
use crate::{SolveError, solve_whole, validate};
use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};

/// Solves models component by component and remembers the solutions for the next solve.
pub struct Solver<B: Backend = MicroLp> {
    backend: B,
    /// Solutions of the components the last solve used. Holding nothing else bounds the cache by one
    /// model's size: the next edit of the same document hits, everything older is gone.
    cache: HashMap<u64, (Model, Solution)>,
    solved: usize,
    reused: usize,
}

impl<B: Backend> Solver<B> {
    pub fn new(backend: B) -> Self {
        Solver {
            backend,
            cache: HashMap::new(),
            solved: 0,
            reused: 0,
        }
    }

    pub fn solve(&mut self, model: &Model) -> Result<Solution, SolveError> {
        validate(model)?;
        let parts = components(model);
        let mut used: HashMap<u64, (Model, Solution)> = HashMap::with_capacity(parts.len());
        let (mut solved, mut reused) = (0, 0);
        let mut keys = Vec::with_capacity(parts.len());
        for component in &parts {
            let key = fingerprint(&component.model);
            let hit = |entry: &(Model, Solution)| entry.0 == component.model;
            if used.get(&key).is_some_and(hit) {
                reused += 1;
            } else if let Some(entry) = self.cache.remove(&key).filter(hit) {
                reused += 1;
                used.insert(key, entry);
            } else {
                solved += 1;
                let solution = solve_whole(&component.model, &self.backend)?;
                used.insert(key, (component.model.clone(), solution));
            }
            keys.push(key);
        }
        let pieces: Vec<(&Component, &Solution)> = parts
            .iter()
            .zip(&keys)
            .map(|(component, key)| (component, &used[key].1))
            .collect();
        let solution = merge(model, &pieces);
        self.cache = used;
        (self.solved, self.reused) = (solved, reused);
        Ok(solution)
    }

    /// Components the last solve had to solve.
    pub fn last_solved(&self) -> usize {
        self.solved
    }

    /// Components the last solve took from the cache.
    pub fn last_reused(&self) -> usize {
        self.reused
    }

    /// Component solutions held for the next solve.
    pub fn cached(&self) -> usize {
        self.cache.len()
    }
}

/// A hash of everything in a model. Equal models hash equally; a collision is caught by comparing models.
fn fingerprint(model: &Model) -> u64 {
    let mut hasher = DefaultHasher::new();
    let number = |value: f64, hasher: &mut DefaultHasher| value.to_bits().hash(hasher);
    model.items.hash(&mut hasher);
    model.nodes.len().hash(&mut hasher);
    for node in &model.nodes {
        node.kind.hash(&mut hasher);
        node.rates.len().hash(&mut hasher);
        for rate in &node.rates {
            rate.item.hash(&mut hasher);
            number(rate.per_second, &mut hasher);
        }
        node.max.map(f64::to_bits).hash(&mut hasher);
        node.pin.map(f64::to_bits).hash(&mut hasher);
        number(node.cost, &mut hasher);
    }
    model.edges.len().hash(&mut hasher);
    for edge in &model.edges {
        (edge.from, edge.to, edge.item).hash(&mut hasher);
        edge.capacity.map(f64::to_bits).hash(&mut hasher);
        edge.ratio.map(f64::to_bits).hash(&mut hasher);
    }
    model.constraints.len().hash(&mut hasher);
    for constraint in &model.constraints {
        constraint.terms.len().hash(&mut hasher);
        for term in &constraint.terms {
            term.node.hash(&mut hasher);
            number(term.coefficient, &mut hasher);
        }
        constraint.op.hash(&mut hasher);
        number(constraint.rhs, &mut hasher);
    }
    hasher.finish()
}
