//! Blueprints placed as instances: summarised bottom-up, combined by the LP around them, expanded
//! top-down (docs/Architecture/Subgraphs.md).
mod common;

use carbonara_solver::ir::*;
use carbonara_solver::program::MicroLp;
use carbonara_solver::{Solver, solve, solve_inline};
use common::*;
use proptest::prelude::*;

const ORE: u32 = 0;
const INGOT: u32 = 1;
const SLAG: u32 = 2;
const COAL: u32 = 3;

fn solved(model: &Model) -> Solution {
    match solve(model) {
        Ok(solution) => solution,
        Err(error) => panic!("expected a solution, got {error:?}"),
    }
}

fn inlined(model: &Model) -> Solution {
    match solve_inline(model) {
        Ok(solution) => solution,
        Err(error) => panic!("expected a solution, got {error:?}"),
    }
}

/// ore port → smelter (0.5 ore/s → 0.5 ingot/s per machine) → ingot port
fn smelting() -> Blueprint {
    Blueprint {
        nodes: vec![
            port_in(ORE),
            process(&[(ORE, -0.5), (INGOT, 0.5)]),
            port_out(INGOT),
        ],
        edges: vec![edge(0, 1, ORE), edge(1, 2, INGOT)],
        constraints: vec![],
        ports: vec![0, 2],
    }
}

/// ore source → the blueprint (ore port 0, ingot port 1) → ingot sink pinned to `target`
fn placing(blueprint: Blueprint, target: f64) -> Model {
    Model {
        blueprints: vec![blueprint],
        ..model(
            4,
            vec![source(ORE), instance(0), pinned(sink(INGOT), target)],
            vec![into_port(0, 1, ORE, 0), out_of_port(1, 2, INGOT, 1)],
        )
    }
}

/// `smelting` with its smelter pinned: the blueprint as designed makes `machines / 2` ingots per second.
fn designed(machines: f64) -> Blueprint {
    let mut blueprint = smelting();
    blueprint.nodes[1].pin = Some(machines);
    blueprint
}

#[track_caller]
fn assert_same_flows(actual: &Solution, expected: &Solution) {
    assert_all_close(&actual.flow, &expected.flow);
}

/// What each objective tier scores: pin misses, deficits, cost (inside instances too) and surplus.
fn scores(model: &Model, solution: &Solution) -> [f64; 4] {
    fn inside_cost(model: &Model, blueprint: u32, instance: &InstanceSolution) -> f64 {
        let body = &model.blueprints[blueprint as usize];
        let own: f64 = body
            .nodes
            .iter()
            .zip(&instance.activity)
            .map(|(node, activity)| node.cost * activity)
            .sum();
        let nested: f64 = instance
            .instances
            .iter()
            .filter_map(|inner| {
                let placed = body.nodes[inner.node as usize].blueprint?;
                Some(inside_cost(model, placed, inner))
            })
            .sum();
        own + nested
    }
    let own: f64 = model
        .nodes
        .iter()
        .zip(&solution.activity)
        .map(|(node, activity)| node.cost * activity)
        .sum();
    let inside: f64 = solution
        .instances
        .iter()
        .filter_map(|instance| {
            let placed = model.nodes[instance.node as usize].blueprint?;
            Some(inside_cost(model, placed, instance))
        })
        .sum();
    [
        solution
            .pin_misses
            .iter()
            .map(|miss| miss.difference.abs())
            .sum(),
        total(&solution.deficit),
        own + inside,
        total(&solution.surplus),
    ]
}

mod one_way_of_running {
    use super::*;

    #[test]
    fn an_instance_works_like_its_blueprint() {
        let solution = solved(&placing(smelting(), 1.0));
        assert_all_close(&solution.flow, &[1.0, 1.0]);
        // Without pins the blueprint has no design scale.
        assert_all_close(&solution.activity, &[1.0, 0.0, 1.0]);
        assert_eq!(solution.instances.len(), 1);
        assert_eq!(solution.instances[0].node, 1);
        assert_all_close(&solution.instances[0].ports, &[1.0, 1.0]);
        assert_all_close(&solution.instances[0].activity, &[1.0, 2.0, 1.0]);
        assert!(solution.deficit.is_empty() && solution.surplus.is_empty());
        assert!(solution.inlined.is_empty());
    }

