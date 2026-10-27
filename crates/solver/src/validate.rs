//! Checks that a model is internally consistent before it is solved.
//! An invalid model is a bug in the compiler engine, not a user error, so the message is for developers.

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
    let nodes = model.nodes.len();
    let node =
        |index: u32, at: String| check(index < nodes as u32, at, || format!("no node {index}"));
    let item =
        |index: u32, at: String| check(index < model.items, at, || format!("no item {index}"));

    for (n, current) in model.nodes.iter().enumerate() {
        if current.kind == NodeKind::Junction && !current.rates.is_empty() {
            return Err(InvalidModel(format!(
                "nodes[{n}].rates: junctions have no rates"
            )));
        }
        for (r, rate) in current.rates.iter().enumerate() {
            item(rate.item, format!("nodes[{n}].rates[{r}].item"))?;
            finite(rate.per_second, format!("nodes[{n}].rates[{r}].perSecond"))?;
        }
        if let Some(max) = current.max {
            non_negative(max, format!("nodes[{n}].max"))?;
        }
        if let Some(pin) = current.pin {
            non_negative(pin, format!("nodes[{n}].pin"))?;
        }
        finite(current.cost, format!("nodes[{n}].cost"))?;
    }
    for (e, edge) in model.edges.iter().enumerate() {
        node(edge.from, format!("edges[{e}].from"))?;
        node(edge.to, format!("edges[{e}].to"))?;
        item(edge.item, format!("edges[{e}].item"))?;
        if let Some(capacity) = edge.capacity {
            non_negative(capacity, format!("edges[{e}].capacity"))?;
        }
        if let Some(ratio) = edge.ratio {
            check(
                (0.0..=1.0).contains(&ratio),
                format!("edges[{e}].ratio"),
                || "not between 0 and 1".into(),
            )?;
        }
    }
    for (c, constraint) in model.constraints.iter().enumerate() {
        check(
            !constraint.terms.is_empty(),
            format!("constraints[{c}].terms"),
            || "empty".into(),
        )?;
        for (t, term) in constraint.terms.iter().enumerate() {
            node(term.node, format!("constraints[{c}].terms[{t}].node"))?;
            finite(
                term.coefficient,
                format!("constraints[{c}].terms[{t}].coefficient"),
            )?;
        }
        finite(constraint.rhs, format!("constraints[{c}].rhs"))?;
    }
    Ok(())
}

fn check(ok: bool, at: String, problem: impl FnOnce() -> String) -> Result<(), InvalidModel> {
    if ok {
        Ok(())
    } else {
        Err(InvalidModel(format!("{at}: {}", problem())))
    }
}

fn finite(value: f64, at: String) -> Result<(), InvalidModel> {
    check(value.is_finite(), at, || "not finite".into())
}

fn non_negative(value: f64, at: String) -> Result<(), InvalidModel> {
    finite(value, at.clone())?;
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
        }
    }

    fn edge(from: u32, to: u32, item: u32) -> Edge {
        Edge {
            from,
            to,
            item,
            capacity: None,
            ratio: None,
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
            constraints: vec![],
        }
    }

    fn error(change: impl FnOnce(&mut Model)) -> String {
        let mut model = chain();
        change(&mut model);
        match validate(&model) {
            Ok(()) => String::from("<valid>"),
            Err(InvalidModel(message)) => message,
        }
    }

    #[test]
    fn accepts_a_consistent_model() {
        assert_eq!(validate(&chain()), Ok(()));
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
}
