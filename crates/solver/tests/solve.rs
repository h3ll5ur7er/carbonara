//! What the solver does with small factories, one behaviour per test.
mod common;

use carbonara_solver::ir::*;
use carbonara_solver::{SolveError, solve};
use common::*;

const ORE: u32 = 0;
const INGOT: u32 = 1;

/// ore source → smelter (0.5 ore/s → 0.5 ingot/s per machine) → ingot sink
fn smelting(sink_pin: f64, ore_supply: f64) -> Model {
    model(
        2,
        vec![
            limited(source(ORE), ore_supply),
            process(&[(ORE, -0.5), (INGOT, 0.5)]),
            pinned(sink(INGOT), sink_pin),
        ],
        vec![edge(0, 1, ORE), edge(1, 2, INGOT)],
    )
}

fn solved(model: &Model) -> Solution {
    match solve(model) {
        Ok(solution) => solution,
        Err(error) => panic!("expected a solution, got {error:?}"),
    }
}

#[test]
fn an_empty_model_has_an_empty_solution() {
    let solution = solved(&model(0, vec![], vec![]));
    assert!(solution.activity.is_empty() && solution.flow.is_empty());
}

#[test]
fn a_pinned_sink_pulls_machines_and_raw_input_through_the_chain() {
    let solution = solved(&smelting(1.0, 10.0));
    assert_all_close(&solution.activity, &[1.0, 2.0, 1.0]);
    assert_all_close(&solution.flow, &[1.0, 1.0]);
    assert!(solution.deficit.is_empty() && solution.surplus.is_empty());
    assert!(solution.pin_misses.is_empty() && solution.overflow.is_empty());
}

#[test]
fn nothing_runs_without_a_pin() {
    let mut chain = smelting(0.0, 10.0);
    chain.nodes[2].pin = None;
    let solution = solved(&chain);
    assert_all_close(&solution.activity, &[0.0, 0.0, 0.0]);
}

#[test]
fn pins_are_met_before_deficits_and_the_shortage_is_reported() {
    // The sink wants 4 ingots/s but only 2 ore/s exist.
    let solution = solved(&smelting(4.0, 2.0));
    assert_close(solution.activity[2], 4.0);
    assert_close(solution.activity[0], 2.0);
    assert!(solution.pin_misses.is_empty());
    assert_close(total(&solution.deficit), 2.0);
}

#[test]
fn a_pin_above_the_node_maximum_is_missed_and_reported() {
    let mut chain = smelting(1.0, 10.0);
    chain.nodes[1].pin = Some(5.0);
    chain.nodes[1].max = Some(3.0);
    let solution = solved(&chain);
    assert_close(solution.activity[1], 3.0);
    assert_eq!(solution.pin_misses.len(), 1);
    assert_eq!(solution.pin_misses[0].node, 1);
    assert_close(solution.pin_misses[0].difference, -2.0);
}

#[test]
fn a_machine_pin_pushes_its_output_to_unpinned_consumers() {
    let mut chain = smelting(0.0, 10.0);
    chain.nodes[2].pin = None;
    chain.nodes[1].pin = Some(4.0);
    let solution = solved(&chain);
    assert_all_close(&solution.activity, &[2.0, 4.0, 2.0]);
    assert!(solution.surplus.is_empty());
}

#[test]
fn flow_beyond_an_edge_capacity_is_allowed_and_reported_as_overflow() {
    let mut chain = smelting(2.0, 10.0);
    chain.edges[1].capacity = Some(1.5);
    let solution = solved(&chain);
    assert_close(solution.flow[1], 2.0);
    assert_eq!(solution.overflow.len(), 1);
    assert_eq!(solution.overflow[0].edge, 1);
    assert_close(solution.overflow[0].per_second, 0.5);
}

#[test]
fn overflow_is_avoided_when_another_route_exists() {
    // smelter → sink twice; the first edge is capped at 0.5/s.
    let mut chain = smelting(2.0, 10.0);
    chain.edges[1].capacity = Some(0.5);
    chain.edges.push(edge(1, 2, INGOT));
    let solution = solved(&chain);
    assert_all_close(&solution.flow[1..], &[0.5, 1.5]);
    assert!(solution.overflow.is_empty());
}

#[test]
fn byproducts_nobody_takes_are_reported_as_surplus() {
    // copper plate: 2 ore → 1 plate + 1 slag; only the plate is wanted.
    let (ore, plate, slag) = (0, 1, 2);
    let factory = model(
        3,
        vec![
            source(ore),
            process(&[(ore, -2.0 / 3.0), (plate, 1.0 / 3.0), (slag, 1.0 / 3.0)]),
            pinned(sink(plate), 1.0),
        ],
        vec![edge(0, 1, ore), edge(1, 2, plate)],
    );
    let solution = solved(&factory);
    assert_close(solution.activity[1], 3.0);
    assert_eq!(solution.surplus.len(), 1);
    assert_eq!(
        (solution.surplus[0].node, solution.surplus[0].item),
        (1, slag)
    );
    assert_close(solution.surplus[0].per_second, 1.0);
}

