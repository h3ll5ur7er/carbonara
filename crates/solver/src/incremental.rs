//! Re-solves only what changed: blueprint summaries are cached by the blueprint, and solutions per
//! component of the flattened model, keyed by a hash of the component's own model, so an edit re-solves
//! the components it touched and reuses the others.

use crate::decompose::{Component, components, merge};
use crate::fingerprint::fingerprint;
use crate::ir::{Model, Solution};
use crate::program::{Backend, MicroLp};
use crate::subgraphs::{Summaries, expansion, flatten};
use crate::{InvalidModel, SolveError, solve_flat, validate};
use std::collections::HashMap;

type Cache = HashMap<u64, (Model, Solution)>;

/// Solves models component by component and remembers the solutions for the next solve.
pub struct Solver<B: Backend = MicroLp> {
    backend: B,
    /// Solutions of the components the last solve used. Holding nothing else bounds the cache by one
    /// model's size: the next edit of the same document hits, everything older is gone.
    cache: Cache,
    summaries: Summaries,
    solved: usize,
    reused: usize,
    summarised: usize,
}

impl<B: Backend> Solver<B> {
    pub fn new(backend: B) -> Self {
        Solver {
            backend,
            cache: HashMap::new(),
            summaries: Summaries::default(),
            solved: 0,
            reused: 0,
            summarised: 0,
        }
    }

    pub fn solve(&mut self, model: &Model) -> Result<Solution, SolveError> {
        let (solution, counts) = self.solve_counting(model)?;
        (self.solved, self.reused, self.summarised) = counts;
        Ok(solution)
    }

    /// Solves, and counts the components solved and reused and the summaries computed.
    fn solve_counting(
        &mut self,
        model: &Model,
    ) -> Result<(Solution, (usize, usize, usize)), SolveError> {
        validate(model)?;
        if model.blueprints.is_empty() {
            // Nothing to flatten: solve the model as it is.
            self.summaries.keep_used();
            let (solution, used, solved, reused) =
                solve_components(model, &self.backend, &mut self.cache)?;
            self.cache = used;
            return Ok((solution, (solved, reused, 0)));
        }
        let flat = flatten(
            model,
            model.graph(),
            &mut self.summaries.context(&self.backend),
        )?;
        let summarised = self.summaries.take_computed();
        self.summaries.keep_used();
        let (solution, used, solved, reused) =
            solve_components(&flat.model, &self.backend, &mut self.cache)?;
        self.cache = used;
        Ok((flat.solution(&solution), (solved, reused, summarised)))
    }

    /// The inside of a blueprint's instances, for the boundary flows they get in the model's solution
    /// (docs/Architecture/Subgraphs.md, "Expand"). Reuses the model's cached solution and summaries, and
    /// leaves the counts of the last solve alone.
    pub fn expand(&mut self, model: &Model, blueprint: u32) -> Result<Solution, SolveError> {
        let (around, _) = self.solve_counting(model)?;
        if blueprint as usize >= model.blueprints.len() {
            let problem = format!("expand: no blueprint {blueprint}");
            return Err(SolveError::Invalid(InvalidModel(problem)));
        }
        let inside = expansion(model, &around, blueprint);
        let flat = flatten(
            &inside,
            inside.graph(),
            &mut self.summaries.context(&self.backend),
        )?;
        self.summaries.take_computed();
        let (solution, ..) = solve_components(&flat.model, &self.backend, &mut Cache::new())?;
        Ok(flat.solution(&solution))
    }

    /// Components the last solve had to solve.
    pub fn last_solved(&self) -> usize {
        self.solved
    }

    /// Components the last solve took from the cache.
    pub fn last_reused(&self) -> usize {
        self.reused
    }

    /// Blueprint summaries the last solve had to compute (the others came from the cache).
    pub fn last_summarised(&self) -> usize {
        self.summarised
    }

    /// Component solutions held for the next solve.
    pub fn cached(&self) -> usize {
        self.cache.len()
    }

    /// Blueprint summaries held for the next solve.
    pub fn cached_summaries(&self) -> usize {
        self.summaries.cached()
    }
}

/// Solves a flat model's components, taking what it can from `previous`. Returns the solution, the
/// cache entries it used, and how many components it solved and reused.
fn solve_components(
    model: &Model,
    backend: &impl Backend,
    previous: &mut Cache,
) -> Result<(Solution, Cache, usize, usize), SolveError> {
    let parts = components(model);
    let mut used: Cache = HashMap::with_capacity(parts.len());
    let (mut solved, mut reused) = (0, 0);
    let mut keys = Vec::with_capacity(parts.len());
    for component in &parts {
        let key = fingerprint(&component.model, &[]);
        let hit = |entry: &(Model, Solution)| entry.0 == component.model;
        if used.get(&key).is_some_and(hit) {
            reused += 1;
        } else if let Some(entry) = previous.remove(&key).filter(hit) {
            reused += 1;
            used.insert(key, entry);
        } else {
            solved += 1;
            let solution = solve_flat(&component.model, backend)?;
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
    Ok((solution, used, solved, reused))
}