    #[test]
    fn a_blueprints_pins_are_its_design_and_an_instance_runs_it_several_times() {
        // Designed for 2 smelters (1 ingot/s); the sink wants 3 ingots/s.
        let solution = solved(&placing(designed(2.0), 3.0));
        assert_close(solution.activity[1], 3.0);
        assert_all_close(&solution.instances[0].activity, &[3.0, 6.0, 3.0]);
        assert!(solution.pin_misses.is_empty());
    }

    #[test]
    fn a_limit_inside_caps_the_instance() {
        // ore + coal → ingot, with the coal from a source inside that gives 1/s.
        let blueprint = Blueprint {
            nodes: vec![
                port_in(ORE),
                limited(source(COAL), 1.0),
                process(&[(ORE, -1.0), (COAL, -1.0), (INGOT, 1.0)]),
                port_out(INGOT),
            ],
            edges: vec![edge(0, 2, ORE), edge(1, 2, COAL), edge(2, 3, INGOT)],
            constraints: vec![],
            ports: vec![0, 3],
        };
        let solution = solved(&placing(blueprint, 3.0));
        // The instance makes all it can; the sink explains the rest.
        assert_all_close(&solution.flow, &[1.0, 1.0]);
        assert_eq!(solution.deficit.len(), 1);
        assert_eq!(
            (solution.deficit[0].node, solution.deficit[0].item),
            (2, INGOT)
        );
        assert_close(solution.deficit[0].per_second, 2.0);
    }

    #[test]
    fn a_byproduct_dumped_inside_is_the_instances_surplus() {
        let mut blueprint = smelting();
        blueprint.nodes[1].rates.push(Rate {
            item: SLAG,
            per_second: 0.25,
        });
        let solution = solved(&placing(blueprint, 1.0));
        assert_eq!(solution.surplus.len(), 1);
        assert_eq!(
            (solution.surplus[0].node, solution.surplus[0].item),
            (1, SLAG)
        );
        assert_close(solution.surplus[0].per_second, 0.5);
    }

    #[test]
    fn an_input_nothing_feeds_inside_is_the_instances_deficit() {
        let mut blueprint = smelting();
        blueprint.nodes[1].rates.push(Rate {
            item: COAL,
            per_second: -0.25,
        });
        let solution = solved(&placing(blueprint, 1.0));
        assert_all_close(&solution.flow, &[1.0, 1.0]);
        assert_eq!(solution.deficit.len(), 1);
        assert_eq!(
            (solution.deficit[0].node, solution.deficit[0].item),
            (1, COAL)
        );
        assert_close(solution.deficit[0].per_second, 0.5);
    }

    #[test]
    fn a_blueprint_inside_a_blueprint_is_summarised_first() {
        // Outer: ore port → inner smelting instance → ingot port, with its own smelter pinned too.
        let outer = Blueprint {
            nodes: vec![port_in(ORE), instance(1), port_out(INGOT)],
            edges: vec![into_port(0, 1, ORE, 0), out_of_port(1, 2, INGOT, 1)],
            constraints: vec![],
            ports: vec![0, 2],
        };
        let mut model = placing(outer, 2.0);
        model.blueprints.push(designed(1.0));
        let solution = solved(&model);
        assert_all_close(&solution.flow, &[2.0, 2.0]);
        let inner = &solution.instances[0].instances[0];
        assert_eq!(inner.node, 1);
        // The inner design makes 0.5 ingot/s, so it runs 4 times.
        assert_close(solution.instances[0].activity[1], 4.0);
        assert_all_close(&inner.activity, &[2.0, 4.0, 2.0]);
    }
}

mod caching {
    use super::*;

    /// Two instances of one blueprint, each feeding a sink of its own.
    fn twice(blueprint: Blueprint, targets: [f64; 2]) -> Model {
        Model {
            blueprints: vec![blueprint],
            ..model(
                4,
                vec![
                    source(ORE),
                    instance(0),
                    instance(0),
                    pinned(sink(INGOT), targets[0]),
                    pinned(sink(INGOT), targets[1]),
                ],
                vec![
                    into_port(0, 1, ORE, 0),
                    into_port(0, 2, ORE, 0),
                    out_of_port(1, 3, INGOT, 1),
                    out_of_port(2, 4, INGOT, 1),
                ],
            )
        }
    }