#[test]
fn the_template_water_loop_recycles_water_before_drawing_fresh_water() {
    // Template Works: washing ferrite makes dirty water, the purifier turns it back into water.
    let (ore, water, clean, dirty, sludge) = (0, 1, 2, 3, 4);
    let factory = model(
        5,
        vec![
            source(ore),
            source(water),
            junction(),
            process(&[(ore, -1.0), (water, -0.5), (clean, 1.0), (dirty, 0.5)]),
            process(&[(dirty, -1.0), (water, 0.75), (sludge, 0.25)]),
            pinned(sink(clean), 1.0),
        ],
        vec![
            edge(0, 3, ore),
            edge(1, 2, water),
            edge(4, 2, water),
            edge(2, 3, water),
            edge(3, 4, dirty),
            edge(3, 5, clean),
        ],
    );
    let solution = solved(&factory);
    assert_all_close(&solution.activity, &[1.0, 0.125, 0.5, 1.0, 0.5, 1.0]);
    assert_all_close(&solution.flow, &[1.0, 0.125, 0.375, 0.5, 0.5, 1.0]);
    assert!(solution.deficit.is_empty());
    assert_eq!(solution.surplus.len(), 1);
    assert_eq!(
        (solution.surplus[0].node, solution.surplus[0].item),
        (4, sludge)
    );
    assert_close(solution.surplus[0].per_second, 0.125);
}

#[test]
fn the_cheapest_recipe_wins_when_two_can_make_the_item() {
    // Two smelters feed the sink; the second one is cheaper to run.
    let mut factory = smelting(1.0, 10.0);
    factory.nodes[1].cost = 2.0;
    factory.nodes.push(Node {
        cost: 1.0,
        ..process(&[(ORE, -0.5), (INGOT, 0.5)])
    });
    factory.edges.extend([edge(0, 3, ORE), edge(3, 2, INGOT)]);
    let solution = solved(&factory);
    assert_all_close(&solution.activity, &[1.0, 0.0, 1.0, 2.0]);
}

#[test]
fn a_ratio_fixes_an_edge_share_of_the_output() {
    // source → junction → two sinks, a quarter to the first.
    let mut factory = model(
        1,
        vec![pinned(source(0), 4.0), junction(), sink(0), sink(0)],
        vec![edge(0, 1, 0), edge(1, 2, 0), edge(1, 3, 0)],
    );
    factory.edges[1].ratio = Some(0.25);
    let solution = solved(&factory);
    assert_all_close(&solution.flow, &[4.0, 1.0, 3.0]);
    assert_close(solution.activity[1], 4.0);
}

#[test]
fn an_edge_carrying_an_item_its_ends_do_not_trade_stays_empty() {
    let mut chain = smelting(1.0, 10.0);
    chain.edges.push(edge(0, 2, ORE));
    let solution = solved(&chain);
    assert_close(solution.flow[2], 0.0);
}

#[test]
fn plugin_constraints_limit_activities() {
    // At most 1 machine, although the sink wants 1 ingot/s (2 machines).
    let mut chain = smelting(1.0, 10.0);
    chain.constraints.push(Constraint {
        terms: vec![Term {
            node: 1,
            coefficient: 1.0,
        }],
        op: Comparison::AtMost,
        rhs: 1.0,
    });
    let solution = solved(&chain);
    assert_close(solution.activity[1], 1.0);
    assert_close(total(&solution.deficit), 0.5);
}

#[test]
fn contradicting_constraints_are_infeasible() {
    let mut chain = smelting(1.0, 10.0);
    chain.nodes[1].max = Some(1.0);
    chain.constraints.push(Constraint {
        terms: vec![Term {
            node: 1,
            coefficient: 1.0,
        }],
        op: Comparison::AtLeast,
        rhs: 5.0,
    });
    assert_eq!(
        solve(&chain),
        Err(SolveError::Unsolvable(Unsolvable::Infeasible))
    );
}

#[test]
fn a_negative_cost_without_a_limit_is_unbounded() {
    let mut chain = smelting(1.0, 10.0);
    chain.nodes[0].max = None;
    chain.nodes[0].cost = -1.0;
    assert_eq!(
        solve(&chain),
        Err(SolveError::Unsolvable(Unsolvable::Unbounded))
    );
}

#[test]
fn an_inconsistent_model_is_rejected_before_solving() {
    let mut chain = smelting(1.0, 10.0);
    chain.edges[0].to = 9;
    assert!(matches!(solve(&chain), Err(SolveError::Invalid(_))));
}

#[test]
fn a_missed_pin_next_to_a_met_one_does_not_make_the_model_infeasible() {
    // Found by proptest: holding the first tier at its optimum used to make the next solve infeasible.
    let factory = model(
        4,
        vec![
            pinned(process(&[(1, -0.25), (2, 1.5)]), 3.5),
            Node {
                cost: 2.0,
                ..pinned(process(&[(3, 3.0), (1, 3.0)]), 0.0)
            },
            pinned(limited(process(&[(0, -0.5), (3, 0.25)]), 6.0), 7.0),
        ],
        vec![edge(1, 0, 1)],
    );
    let solution = solved(&factory);
    assert_all_close(&solution.activity, &[3.5, 0.0, 6.0]);
}

#[test]
fn a_node_limited_to_zero_stays_at_zero() {
    // Found by proptest: bounding the slacks of a zero tier used to loosen a node's own maximum.
    let mut chain = smelting(1.0, 10.0);
    chain.nodes[1].max = Some(0.0);
    chain.nodes[1].cost = 2.0;
    chain.nodes[2].pin = Some(0.0);
    let solution = solved(&chain);
    assert_eq!(solution.activity[1], 0.0);
}
