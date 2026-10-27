//! A blueprint on its own: its body as the root graph of a model that holds exactly the blueprints it
//! places (directly or deeper), renumbered so that the same blueprint gives the same closure in any
//! document. Summaries are computed from, and cached by, closures.

use crate::ir::{Blueprint, Edge, Model, Node, Rate};

#[derive(Debug, Clone, PartialEq)]
pub struct Closure {
    /// The body as the root graph; nested blueprints renumbered in their original order.
    pub model: Model,
    pub ports: Vec<u32>,
    /// The original item of each closure item, ascending.
    pub items: Vec<u32>,
    /// The original index of each nested blueprint.
    pub blueprints: Vec<u32>,
}

pub fn closure(model: &Model, blueprint: u32) -> Closure {
    let mut nested = Vec::new();
    let mut stack = vec![blueprint];
    while let Some(b) = stack.pop() {
        for node in &model.blueprints[b as usize].nodes {
            if let Some(inner) = node.blueprint
                && !nested.contains(&inner)
            {
                nested.push(inner);
                stack.push(inner);
            }
        }
    }
    nested.sort_unstable();

    let mut items = Vec::new();
    for &b in std::iter::once(&blueprint).chain(&nested) {
        let body = &model.blueprints[b as usize];
        items.extend(
            body.nodes
                .iter()
                .flat_map(|node| node.rates.iter().map(|rate| rate.item)),
        );
        items.extend(body.edges.iter().map(|edge| edge.item));
    }
    items.sort_unstable();
    items.dedup();

    let item = |global: u32| items.partition_point(|&i| i < global) as u32;
    let renumber = |body: &Blueprint| Blueprint {
        nodes: body
            .nodes
            .iter()
            .map(|node| Node {
                rates: node
                    .rates
                    .iter()
                    .map(|rate| Rate {
                        item: item(rate.item),
                        ..*rate
                    })
                    .collect(),
                blueprint: node
                    .blueprint
                    .map(|b| nested.partition_point(|&n| n < b) as u32),
                ..node.clone()
            })
            .collect(),
        edges: body
            .edges
            .iter()
            .map(|edge| Edge {
                item: item(edge.item),
                ..edge.clone()
            })
            .collect(),
        constraints: body.constraints.clone(),
        ports: body.ports.clone(),
    };
    let root = renumber(&model.blueprints[blueprint as usize]);
    Closure {
        model: Model {
            items: items.len() as u32,
            nodes: root.nodes,
            edges: root.edges,
            constraints: root.constraints,
            blueprints: nested
                .iter()
                .map(|&b| renumber(&model.blueprints[b as usize]))
                .collect(),
        },
        ports: root.ports,
        items,
        blueprints: nested,
    }
}