    fn solve_with(solver: &mut Solver, model: &Model) -> Solution {
        match solver.solve(model) {
            Ok(solution) => solution,
            Err(error) => panic!("expected a solution, got {error:?}"),
        }
    }

    #[test]
    fn instances_of_a_blueprint_share_one_summary() {
        let mut solver = Solver::new(MicroLp);
        let solution = solve_with(&mut solver, &twice(designed(2.0), [1.0, 2.0]));
        assert_eq!(solver.last_summarised(), 1);
        assert_all_close(&[solution.activity[1], solution.activity[2]], &[1.0, 2.0]);
    }

    #[test]
    fn an_edit_around_instances_reuses_their_summary() {
        let mut solver = Solver::new(MicroLp);
        solve_with(&mut solver, &twice(designed(2.0), [1.0, 2.0]));
        solve_with(&mut solver, &twice(designed(2.0), [1.0, 3.0]));
        assert_eq!(solver.last_summarised(), 0);
    }

    #[test]
    fn editing_one_blueprint_recomputes_only_its_summary() {
        let mut model = twice(designed(2.0), [1.0, 2.0]);
        // The second instance places a blueprint of its own.
        model.blueprints.push(designed(4.0));
        model.nodes[2].blueprint = Some(1);
        let mut solver = Solver::new(MicroLp);
        solve_with(&mut solver, &model);
        assert_eq!(solver.last_summarised(), 2);
        model.blueprints[1].nodes[1].pin = Some(6.0);
        let solution = solve_with(&mut solver, &model);
        assert_eq!(solver.last_summarised(), 1);
        assert_eq!(solver.cached_summaries(), 2);
        // 2 ingots/s from a design of 3 ingots/s.
        assert_close(solution.activity[2], 2.0 / 3.0);
    }
}

mod several_ways_of_running {
    use super::*;

    /// Ingots from ore (1 → 1) or from coal (2 → 1), merged into one ingot port.
    fn two_recipes() -> Blueprint {
        Blueprint {
            nodes: vec![
                port_in(ORE),
                port_in(COAL),
                process(&[(ORE, -1.0), (INGOT, 1.0)]),
                process(&[(COAL, -2.0), (INGOT, 1.0)]),
                junction(),
                port_out(INGOT),
            ],
            edges: vec![
                edge(0, 2, ORE),
                edge(1, 3, COAL),
                edge(2, 4, INGOT),
                edge(3, 4, INGOT),
                edge(4, 5, INGOT),
            ],
            constraints: vec![],
            ports: vec![0, 1, 5],
        }
    }

    #[test]
    fn the_lp_around_combines_the_modes_of_a_blueprint() {
        // Ore is cheaper per ingot but only 1/s exists; coal makes up the rest of the 3 ingots/s.
        let model = Model {
            blueprints: vec![two_recipes()],
            ..model(
                4,
                vec![
                    limited(source(ORE), 1.0),
                    source(COAL),
                    instance(0),
                    pinned(sink(INGOT), 3.0),
                ],
                vec![
                    into_port(0, 2, ORE, 0),
                    into_port(1, 2, COAL, 1),
                    out_of_port(2, 3, INGOT, 2),
                ],
            )
        };
        let solution = solved(&model);
        assert!(solution.inlined.is_empty());
        assert_all_close(&solution.flow, &[1.0, 4.0, 3.0]);
        assert_all_close(&solution.instances[0].activity[2..4], &[1.0, 2.0]);
        assert_same_flows(&solution, &inlined(&model));
    }

