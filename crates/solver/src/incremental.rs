//! Re-solves only what changed: blueprint summaries are cached by the blueprint, and solutions per
//! component of the flattened model, keyed by a hash of the component's own model, so an edit re-solves
//! the components it touched and reuses the others. It also holds the last model and solution, so callers
//! across the WebAssembly boundary send and receive only changes (`solve_changes`).

use crate::decompose::{Component, components, merge};
use crate::fingerprint::{fingerprint, shape};
use crate::ir::{Model, ModelChanges, Solution, SolutionChanges};
use crate::program::{Backend, MicroLp, Start};
use crate::subgraphs::{Summaries, expansion, flatten};
use crate::{InvalidModel, SolveError, solve_flat_from, validate};
use std::collections::HashMap;

type Cache = HashMap<u64, (Model, Solution)>;

/// Components whose LP a later solve can start from, by shape (`fingerprint::shape`). Only the most
/// recently solved few: an LP's state takes about as much memory as its matrix, and edits come in runs on
/// the same component.
#[derive(Default)]
struct Starts {
    by_shape: HashMap<u64, (Start, u64)>,
    clock: u64,
}

impl Starts {
    const KEPT: usize = 8;

    fn take(&mut self, shape: u64) -> Option<Start> {
        self.by_shape.remove(&shape).map(|(start, _)| start)
    }

    fn put(&mut self, shape: u64, start: Start) {
        self.clock += 1;
        self.by_shape.insert(shape, (start, self.clock));
        if self.by_shape.len() > Self::KEPT {
            let oldest = self.by_shape.iter().min_by_key(|(_, (_, used))| *used);
            if let Some(&oldest) = oldest.map(|(shape, _)| shape) {
                self.by_shape.remove(&oldest);
            }
        }
    }
}

/// Solves models component by component and remembers the solutions for the next solve.
pub struct Solver<B: Backend = MicroLp> {
    backend: B,
    /// Solutions of the components the last solve used. Holding nothing else bounds the cache by one
    /// model's size: the next edit of the same document hits, everything older is gone.
    cache: Cache,
    starts: Starts,
    summaries: Summaries,
    solved: usize,
    reused: usize,
    summarised: usize,
    /// The model of the last `solve_changes`, and the solution it returned.
    held: Model,
    sent: Solution,
}

impl<B: Backend> Solver<B> {
    pub fn new(backend: B) -> Self {
        Solver {
            backend,
            cache: HashMap::new(),
            starts: Starts::default(),
            summaries: Summaries::default(),
            solved: 0,
            reused: 0,
            summarised: 0,
            held: Model::default(),
            sent: Solution::default(),
        }
    }

    /// Solves the model of the last call with `changes` made to it, and returns the solution as changes to
    /// the one the last call returned. Invalid changes leave the model as it was.
    pub fn solve_changes(&mut self, changes: ModelChanges) -> Result<SolutionChanges, SolveError> {
        changes.apply(&mut self.held)?;
        let model = std::mem::take(&mut self.held);
        let solved = self.solve(&model);
        self.held = model;
        let solution = solved?;
        let changes = SolutionChanges::between(&self.sent, &solution);
        self.sent = solution;
        Ok(changes)
    }

    /// `expand` for the model of the last `solve_changes` with `changes` made to it. The next
    /// `solve_changes` changes that model.
    pub fn expand_changes(
        &mut self,
        changes: ModelChanges,
        blueprint: u32,
    ) -> Result<Solution, SolveError> {
        changes.apply(&mut self.held)?;
        let model = std::mem::take(&mut self.held);
        let expanded = self.expand(&model, blueprint);
        self.held = model;
        expanded
    }

    /// Forgets the model and solution of the last `solve_changes`: the next one sends everything again.
    pub fn forget(&mut self) {
        self.held = Model::default();
        self.sent = Solution::default();
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
                solve_components(model, &self.backend, &mut self.cache, &mut self.starts)?;
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
        let (solution, used, solved, reused) = solve_components(
            &flat.model,
            &self.backend,
            &mut self.cache,
            &mut self.starts,
        )?;
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
        let mut none = (Cache::new(), Starts::default());
        let (solution, ..) =
            solve_components(&flat.model, &self.backend, &mut none.0, &mut none.1)?;
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

/// Solves a flat model's components, taking what it can from `previous`, and starting the LPs of the
/// others from `starts` where it can. Returns the solution, the cache entries it used, and how many
/// components it solved and reused.
fn solve_components(
    model: &Model,
    backend: &impl Backend,
    previous: &mut Cache,
    starts: &mut Starts,
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
            let shape = shape(&component.model);
            let (solution, start) = solve_flat_from(&component.model, backend, starts.take(shape))?;
            if let Some(start) = start {
                starts.put(shape, start);
            }
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
