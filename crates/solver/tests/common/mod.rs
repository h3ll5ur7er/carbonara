//! Builders that keep the solver tests readable as specifications.
#![allow(dead_code)]

use carbonara_solver::ir::*;

pub fn process(rates: &[(u32, f64)]) -> Node {
    Node {
        kind: NodeKind::Process,
        rates: rates
            .iter()
            .map(|&(item, per_second)| Rate { item, per_second })
            .collect(),
        max: None,
        pin: None,
        cost: 0.0,
    }
}

pub fn junction() -> Node {
    Node {
        kind: NodeKind::Junction,
        rates: vec![],
        max: None,
        pin: None,
        cost: 0.0,
    }
}

/// A source of one item: activity = items per second, costing 1 per item so raw use is minimised.
pub fn source(item: u32) -> Node {
    Node {
        cost: 1.0,
        ..process(&[(item, 1.0)])
    }
}

pub fn sink(item: u32) -> Node {
    process(&[(item, -1.0)])
}

pub fn pinned(node: Node, pin: f64) -> Node {
    Node {
        pin: Some(pin),
        ..node
    }
}

pub fn limited(node: Node, max: f64) -> Node {
    Node {
        max: Some(max),
        ..node
    }
}

pub fn edge(from: u32, to: u32, item: u32) -> Edge {
    Edge {
        from,
        to,
        item,
        capacity: None,
        ratio: None,
    }
}

pub fn model(items: u32, nodes: Vec<Node>, edges: Vec<Edge>) -> Model {
    Model {
        items,
        nodes,
        edges,
        constraints: vec![],
    }
}

pub const TOLERANCE: f64 = 1e-6;

pub fn close(actual: f64, expected: f64) -> bool {
    (actual - expected).abs() <= TOLERANCE * (1.0 + expected.abs())
}

#[track_caller]
pub fn assert_close(actual: f64, expected: f64) {
    assert!(close(actual, expected), "expected {expected}, got {actual}");
}

#[track_caller]
pub fn assert_all_close(actual: &[f64], expected: &[f64]) {
    assert_eq!(actual.len(), expected.len(), "{actual:?} vs {expected:?}");
    for (a, e) in actual.iter().zip(expected) {
        assert!(close(*a, *e), "expected {expected:?}, got {actual:?}");
    }
}

pub fn total(slacks: &[PortSlack]) -> f64 {
    slacks.iter().map(|slack| slack.per_second).sum()
}