    #[test]
    fn a_bus_passes_through_a_blueprint_that_also_draws_from_it() {
        // water port → junction → water port, and the junction feeds a washer making clean ore.
        let (water, clean) = (SLAG, INGOT);
        let blueprint = Blueprint {
            nodes: vec![
                port_in(water),
                junction(),
                process(&[(water, -1.0), (ORE, -1.0), (clean, 1.0)]),
                port_out(water),
                port_in(ORE),
                port_out(clean),
            ],
            edges: vec![
                edge(0, 1, water),
                edge(1, 2, water),
                edge(1, 3, water),
                edge(4, 2, ORE),
                edge(2, 5, clean),
            ],
            constraints: vec![],
            ports: vec![0, 3, 4, 5],
        };
        let model = Model {
            blueprints: vec![blueprint],
            ..model(
                4,
                vec![
                    source(water),
                    source(ORE),
                    instance(0),
                    pinned(sink(water), 2.0),
                    pinned(sink(clean), 1.0),
                ],
                vec![
                    into_port(0, 2, water, 0),
                    into_port(1, 2, ORE, 2),
                    out_of_port(2, 3, water, 1),
                    out_of_port(2, 4, clean, 3),
                ],
            )
        };
        let solution = solved(&model);
        assert!(solution.inlined.is_empty());
        assert_all_close(&solution.flow, &[3.0, 1.0, 2.0, 1.0]);
        assert_all_close(&solution.instances[0].ports, &[3.0, 2.0, 1.0, 1.0]);
        assert!(solution.deficit.is_empty() && solution.surplus.is_empty());
        assert_same_flows(&solution, &inlined(&model));
    }

    #[test]
    fn of_two_equally_cheap_modes_the_one_that_wastes_less_wins() {
        // Found by proptest. Items pass through, or a machine inside makes them with a byproduct it
        // dumps, at the same cost as the source outside; passing through wastes nothing.
        let (byproduct, product) = (1, 3);
        let blueprint = Blueprint {
            nodes: vec![
                Node {
                    cost: 1.0,
                    ..process(&[(product, 1.0), (byproduct, 2.0)])
                },
                junction(),
                port_in(product),
                port_out(product),
            ],
            edges: vec![
                edge(0, 1, product),
                edge(2, 1, product),
                edge(1, 3, product),
            ],
            constraints: vec![],
            ports: vec![2, 3],
        };
        let model = placed(&blueprint, &[Some(0.5)]);
        let solution = solved(&model);
        assert!(solution.surplus.is_empty(), "{:?}", solution.surplus);
        assert_same_flows(&solution, &inlined(&model));
    }

    #[test]
    fn passing_items_through_costs_less_than_combining_the_modes_around_it() {
        // Found by proptest (CARB-133). Coal enters and is burnt inside (cost 1), or a machine inside
        // makes it (cost 2), or it passes straight through for free. Through is no extreme way of
        // running (burning plus making do the same) but the cheapest: the outside's coal costs 1.
        let blueprint = Blueprint {
            nodes: vec![
                port_in(COAL),
                junction(),
                port_out(COAL),
                Node {
                    cost: 2.0,
                    ..process(&[(COAL, 1.0)])
                },
                Node {
                    cost: 1.0,
                    ..process(&[(COAL, -1.0)])
                },
            ],
            edges: vec![
                edge(0, 1, COAL),
                edge(3, 1, COAL),
                edge(1, 2, COAL),
                edge(1, 4, COAL),
            ],
            constraints: vec![],
            ports: vec![0, 2],
        };
        let model = placed(&blueprint, &[Some(1.0)]);
        let solution = solved(&model);
        assert!(solution.inlined.is_empty());
        assert_all_close(&solution.instances[0].ports, &[1.0, 1.0]);
        assert_close(scores(&model, &solution)[2], 1.0);
        assert_same_flows(&solution, &inlined(&model));
    }

    #[test]
    fn a_blueprint_with_too_many_independent_ways_is_inlined_and_says_so() {
        // Five unrelated machines, each from its own input port to its own output port.
        let lines = 5;
        let mut blueprint = Blueprint {
            nodes: vec![],
            edges: vec![],
            constraints: vec![],
            ports: vec![],
        };
        let mut model = model(2 * lines, vec![instance(0)], vec![]);
        for line in 0..lines {
            let (input, output) = (2 * line, 2 * line + 1);
            let at = blueprint.nodes.len() as u32;
            blueprint.nodes.extend([
                port_in(input),
                process(&[(input, -1.0), (output, 1.0)]),
                port_out(output),
            ]);
            blueprint
                .edges
                .extend([edge(at, at + 1, input), edge(at + 1, at + 2, output)]);
            blueprint.ports.extend([at, at + 2]);
            let root = model.nodes.len() as u32;
            model
                .nodes
                .extend([source(input), pinned(sink(output), f64::from(line + 1))]);
            model.edges.extend([
                into_port(root, 0, input, 2 * line),
                out_of_port(0, root + 1, output, 2 * line + 1),
            ]);
        }
        model.blueprints.push(blueprint);
        let solution = solved(&model);
        assert_eq!(
            solution.inlined,
            vec![Inlined {
                blueprint: 0,
                freedom: 5
            }]
        );
        assert_all_close(
            &solution.instances[0].ports,
            &[1.0, 1.0, 2.0, 2.0, 3.0, 3.0, 4.0, 4.0, 5.0, 5.0],
        );
        assert_same_flows(&solution, &inlined(&model));
    }
}

