//! Builders that keep the solver tests readable as specifications.
#![allow(dead_code)]

use carbonara_solver::ir::*;
use proptest::prelude::*;

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
        blueprint: None,
    }
}

pub fn junction() -> Node {
    Node {
        kind: NodeKind::Junction,
        rates: vec![],
        max: None,
        pin: None,
        cost: 0.0,
        blueprint: None,
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
        from_port: None,
        to_port: None,
    }
}

/// A blueprint's `in` port: the item enters the blueprint here.
pub fn port_in(item: u32) -> Node {
    process(&[(item, 1.0)])
}

/// A blueprint's `out` port: the item leaves the blueprint here.
pub fn port_out(item: u32) -> Node {
    process(&[(item, -1.0)])
}

pub fn instance(blueprint: u32) -> Node {
    Node {
        kind: NodeKind::Instance,
        blueprint: Some(blueprint),
        ..process(&[])
    }
}

/// An edge into an instance's `in` port.
pub fn into_port(from: u32, to: u32, item: u32, port: u32) -> Edge {
    Edge {
        to_port: Some(port),
        ..edge(from, to, item)
    }
}

/// An edge out of an instance's `out` port.
pub fn out_of_port(from: u32, to: u32, item: u32, port: u32) -> Edge {
    Edge {
        from_port: Some(port),
        ..edge(from, to, item)
    }
}

pub fn model(items: u32, nodes: Vec<Node>, edges: Vec<Edge>) -> Model {
    Model {
        items,
        nodes,
        edges,
        constraints: vec![],
        blueprints: vec![],
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

pub const ITEMS: u32 = 4;

fn amount() -> impl Strategy<Value = f64> {
    prop::sample::select(vec![0.25, 0.5, 1.0, 1.5, 2.0, 3.0])
}

fn optional_amount() -> impl Strategy<Value = Option<f64>> {
    prop::option::weighted(0.3, (0..20u32).prop_map(|n| f64::from(n) * 0.5))
}

fn node() -> impl Strategy<Value = Node> {
    let rates =
        prop::collection::vec((0..ITEMS, amount(), any::<bool>()), 1..4).prop_map(|rates| {
            rates
                .into_iter()
                .map(|(item, amount, output)| Rate {
                    item,
                    per_second: if output { amount } else { -amount },
                })
                .collect::<Vec<_>>()
        });
    let process = (
        rates,
        optional_amount(),
        optional_amount(),
        prop::sample::select(vec![0.0, 0.5, 1.0, 2.0]),
    )
        .prop_map(|(rates, max, pin, cost)| Node {
            kind: NodeKind::Process,
            rates,
            max,
            pin,
            cost,
            blueprint: None,
        });
    prop_oneof![4 => process, 1 => Just(junction())]
}

/// Random factories, cycles and mismatched edges included. Costs are non-negative, so every one is solvable.
pub fn factory() -> impl Strategy<Value = Model> {
    prop::collection::vec(node(), 1..10).prop_flat_map(|nodes| {
        let count = nodes.len() as u32;
        let edges = prop::collection::vec(
            (
                0..count,
                0..count,
                0..ITEMS,
                prop::option::weighted(0.3, amount()),
            ),
            0..14,
        )
        .prop_map(|edges| {
            edges
                .into_iter()
                .map(|(from, to, item, capacity)| Edge {
                    capacity,
                    ..edge(from, to, item)
                })
                .collect::<Vec<_>>()
        });
        (Just(nodes), edges).prop_map(|(nodes, edges)| model(ITEMS, nodes, edges))
    })
}

/// Random blueprints: a random factory with one to three `in` ports feeding its nodes and one to three
/// `out` ports fed by them. Items may repeat across ports.
pub fn blueprint() -> impl Strategy<Value = Blueprint> {
    factory().prop_flat_map(|body| {
        let count = body.nodes.len() as u32;
        let ports = || prop::collection::vec((0..ITEMS, 0..count), 1..4);
        (Just(body), ports(), ports()).prop_map(|(body, ins, outs)| {
            let mut nodes = body.nodes;
            let mut edges = body.edges;
            let mut ports = Vec::new();
            for (item, node) in ins {
                ports.push(nodes.len() as u32);
                edges.push(edge(nodes.len() as u32, node, item));
                nodes.push(port_in(item));
            }
            for (item, node) in outs {
                ports.push(nodes.len() as u32);
                edges.push(edge(node, nodes.len() as u32, item));
                nodes.push(port_out(item));
            }
            Blueprint {
                nodes,
                edges,
                constraints: vec![],
                ports,
            }
        })
    })
}

/// The blueprint placed once, with an unlimited source at each `in` port and a sink at each `out` port,
/// each sink pinned to its target, if it has one.
pub fn placed(blueprint: &Blueprint, targets: &[Option<f64>]) -> Model {
    let mut nodes = vec![instance(0)];
    let mut edges = Vec::new();
    let mut outs = 0;
    for (port, &node) in blueprint.ports.iter().enumerate() {
        let rate = blueprint.nodes[node as usize].rates[0];
        let at = nodes.len() as u32;
        if rate.per_second > 0.0 {
            nodes.push(source(rate.item));
            edges.push(into_port(at, 0, rate.item, port as u32));
        } else {
            let target = targets.get(outs).copied().flatten();
            outs += 1;
            nodes.push(Node {
                pin: target,
                ..sink(rate.item)
            });
            edges.push(out_of_port(0, at, rate.item, port as u32));
        }
    }
    Model {
        blueprints: vec![blueprint.clone()],
        ..model(ITEMS, nodes, edges)
    }
}

pub fn targets() -> impl Strategy<Value = Vec<Option<f64>>> {
    prop::collection::vec(
        prop::option::weighted(0.7, prop::sample::select(vec![0.5, 1.0, 2.0, 3.0])),
        3,
    )
}
