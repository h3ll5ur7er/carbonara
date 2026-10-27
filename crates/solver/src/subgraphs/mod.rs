//! How subgraphs are solved (docs/Architecture/Subgraphs.md). Bottom-up, each blueprint is summarised
//! by the boundary flows it can produce: one macro recipe when it runs in one way only, a few modes the
//! LP around it combines, or nothing (it is inlined) when it can run in too many independent ways.
//! Summaries are cached by the blueprint's closure, so all instances of a blueprint share one and an edit
//! of one blueprint recomputes only its own.

mod closure;
mod flatten;
mod hull;
mod summary;

pub use flatten::{Flat, flatten};

use crate::SolveError;
use crate::fingerprint::fingerprint;
use crate::ir::{Comparison, Constraint, Model, Term};
use crate::program::Backend;
use closure::{Closure, closure};
use std::collections::{HashMap, HashSet};
use std::ops::Range;
use std::rc::Rc;
use summary::{Summary, summarise};

/// A blueprint's summary, with the way back from its closure's numbering to the model's.
pub struct Resolved {
    summary: Rc<Summary>,
    /// The model's item for each closure item.
    items: Vec<u32>,
    /// The model's blueprint for each blueprint nested in the closure.
    blueprints: Vec<u32>,
}

/// Where flattening gets summaries from.
pub trait Context {
    /// The summary of one of `model`'s blueprints, or `None` to inline it.
    fn summary(&mut self, model: &Model, blueprint: u32) -> Result<Option<Resolved>, SolveError>;
}

/// Inlines every instance: the reference that summaries must agree with.
pub struct InlineAll;

impl Context for InlineAll {
    fn summary(&mut self, _: &Model, _: u32) -> Result<Option<Resolved>, SolveError> {
        Ok(None)
    }
}

/// Summaries by closure. Holds what the last solve used, like the component cache.
#[derive(Default)]
pub struct Summaries {
    entries: HashMap<u64, (Closure, Rc<Summary>)>,
    used: HashSet<u64>,
    computed: usize,
}

impl Summaries {
    pub fn context<'a, B: Backend>(&'a mut self, backend: &'a B) -> Summarising<'a, B> {
        Summarising {
            cache: self,
            backend,
        }
    }

    /// Forgets the summaries no solve used since the last call.
    pub fn keep_used(&mut self) {
        let used = std::mem::take(&mut self.used);
        self.entries.retain(|key, _| used.contains(key));
    }

    /// Summaries computed (not taken from the cache) since the last call.
    pub fn take_computed(&mut self) -> usize {
        std::mem::take(&mut self.computed)
    }

    pub fn cached(&self) -> usize {
        self.entries.len()
    }
}

pub struct Summarising<'a, B> {
    cache: &'a mut Summaries,
    backend: &'a B,
}

impl<B: Backend> Context for Summarising<'_, B> {
    fn summary(&mut self, model: &Model, blueprint: u32) -> Result<Option<Resolved>, SolveError> {
        let closure = closure(model, blueprint);
        let key = fingerprint(&closure.model, &closure.ports);
        self.cache.used.insert(key);
        let hit =
            self.cache.entries.get(&key).filter(|(cached, _)| {
                cached.model == closure.model && cached.ports == closure.ports
            });
        let summary = match hit {
            Some((_, summary)) => summary.clone(),
            None => {
                let backend = self.backend;
                let summary = Rc::new(summarise(&closure, self, backend)?);
                self.cache.computed += 1;
                self.cache
                    .entries
                    .insert(key, (closure.clone(), summary.clone()));
                summary
            }
        };
        Ok(Some(Resolved {
            summary,
            items: closure.items,
            blueprints: closure.blueprints,
        }))
    }
}

/// Turns the pins of `nodes` into ratios to the activity of `scale`: `x − pin · scale = 0`. A
/// blueprint's pins set its design; an instance at scale `t` runs it with every pin times `t`.
/// Returns whether there were any pins.
pub fn scale_pins(model: &mut Model, nodes: Range<usize>, scale: u32) -> bool {
    let mut any = false;
    for n in nodes {
        if let Some(pin) = model.nodes[n].pin.take() {
            any = true;
            model.constraints.push(Constraint {
                terms: vec![
                    Term {
                        node: n as u32,
                        coefficient: 1.0,
                    },
                    Term {
                        node: scale,
                        coefficient: -pin,
                    },
                ],
                op: Comparison::Equal,
                rhs: 0.0,
            });
        }
    }
    any
}