mod expanding {
    use super::*;

    fn expanded(model: &Model, blueprint: u32) -> Solution {
        match Solver::new(MicroLp).expand(model, blueprint) {
            Ok(solution) => solution,
            Err(error) => panic!("expected a solution, got {error:?}"),
        }
    }

    #[test]
    fn an_instances_inside_is_solved_for_its_boundary_flows() {
        let solution = expanded(&placing(designed(2.0), 3.0), 0);
        assert_all_close(&solution.activity, &[3.0, 6.0, 3.0]);
        assert!(solution.pin_misses.is_empty() && solution.deficit.is_empty());
    }

    #[test]
    fn expanding_reuses_the_solution_around_and_leaves_its_counts_alone() {
        let model = placing(designed(2.0), 3.0);
        let mut solver = Solver::new(MicroLp);
        assert!(solver.solve(&model).is_ok());
        assert_eq!((solver.last_solved(), solver.last_summarised()), (1, 1));
        assert!(solver.expand(&model, 0).is_ok());
        assert_eq!((solver.last_solved(), solver.last_summarised()), (1, 1));
        assert_eq!((solver.cached(), solver.cached_summaries()), (1, 1));
    }

    #[test]
    fn a_blueprint_without_instances_is_solved_as_designed() {
        let mut model = placing(designed(2.0), 3.0);
        model.blueprints.push(designed(4.0));
        let solution = expanded(&model, 1);
        assert_all_close(&solution.activity, &[2.0, 4.0, 2.0]);
    }

    #[test]
    fn the_inside_of_several_instances_is_their_sum() {
        let mut model = placing(designed(2.0), 3.0);
        model.nodes.extend([instance(0), pinned(sink(INGOT), 1.0)]);
        model
            .edges
            .extend([into_port(0, 3, ORE, 0), out_of_port(3, 4, INGOT, 1)]);
        let solution = expanded(&model, 0);
        assert_all_close(&solution.activity, &[4.0, 8.0, 4.0]);
    }

    #[test]
    fn a_belt_inside_is_checked_when_the_blueprint_is_expanded() {
        // The parent plans around the blueprint without its belt limits; the inside reports them.
        let mut blueprint = designed(2.0);
        blueprint.edges[1].capacity = Some(2.0);
        let model = placing(blueprint, 3.0);
        assert!(solved(&model).overflow.is_empty());
        let inside = expanded(&model, 0);
        assert_eq!(inside.overflow.len(), 1);
        assert_eq!(inside.overflow[0].edge, 1);
        assert_close(inside.overflow[0].per_second, 1.0);
    }

    #[test]
    fn nested_blueprints_expand_through_their_parents() {
        let outer = Blueprint {
            nodes: vec![port_in(ORE), instance(1), port_out(INGOT)],
            edges: vec![into_port(0, 1, ORE, 0), out_of_port(1, 2, INGOT, 1)],
            constraints: vec![],
            ports: vec![0, 2],
        };
        let mut model = placing(outer, 2.0);
        model.blueprints.push(designed(1.0));
        assert_all_close(&expanded(&model, 0).activity, &[2.0, 4.0, 2.0]);
        assert_all_close(&expanded(&model, 1).activity, &[2.0, 4.0, 2.0]);
    }
}

