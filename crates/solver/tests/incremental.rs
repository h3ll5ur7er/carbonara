//! Solving component by component, and re-solving only the components that changed.
mod common;

use carbonara_solver::ir::*;
use carbonara_solver::program::MicroLp;
use carbonara_solver::{SolveError, Solver, components, solve, solve_whole};
use common::*;
use proptest::prelude::*;

/// Places factories side by side in one model, without connecting them.
fn side_by_side(parts: &[Model]) -> Model {
    let mut whole = model(ITEMS, vec![], vec![]);
    for part in parts {
        let offset = whole.nodes.len() as u32;
        whole.nodes.extend(part.nodes.iter().cloned());
        whole.edges.extend(part.edges.iter().map(|edge| Edge {
            from: edge.from + offset,
            to: edge.to + offset,
            ..edge.clone()
        }));
        whole
            .constraints
            .extend(part.constraints.iter().map(|constraint| {
                Constraint {
                    terms: constraint
                        .terms
                        .iter()
                        .map(|term| Term {
                            node: term.node + offset,
                            ..*term
                        })
                        .collect(),
                    ..constraint.clone()
                }
            }));
    }
    whole
}

/// source → machine → sink, with the sink pinned.
fn chain(pin: f64) -> Model {
    model(
        ITEMS,
        vec![
            source(0),
            process(&[(0, -1.0), (1, 0.5)]),
            pinned(sink(1), pin),
        ],
        vec![edge(0, 1, 0), edge(1, 2, 1)],
    )
}

fn solved(solver: &mut Solver, model: &Model) -> Solution {
    match solver.solve(model) {
        Ok(solution) => solution,
        Err(error) => panic!("expected a solution, got {error:?}"),
    }
}

#[test]
fn nodes_connected_by_edges_form_one_component() {
    let found = components(&side_by_side(&[chain(1.0), chain(2.0)]));
    let nodes: Vec<Vec<u32>> = found.iter().map(|c| c.nodes.clone()).collect();
    assert_eq!(nodes, vec![vec![0, 1, 2], vec![3, 4, 5]]);
    assert_eq!(found[1].edges, vec![2, 3]);
    // Each component is a model of its own, with local indices.
    assert_eq!(
        found[1].model,
        Model {
            items: 2,
            ..chain(2.0)
        }
    );
}

#[test]
fn a_plugin_constraint_joins_the_nodes_it_mentions() {
    let mut factory = side_by_side(&[chain(1.0), chain(2.0)]);
    factory.constraints.push(Constraint {
        terms: vec![
            Term {
                node: 1,
                coefficient: 1.0,
            },
            Term {
                node: 4,
                coefficient: 1.0,
            },
        ],
        op: Comparison::AtMost,
        rhs: 10.0,
    });
    let found = components(&factory);
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].constraints, vec![0]);
}

#[test]
fn items_are_renumbered_densely_within_a_component() {
    let factory = model(9, vec![source(7), sink(7), source(3)], vec![edge(0, 1, 7)]);
    let found = components(&factory);
    assert_eq!(found[0].model.items, 1);
    assert_eq!(found[0].items, vec![7]);
    assert_eq!(found[0].model.edges[0].item, 0);
    assert_eq!(found[1].items, vec![3]);
}

#[test]
fn editing_one_component_re_solves_only_that_component() {
    let mut solver = Solver::new(MicroLp);
    solved(
        &mut solver,
        &side_by_side(&[chain(1.0), chain(2.0), chain(3.0)]),
    );
    assert_eq!((solver.last_solved(), solver.last_reused()), (3, 0));

    let edited = side_by_side(&[chain(1.0), chain(5.0), chain(3.0)]);
    let incremental = solved(&mut solver, &edited);
    assert_eq!((solver.last_solved(), solver.last_reused()), (1, 2));
    assert_eq!(Ok(incremental), solve(&edited));
}

#[test]
fn identical_components_are_solved_once() {
    let mut solver = Solver::new(MicroLp);
    solved(&mut solver, &side_by_side(&[chain(1.0), chain(1.0)]));
    assert_eq!((solver.last_solved(), solver.last_reused()), (1, 1));
}

#[test]
fn the_cache_keeps_only_what_the_last_solve_used() {
    let mut solver = Solver::new(MicroLp);
    solved(&mut solver, &side_by_side(&[chain(1.0), chain(2.0)]));
    solved(&mut solver, &chain(3.0));
    assert_eq!(solver.cached(), 1);
    solved(&mut solver, &chain(1.0));
    assert_eq!((solver.last_solved(), solver.last_reused()), (1, 0));
}

#[test]
fn an_unsolvable_component_fails_the_whole_solve() {
    let mut broken = chain(1.0);
    broken.nodes[1].max = Some(1.0);
    broken.constraints.push(Constraint {
        terms: vec![Term {
            node: 1,
            coefficient: 1.0,
        }],
        op: Comparison::AtLeast,
        rhs: 2.0,
    });
    let factory = side_by_side(&[chain(1.0), broken]);
    assert_eq!(
        solve(&factory),
        Err(carbonara_solver::SolveError::Unsolvable(
            Unsolvable::Infeasible
        ))
    );
}

