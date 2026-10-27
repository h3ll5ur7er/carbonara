//! Hashes of models, the keys of the solver's caches. Equal models hash equally; a collision is caught
//! by comparing the models themselves.

use crate::graph::Graph;
use crate::ir::Model;
use std::hash::{DefaultHasher, Hash, Hasher};

/// A hash of everything in a model, its blueprints included, and of `extra` (e.g. a blueprint's ports).
pub fn fingerprint(model: &Model, extra: &[u32]) -> u64 {
    let mut hasher = DefaultHasher::new();
    model.items.hash(&mut hasher);
    graph(model.graph(), &mut hasher);
    model.blueprints.len().hash(&mut hasher);
    for blueprint in &model.blueprints {
        graph(blueprint.graph(), &mut hasher);
        blueprint.ports.hash(&mut hasher);
    }
    extra.hash(&mut hasher);
    hasher.finish()
}

fn graph(graph: Graph, hasher: &mut DefaultHasher) {
    let number = |value: f64, hasher: &mut DefaultHasher| value.to_bits().hash(hasher);
    graph.nodes.len().hash(hasher);
    for node in graph.nodes {
        node.kind.hash(hasher);
        node.rates.len().hash(hasher);
        for rate in &node.rates {
            rate.item.hash(hasher);
            number(rate.per_second, hasher);
        }
        node.max.map(f64::to_bits).hash(hasher);
        node.pin.map(f64::to_bits).hash(hasher);
        number(node.cost, hasher);
        node.blueprint.hash(hasher);
    }
    graph.edges.len().hash(hasher);
    for edge in graph.edges {
        (edge.from, edge.to, edge.item).hash(hasher);
        edge.capacity.map(f64::to_bits).hash(hasher);
        edge.ratio.map(f64::to_bits).hash(hasher);
        (edge.from_port, edge.to_port).hash(hasher);
    }
    graph.constraints.len().hash(hasher);
    for constraint in graph.constraints {
        constraint.terms.len().hash(hasher);
        for term in &constraint.terms {
            term.node.hash(hasher);
            number(term.coefficient, hasher);
        }
        constraint.op.hash(hasher);
        number(constraint.rhs, hasher);
    }
}