proptest! {
    #![proptest_config(ProptestConfig {
        max_global_rejects: 1_000_000,
        ..ProptestConfig::with_cases(128)
    })]

    #[test]
    fn summarised_and_inlined_blueprints_plan_equally_well(blueprint in blueprint(), targets in targets()) {
        let model = placed(&blueprint, &targets);
        let summarised = solved(&model);
        let reference = inlined(&model);
        // A shortage can be explained in several places at the same cost (inside or around the
        // instance, as in a flat graph); the plans agree when there is none. Plans that tie may still
        // route differently, so they are compared by what each tier of the objective scores.
        prop_assume!(reference.deficit.is_empty());
        let (a, b) = (scores(&model, &summarised), scores(&model, &reference));
        for (tier, (a, b)) in ["pin misses", "deficit", "cost", "surplus"].iter().zip(a.iter().zip(&b)) {
            prop_assert!((a - b).abs() <= 1e-5 * (1.0 + b.abs()), "{tier}: {a} summarised, {b} inlined\n{summarised:?}\n{reference:?}");
        }
    }

    #[test]
    fn a_blueprint_placed_inside_another_plans_as_well_as_inlined(blueprint in blueprint(), targets in targets()) {
        // An outer blueprint whose ports lead straight to and from an instance of the random one.
        let mut outer = Blueprint { nodes: vec![instance(1)], edges: vec![], constraints: vec![], ports: vec![] };
        for (port, &node) in blueprint.ports.iter().enumerate() {
            let rate = blueprint.nodes[node as usize].rates[0];
            let at = outer.nodes.len() as u32;
            outer.ports.push(at);
            if rate.per_second > 0.0 {
                outer.nodes.push(port_in(rate.item));
                outer.edges.push(into_port(at, 0, rate.item, port as u32));
            } else {
                outer.nodes.push(port_out(rate.item));
                outer.edges.push(out_of_port(0, at, rate.item, port as u32));
            }
        }
        let mut model = placed(&outer, &targets);
        model.blueprints.push(blueprint);
        let summarised = solved(&model);
        let reference = inlined(&model);
        prop_assume!(reference.deficit.is_empty());
        let (a, b) = (scores(&model, &summarised), scores(&model, &reference));
        for (tier, (a, b)) in ["pin misses", "deficit", "cost", "surplus"].iter().zip(a.iter().zip(&b)) {
            prop_assert!((a - b).abs() <= 1e-5 * (1.0 + b.abs()), "{tier}: {a} summarised, {b} inlined");
        }
    }

    #[test]
    fn scaling_a_blueprints_design_and_its_targets_scales_its_plan_not_its_scale(
        blueprint in blueprint(),
        targets in targets(),
        factor in prop::sample::select(vec![0.5, 3.0, 100.0]),
    ) {
        let mut scaled = blueprint.clone();
        for node in &mut scaled.nodes {
            node.pin = node.pin.map(|pin| pin * factor);
            node.max = node.max.map(|max| max * factor);
        }
        let scaled_targets: Vec<Option<f64>> = targets.iter().map(|t| t.map(|t| t * factor)).collect();
        let (model, bigger_model) = (placed(&blueprint, &targets), placed(&scaled, &scaled_targets));
        let original = solved(&model);
        let bigger = solved(&bigger_model);
        // Shortages can tie, and ties go either way; so can routes, so plans are compared by score.
        prop_assume!(original.deficit.is_empty() && bigger.deficit.is_empty());
        prop_assert!(close(bigger.activity[0], original.activity[0]), "scale {} became {}", original.activity[0], bigger.activity[0]);
        let (a, b) = (scores(&model, &original), scores(&bigger_model, &bigger));
        for (tier, (a, b)) in ["pin misses", "deficit", "cost", "surplus"].iter().zip(a.iter().zip(&b)) {
            prop_assert!((a * factor - b).abs() <= 1e-5 * (1.0 + b.abs()), "{tier}: {a} × {factor} ≠ {b}");
        }
    }

    #[test]
    fn an_expanded_instance_agrees_with_the_graph_around_it(blueprint in blueprint(), targets in targets()) {
        let model = placed(&blueprint, &targets);
        let mut solver = Solver::new(MicroLp);
        let around = solver.solve(&model).map_err(|e| TestCaseError::fail(format!("{e:?}")))?;
        let inside = solver.expand(&model, 0).map_err(|e| TestCaseError::fail(format!("{e:?}")))?;
        for (p, &port) in blueprint.ports.iter().enumerate() {
            let (a, b) = (inside.activity[port as usize], around.instances[0].ports[p]);
            prop_assert!((a - b).abs() <= 1e-5 * (1.0 + b.abs()), "port {p}: {a} inside, {b} around");
        }
    }
}