fn objectives(model: &Model, solution: &Solution) -> [f64; 5] {
    let cost = model
        .nodes
        .iter()
        .zip(&solution.activity)
        .map(|(node, activity)| node.cost * activity)
        .sum();
    [
        solution.pin_misses.iter().map(|m| m.difference.abs()).sum(),
        total(&solution.deficit),
        solution.overflow.iter().map(|o| o.per_second).sum(),
        cost,
        total(&solution.surplus),
    ]
}

proptest! {
    #[test]
    fn every_node_and_edge_belongs_to_exactly_one_component(factory in factory()) {
        let found = components(&factory);
        let mut nodes: Vec<u32> = found.iter().flat_map(|c| c.nodes.clone()).collect();
        let mut edges: Vec<u32> = found.iter().flat_map(|c| c.edges.clone()).collect();
        nodes.sort_unstable();
        edges.sort_unstable();
        prop_assert_eq!(nodes, (0..factory.nodes.len() as u32).collect::<Vec<_>>());
        prop_assert_eq!(edges, (0..factory.edges.len() as u32).collect::<Vec<_>>());
    }

    #[test]
    fn solving_by_component_reaches_the_same_optimum_as_one_big_lp(factory in factory()) {
        let by_component = solve(&factory).map_err(|e| TestCaseError::fail(e.to_string()))?;
        let whole = solve_whole(&factory, &MicroLp).map_err(|e| TestCaseError::fail(e.to_string()))?;
        let (a, b) = (objectives(&factory, &by_component), objectives(&factory, &whole));
        for tier in 0..5 {
            prop_assert!((a[tier] - b[tier]).abs() <= 1e-6 * (1.0 + b[tier].abs()), "tier {tier}: {a:?} vs {b:?}");
        }
    }

    #[test]
    fn incremental_solves_equal_full_solves(
        parts in prop::collection::vec(factory(), 1..5),
        replacement in factory(),
        at in any::<prop::sample::Index>(),
    ) {
        let mut solver = Solver::new(MicroLp);
        let before = side_by_side(&parts);
        prop_assert_eq!(solver.solve(&before), solve(&before));

        let mut edited_parts = parts.clone();
        edited_parts[at.index(parts.len())] = replacement.clone();
        let after = side_by_side(&edited_parts);
        prop_assert_eq!(solver.solve(&after), solve(&after));
        prop_assert!(solver.last_solved() <= components(&replacement).len());
    }

    #[test]
    fn solving_changes_gives_what_solving_each_model_whole_gives(
        parts in prop::collection::vec(factory(), 1..4),
        edits in prop::collection::vec((any::<prop::sample::Index>(), prop::option::of(factory())), 1..5),
        blueprint in blueprint(),
        targets in targets(),
    ) {
        // Lines replaced, added and removed one after another, and a model with a blueprint between them.
        let mut models = vec![side_by_side(&parts)];
        let mut current = parts;
        for (at, replacement) in edits {
            let at = at.index(current.len());
            match replacement {
                Some(part) if at % 2 == 0 => current[at] = part,
                Some(part) => current.push(part),
                None if current.len() > 1 => { current.remove(at); }
                None => {}
            }
            models.push(side_by_side(&current));
        }
        models.insert(models.len() / 2, placed(&blueprint, &targets));

        let mut solver = Solver::new(MicroLp);
        let (mut before, mut solution) = (Model::default(), Solution::default());
        for model in models {
            let changes = ModelChanges::between(&before, &model);
            match (solver.solve_changes(changes), solve(&model)) {
                (Ok(changes), Ok(expected)) => {
                    prop_assert!(changes.apply(&mut solution).is_ok());
                    prop_assert_eq!(&solution, &expected);
                }
                (Err(error), Err(expected)) => prop_assert_eq!(error, expected),
                (got, expected) => prop_assert!(false, "{got:?} vs {expected:?}"),
            }
            before = model;
        }
    }
}

#[test]
fn changes_that_dont_fit_leave_the_model_as_it_was() {
    let mut solver = Solver::new(MicroLp);
    let first = chain(1.0);
    let Ok(sent) = solver.solve_changes(ModelChanges::between(&Model::default(), &first)) else {
        panic!("expected a solution");
    };
    let mut solution = Solution::default();
    assert!(sent.apply(&mut solution).is_ok());
    // A node past the end, with a gap before it.
    let mut broken = ModelChanges::between(&first, &first);
    broken.nodes = Changes {
        length: 5,
        set: vec![(4, sink(1))],
    };
    assert!(matches!(
        solver.solve_changes(broken),
        Err(SolveError::Invalid(_))
    ));
    // Nothing changed, so nothing comes back.
    let Ok(again) = solver.solve_changes(ModelChanges::between(&first, &first)) else {
        panic!("expected a solution");
    };
    assert!(again.activity.set.is_empty() && again.flow.set.is_empty() && again.surplus.is_none());
    assert!(again.apply(&mut solution).is_ok());
    assert_eq!(Ok(solution), solve(&first));
}
