//! Checks that a model is internally consistent before it is solved.
//! An invalid model is a bug in the compiler engine, not a user error, so the message is for developers.
//! Where a check is reported (`at`) is only spelled out when it fails: validating is on every solve's path.

use crate::graph::Graph;
use crate::ir::{Model, NodeKind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidModel(pub String);

impl std::fmt::Display for InvalidModel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "invalid solver model: {}", self.0)
    }
}

impl std::error::Error for InvalidModel {}

pub fn validate(model: &Model) -> Result<(), InvalidModel> {
    // Ports first: edges to instances, in any graph, rely on them.
    for (b, blueprint) in model.blueprints.iter().enumerate() {
        for (p, &port) in blueprint.ports.iter().enumerate() {
            let at = || format!("blueprints[{b}].ports[{p}]");
            let node = blueprint
                .nodes
                .get(port as usize)
                .ok_or_else(|| InvalidModel(format!("{}: no node {port}", at())))?;
            let is_port = node.kind == NodeKind::Process
                && node.rates.len() == 1
                && node.rates[0].per_second.abs() == 1.0
                && node.max.is_none()
                && node.pin.is_none()
                && node.cost == 0.0;
            check(is_port, at, || {
                format!("nodes[{port}] is no port (one rate of ±1, nothing else)")
            })?;
            check(!blueprint.ports[..p].contains(&port), at, || {
                format!("nodes[{port}] is a port twice")
            })?;
        }
    }
    check_graph(model, model.graph(), "")?;
    for (b, blueprint) in model.blueprints.iter().enumerate() {
        check_graph(model, blueprint.graph(), &format!("blueprints[{b}]."))?;
    }
    check_nesting(model)
}

fn check_graph(model: &Model, graph: Graph, at: &str) -> Result<(), InvalidModel> {
    let nodes = graph.nodes.len();
    let node = |index: u32, at: &dyn Fn() -> String| {
        check(index < nodes as u32, at, || format!("no node {index}"))
    };
    let item = |index: u32, at: &dyn Fn() -> String| {
        check(index < model.items, at, || format!("no item {index}"))
    };

    for (n, current) in graph.nodes.iter().enumerate() {
        let path = |field: &str| format!("{at}nodes[{n}]{field}");
        match current.kind {
            NodeKind::Junction => check(
                current.rates.is_empty(),
                || path(".rates"),
                || "junctions have no rates".into(),
            )?,
            NodeKind::Instance => {
                let blueprint = current.blueprint.ok_or_else(|| {
                    InvalidModel(format!("{}: missing for an instance", path(".blueprint")))
                })?;
                check(
                    (blueprint as usize) < model.blueprints.len(),
                    || path(".blueprint"),
                    || format!("no blueprint {blueprint}"),
                )?;
                let plain = current.rates.is_empty()
                    && current.max.is_none()
                    && current.pin.is_none()
                    && current.cost == 0.0;
                check(
                    plain,
                    || path(""),
                    || "instances have no rates, maximum, pin or cost".into(),
                )?;
            }
            NodeKind::Process | NodeKind::Balanced => {}
        }
        if current.kind != NodeKind::Instance {
            check(
                current.blueprint.is_none(),
                || path(".blueprint"),
                || "only instances place blueprints".into(),
            )?;
        }
        for (r, rate) in current.rates.iter().enumerate() {
            item(rate.item, &|| path(&format!(".rates[{r}].item")))?;
            finite(rate.per_second, || path(&format!(".rates[{r}].perSecond")))?;
        }
        if let Some(max) = current.max {
            non_negative(max, || path(".max"))?;
        }
        if let Some(pin) = current.pin {
            non_negative(pin, || path(".pin"))?;
        }
        finite(current.cost, || path(".cost"))?;
    }
    for (e, edge) in graph.edges.iter().enumerate() {
        let path = |field: &str| format!("{at}edges[{e}].{field}");
        node(edge.from, &|| path("from"))?;
        node(edge.to, &|| path("to"))?;
        item(edge.item, &|| path("item"))?;
        if let Some(capacity) = edge.capacity {
            non_negative(capacity, || path("capacity"))?;
        }
        if let Some(ratio) = edge.ratio {
            check(
                (0.0..=1.0).contains(&ratio),
                || path("ratio"),
                || "not between 0 and 1".into(),
            )?;
        }
        for (end, port, entering, name) in [
            (edge.from, edge.from_port, false, "fromPort"),
            (edge.to, edge.to_port, true, "toPort"),
        ] {
            let at = || path(name);
            match (graph.nodes[end as usize].blueprint, port) {
                (None, None) => {}
                (Some(_), None) => {
                    return Err(InvalidModel(format!("{}: missing for an instance", at())));
                }
                (None, Some(_)) => {
                    return Err(InvalidModel(format!(
                        "{}: nodes[{end}] is no instance",
                        at()
                    )));
                }
                (Some(blueprint), Some(port)) => {
                    let (port_item, is_in) = model.blueprints[blueprint as usize]
                        .port(port)
                        .ok_or_else(|| InvalidModel(format!("{}: no port {port}", at())))?;
                    let direction = if entering { "in" } else { "out" };
                    check(is_in == entering, at, || {
                        format!("port {port} is no {direction} port")
                    })?;
                    check(port_item == edge.item, at, || {
                        format!("port {port} carries item {port_item}, not {}", edge.item)
                    })?;
                }
            }
        }
    }
    for (c, constraint) in graph.constraints.iter().enumerate() {
        let path = |field: &str| format!("{at}constraints[{c}].{field}");
        check(
            !constraint.terms.is_empty(),
            || path("terms"),
            || "empty".into(),
        )?;
        for (t, term) in constraint.terms.iter().enumerate() {
            node(term.node, &|| path(&format!("terms[{t}].node")))?;
            finite(term.coefficient, || {
                path(&format!("terms[{t}].coefficient"))
            })?;
        }
        finite(constraint.rhs, || path("rhs"))?;
    }
    Ok(())
}

