//! Invariants of every solution, checked on random factories.
mod common;

use carbonara_solver::ir::*;
use carbonara_solver::solve;
use common::*;
use proptest::prelude::*;

const ITEMS: u32 = 4;

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
        });
    prop_oneof![4 => process, 1 => Just(junction())]
}

/// Random factories, cycles and mismatched edges included. Costs are non-negative, so every one is solvable.
fn factory() -> impl Strategy<Value = Model> {
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

/// Net rate of an item at a node; recipes may list an item on both sides.
fn net_rate(node: &Node, item: u32) -> f64 {
    node.rates
        .iter()
        .filter(|rate| rate.item == item)
        .map(|rate| rate.per_second)
        .sum()
}

fn slack(slacks: &[PortSlack], node: usize, item: u32) -> f64 {
    slacks
        .iter()
        .filter(|slack| slack.node as usize == node && slack.item == item)
        .map(|slack| slack.per_second)
        .sum()
}

fn flows(model: &Model, solution: &Solution, outgoing: bool, node: usize, item: u32) -> f64 {
    model
        .edges
        .iter()
        .zip(&solution.flow)
        .filter(|(edge, _)| {
            edge.item == item && (if outgoing { edge.from } else { edge.to }) as usize == node
        })
        .map(|(_, flow)| flow)
        .sum()
}

struct Objectives {
    pin_misses: f64,
    shortfall: f64,
    cost: f64,
    surplus: f64,
}

fn objectives(model: &Model, solution: &Solution) -> Objectives {
    Objectives {
        pin_misses: solution.pin_misses.iter().map(|m| m.difference.abs()).sum(),
        shortfall: total(&solution.deficit)
            + solution.overflow.iter().map(|o| o.per_second).sum::<f64>(),
        cost: model
            .nodes
            .iter()
            .zip(&solution.activity)
            .map(|(node, activity)| node.cost * activity)
            .sum(),
        surplus: total(&solution.surplus),
    }
}

/// Scales everything measured in activity or items per second; rates stay as they are.
fn scaled(model: &Model, factor: f64) -> Model {
    let mut result = model.clone();
    for node in &mut result.nodes {
        node.max = node.max.map(|max| max * factor);
        node.pin = node.pin.map(|pin| pin * factor);
    }
    for edge in &mut result.edges {
        edge.capacity = edge.capacity.map(|capacity| capacity * factor);
    }
    result
}

fn solved(model: &Model) -> Solution {
    match solve(model) {
        Ok(solution) => solution,
        Err(error) => panic!("expected a solution, got {error:?}"),
    }
}

proptest! {
    #[test]
    fn flows_are_conserved_at_every_port(model in factory()) {
        let solution = solved(&model);
        for (n, node) in model.nodes.iter().enumerate() {
            for item in 0..ITEMS {
                let out = flows(&model, &solution, true, n, item);
                let into = flows(&model, &solution, false, n, item);
                match node.kind {
                    NodeKind::Junction => prop_assert!(close(out, into), "junction {n} item {item}: {into} in, {out} out"),
                    NodeKind::Process => {
                        let rate = net_rate(node, item);
                        let made = rate.max(0.0) * solution.activity[n];
                        let used = (-rate).max(0.0) * solution.activity[n];
                        prop_assert!(close(out + slack(&solution.surplus, n, item), made), "node {n} item {item}: makes {made}, {out} leaves");
                        prop_assert!(close(into + slack(&solution.deficit, n, item), used), "node {n} item {item}: uses {used}, {into} arrives");
                    }
                }
            }
        }
    }

    #[test]
    fn values_stay_within_their_bounds(model in factory()) {
        let solution = solved(&model);
        for (node, activity) in model.nodes.iter().zip(&solution.activity) {
            prop_assert!(*activity >= 0.0);
            prop_assert!(node.max.is_none_or(|max| *activity <= max + TOLERANCE));
        }
        for (e, (edge, flow)) in model.edges.iter().zip(&solution.flow).enumerate() {
            prop_assert!(*flow >= 0.0);
            let overflow: f64 = solution.overflow.iter().filter(|o| o.edge as usize == e).map(|o| o.per_second).sum();
            prop_assert!(edge.capacity.is_none_or(|capacity| *flow <= capacity + overflow + TOLERANCE));
        }
        let slacks = solution.surplus.iter().chain(&solution.deficit);
        prop_assert!(slacks.into_iter().all(|slack| slack.per_second > 0.0));
    }

    #[test]
    fn pins_are_met_unless_a_maximum_forbids_it(model in factory()) {
        let solution = solved(&model);
        for (n, node) in model.nodes.iter().enumerate() {
            if let Some(pin) = node.pin {
                let reachable = node.max.map_or(pin, |max| pin.min(max));
                prop_assert!(close(solution.activity[n], reachable), "node {n}: pin {pin}, max {:?}, activity {}", node.max, solution.activity[n]);
                let reported = solution.pin_misses.iter().find(|miss| miss.node as usize == n).map_or(0.0, |miss| miss.difference);
                prop_assert!(close(reported, reachable - pin));
            }
        }
    }

    #[test]
    fn scaling_pins_limits_and_capacities_scales_every_objective(model in factory(), factor in prop::sample::select(vec![0.001, 0.5, 3.0, 1000.0])) {
        let original = objectives(&model, &solved(&model));
        let bigger = objectives(&model, &solved(&scaled(&model, factor)));
        for (name, a, b) in [
            ("pin misses", original.pin_misses, bigger.pin_misses),
            ("shortfall", original.shortfall, bigger.shortfall),
            ("cost", original.cost, bigger.cost),
            ("surplus", original.surplus, bigger.surplus),
        ] {
            prop_assert!((a * factor - b).abs() <= 1e-5 * (1.0 + b.abs()), "{name}: {a} × {factor} ≠ {b}");
        }
    }

    #[test]
    fn solving_is_deterministic(model in factory()) {
        prop_assert_eq!(solved(&model), solved(&model));
    }
}