/// Blueprints may place other blueprints, but never themselves, directly or through others.
fn check_nesting(model: &Model) -> Result<(), InvalidModel> {
    #[derive(Clone, Copy, PartialEq)]
    enum Visit {
        New,
        Open,
        Done,
    }
    fn visit(model: &Model, b: usize, visits: &mut [Visit]) -> Result<(), InvalidModel> {
        visits[b] = Visit::Open;
        for (n, node) in model.blueprints[b].nodes.iter().enumerate() {
            let Some(inner) = node.blueprint else {
                continue;
            };
            match visits[inner as usize] {
                Visit::Open => {
                    return Err(InvalidModel(format!(
                        "blueprints[{b}].nodes[{n}].blueprint: blueprint {inner} contains itself"
                    )));
                }
                Visit::New => visit(model, inner as usize, visits)?,
                Visit::Done => {}
            }
        }
        visits[b] = Visit::Done;
        Ok(())
    }
    let mut visits = vec![Visit::New; model.blueprints.len()];
    for b in 0..model.blueprints.len() {
        if visits[b] == Visit::New {
            visit(model, b, &mut visits)?;
        }
    }
    Ok(())
}

fn check(
    ok: bool,
    at: impl FnOnce() -> String,
    problem: impl FnOnce() -> String,
) -> Result<(), InvalidModel> {
    if ok {
        Ok(())
    } else {
        Err(InvalidModel(format!("{}: {}", at(), problem())))
    }
}

fn finite(value: f64, at: impl FnOnce() -> String) -> Result<(), InvalidModel> {
    check(value.is_finite(), at, || "not finite".into())
}

fn non_negative(value: f64, at: impl Fn() -> String) -> Result<(), InvalidModel> {
    finite(value, &at)?;
    check(value >= 0.0, at, || "negative".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::*;

    fn process(rates: &[(u32, f64)]) -> Node {
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

    fn instance(blueprint: u32) -> Node {
        Node {
            kind: NodeKind::Instance,
            blueprint: Some(blueprint),
            ..process(&[])
        }
    }

    fn edge(from: u32, to: u32, item: u32) -> Edge {
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

    /// ore source → smelter (1 ore → 1 ingot) → ingot sink
    fn chain() -> Model {
        Model {
            items: 2,
            nodes: vec![
                process(&[(0, 1.0)]),
                process(&[(0, -0.5), (1, 0.5)]),
                process(&[(1, -1.0)]),
            ],
            edges: vec![edge(0, 1, 0), edge(1, 2, 1)],
            ..Model::default()
        }
    }

    /// The same chain with the smelter in a blueprint: ore port → smelter → ingot port.
    fn placed() -> Model {
        Model {
            items: 2,
            nodes: vec![process(&[(0, 1.0)]), instance(0), process(&[(1, -1.0)])],
            edges: vec![
                Edge {
                    to_port: Some(0),
                    ..edge(0, 1, 0)
                },
                Edge {
                    from_port: Some(1),
                    ..edge(1, 2, 1)
                },
            ],
            blueprints: vec![Blueprint {
                nodes: vec![
                    process(&[(0, 1.0)]),
                    process(&[(0, -0.5), (1, 0.5)]),
                    process(&[(1, -1.0)]),
                ],
                edges: vec![edge(0, 1, 0), edge(1, 2, 1)],
                constraints: vec![],
                ports: vec![0, 2],
            }],
            ..Model::default()
        }
    }

    fn error_in(mut model: Model, change: impl FnOnce(&mut Model)) -> String {
        change(&mut model);
        match validate(&model) {
            Ok(()) => String::from("<valid>"),
            Err(InvalidModel(message)) => message,
        }
    }

    fn error(change: impl FnOnce(&mut Model)) -> String {
        error_in(chain(), change)
    }

    #[test]
    fn accepts_a_consistent_model() {
        assert_eq!(validate(&chain()), Ok(()));
        assert_eq!(validate(&placed()), Ok(()));
    }

    #[test]
    fn rejects_references_out_of_range() {
        assert_eq!(error(|m| m.edges[0].to = 7), "edges[0].to: no node 7");
        assert_eq!(error(|m| m.edges[1].item = 2), "edges[1].item: no item 2");
        assert_eq!(
            error(|m| m.nodes[0].rates[0].item = 5),
            "nodes[0].rates[0].item: no item 5"
        );
        assert_eq!(
            error(|m| m.constraints.push(Constraint {
                terms: vec![Term {
                    node: 3,
                    coefficient: 1.0
                }],
                op: Comparison::AtMost,
                rhs: 1.0
            })),
            "constraints[0].terms[0].node: no node 3"
        );
    }

    #[test]
    fn rejects_numbers_out_of_range() {
        assert_eq!(
            error(|m| m.nodes[1].rates[0].per_second = f64::NAN),
            "nodes[1].rates[0].perSecond: not finite"
        );
        assert_eq!(
            error(|m| m.nodes[0].max = Some(-1.0)),
            "nodes[0].max: negative"
        );
        assert_eq!(
            error(|m| m.nodes[0].pin = Some(-1.0)),
            "nodes[0].pin: negative"
        );
        assert_eq!(
            error(|m| m.nodes[0].cost = f64::INFINITY),
            "nodes[0].cost: not finite"
        );
        assert_eq!(
            error(|m| m.edges[0].capacity = Some(-2.0)),
            "edges[0].capacity: negative"
        );
        assert_eq!(
            error(|m| m.edges[0].ratio = Some(1.5)),
            "edges[0].ratio: not between 0 and 1"
        );
    }

    #[test]
    fn rejects_constraints_without_terms() {
        assert_eq!(
            error(|m| m.constraints.push(Constraint {
                terms: vec![],
                op: Comparison::AtMost,
                rhs: 1.0
            })),
            "constraints[0].terms: empty"
        );
    }

    #[test]
    fn rejects_rates_on_junctions() {
        assert_eq!(
            error(|m| m.nodes[1].kind = NodeKind::Junction),
            "nodes[1].rates: junctions have no rates"
        );
    }

    #[test]
    fn instances_place_a_known_blueprint_and_nothing_else() {
        assert_eq!(
            error_in(placed(), |m| m.nodes[1].blueprint = None),
            "nodes[1].blueprint: missing for an instance"
        );
        assert_eq!(
            error_in(placed(), |m| m.nodes[1].blueprint = Some(3)),
            "nodes[1].blueprint: no blueprint 3"
        );
        assert_eq!(
            error_in(placed(), |m| m.nodes[1].pin = Some(1.0)),
            "nodes[1]: instances have no rates, maximum, pin or cost"
        );
        assert_eq!(
            error_in(placed(), |m| m.nodes[0].blueprint = Some(0)),
            "nodes[0].blueprint: only instances place blueprints"
        );
    }

    #[test]
    fn edges_reach_instances_through_ports_of_the_right_direction_and_item() {
        assert_eq!(
            error_in(placed(), |m| m.edges[0].to_port = None),
            "edges[0].toPort: missing for an instance"
        );
        assert_eq!(
            error_in(placed(), |m| m.edges[0].from_port = Some(0)),
            "edges[0].fromPort: nodes[0] is no instance"
        );
        assert_eq!(
            error_in(placed(), |m| m.edges[0].to_port = Some(5)),
            "edges[0].toPort: no port 5"
        );
        assert_eq!(
            error_in(placed(), |m| m.edges[0].to_port = Some(1)),
            "edges[0].toPort: port 1 is no in port"
        );
        assert_eq!(
            error_in(placed(), |m| {
                m.edges[1].item = 0;
                m.nodes[2].rates[0].item = 0;
            }),
            "edges[1].fromPort: port 1 carries item 1, not 0"
        );
    }

    #[test]
    fn blueprints_are_checked_like_graphs_and_their_ports_are_plain() {
        assert_eq!(
            error_in(placed(), |m| m.blueprints[0].edges[0].to = 9),
            "blueprints[0].edges[0].to: no node 9"
        );
        assert_eq!(
            error_in(placed(), |m| m.blueprints[0].ports[1] = 1),
            "blueprints[0].ports[1]: nodes[1] is no port (one rate of ±1, nothing else)"
        );
        assert_eq!(
            error_in(placed(), |m| m.blueprints[0].ports[1] = 0),
            "blueprints[0].ports[1]: nodes[0] is a port twice"
        );
        assert_eq!(
            error_in(placed(), |m| m.blueprints[0].nodes[2].pin = Some(1.0)),
            "blueprints[0].ports[1]: nodes[2] is no port (one rate of ±1, nothing else)"
        );
    }

    #[test]
    fn a_blueprint_never_contains_itself() {
        let nested = |m: &mut Model| {
            let mut inner = m.blueprints[0].clone();
            inner.nodes.push(instance(0));
            m.blueprints.push(inner);
            m.blueprints[0].nodes.push(instance(1));
        };
        assert_eq!(
            error_in(placed(), nested),
            "blueprints[1].nodes[3].blueprint: blueprint 0 contains itself"
        );
    }
}
