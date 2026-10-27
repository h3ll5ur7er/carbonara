//! Splits a model into its weakly connected components, each a model of its own with local indices,
//! and puts the components' solutions back together. Small LPs solve much faster than one big one,
//! and a component that didn't change can reuse its cached solution.

use crate::ir::{
    Constraint, Edge, EdgeSlack, Model, Node, NodeSlack, PortSlack, Rate, Solution, Term,
};

/// Part of a model that shares no edge and no plugin constraint with the rest.
#[derive(Debug, Clone, PartialEq)]
pub struct Component {
    /// Indices in the whole model, ascending; position = index in `model`.
    pub nodes: Vec<u32>,
    pub edges: Vec<u32>,
    pub constraints: Vec<u32>,
    /// The global item of each local item, ascending.
    pub items: Vec<u32>,
    /// The component on its own, renumbered so equal components give equal models wherever they sit.
    pub model: Model,
}

/// Components ordered by their first node.
pub fn components(model: &Model) -> Vec<Component> {
    let mut groups = Groups::new(model.nodes.len());
    for edge in &model.edges {
        groups.join(edge.from, edge.to);
    }
    for constraint in &model.constraints {
        if let Some(first) = constraint.terms.first() {
            for term in &constraint.terms[1..] {
                groups.join(first.node, term.node);
            }
        }
    }

    let mut component_of_root: Vec<Option<usize>> = vec![None; model.nodes.len()];
    let mut found: Vec<Component> = Vec::new();
    let mut component_of = |node: u32, groups: &mut Groups| -> usize {
        let root = groups.root(node) as usize;
        *component_of_root[root].get_or_insert_with(|| {
            found.push(Component {
                nodes: vec![],
                edges: vec![],
                constraints: vec![],
                items: vec![],
                model: Model {
                    items: 0,
                    nodes: vec![],
                    edges: vec![],
                    constraints: vec![],
                },
            });
            found.len() - 1
        })
    };
    let mut slots = Vec::with_capacity(model.nodes.len());
    for node in 0..model.nodes.len() as u32 {
        slots.push(component_of(node, &mut groups));
    }
    for (index, &slot) in slots.iter().enumerate() {
        found[slot].nodes.push(index as u32);
    }
    for (index, edge) in model.edges.iter().enumerate() {
        found[slots[edge.from as usize]].edges.push(index as u32);
    }
    for (index, constraint) in model.constraints.iter().enumerate() {
        // `validate` rejects constraints without terms.
        if let Some(first) = constraint.terms.first() {
            found[slots[first.node as usize]]
                .constraints
                .push(index as u32);
        }
    }
    for component in &mut found {
        component.items = items_of(model, component);
        component.model = local_model(model, component);
    }
    found
}

fn items_of(model: &Model, component: &Component) -> Vec<u32> {
    let rates = component
        .nodes
        .iter()
        .flat_map(|&n| model.nodes[n as usize].rates.iter().map(|rate| rate.item));
    let edges = component
        .edges
        .iter()
        .map(|&e| model.edges[e as usize].item);
    let mut items: Vec<u32> = rates.chain(edges).collect();
    items.sort_unstable();
    items.dedup();
    items
}

fn local_model(model: &Model, component: &Component) -> Model {
    let node = |global: u32| local(&component.nodes, global);
    let item = |global: u32| local(&component.items, global);
    Model {
        items: component.items.len() as u32,
        nodes: component
            .nodes
            .iter()
            .map(|&n| {
                let original = &model.nodes[n as usize];
                Node {
                    rates: original
                        .rates
                        .iter()
                        .map(|rate| Rate {
                            item: item(rate.item),
                            ..*rate
                        })
                        .collect(),
                    ..original.clone()
                }
            })
            .collect(),
        edges: component
            .edges
            .iter()
            .map(|&e| {
                let original = &model.edges[e as usize];
                Edge {
                    from: node(original.from),
                    to: node(original.to),
                    item: item(original.item),
                    ..original.clone()
                }
            })
            .collect(),
        constraints: component
            .constraints
            .iter()
            .map(|&c| {
                let original = &model.constraints[c as usize];
                Constraint {
                    terms: original
                        .terms
                        .iter()
                        .map(|term| Term {
                            node: node(term.node),
                            ..*term
                        })
                        .collect(),
                    ..original.clone()
                }
            })
            .collect(),
    }
}

/// Position of `global` in an ascending list that contains it.
fn local(globals: &[u32], global: u32) -> u32 {
    globals.partition_point(|&g| g < global) as u32
}

/// Puts the solutions of a model's components together into the model's solution.
pub fn merge(model: &Model, parts: &[(&Component, &Solution)]) -> Solution {
    let mut whole = Solution {
        activity: vec![0.0; model.nodes.len()],
        flow: vec![0.0; model.edges.len()],
        surplus: vec![],
        deficit: vec![],
        overflow: vec![],
        pin_misses: vec![],
    };
    for &(component, solution) in parts {
        for (local, &global) in component.nodes.iter().enumerate() {
            whole.activity[global as usize] = solution.activity[local];
        }
        for (local, &global) in component.edges.iter().enumerate() {
            whole.flow[global as usize] = solution.flow[local];
        }
        let port = |slack: &PortSlack| PortSlack {
            node: component.nodes[slack.node as usize],
            item: component.items[slack.item as usize],
            per_second: slack.per_second,
        };
        whole.surplus.extend(solution.surplus.iter().map(port));
        whole.deficit.extend(solution.deficit.iter().map(port));
        whole
            .overflow
            .extend(solution.overflow.iter().map(|slack| EdgeSlack {
                edge: component.edges[slack.edge as usize],
                per_second: slack.per_second,
            }));
        whole
            .pin_misses
            .extend(solution.pin_misses.iter().map(|miss| NodeSlack {
                node: component.nodes[miss.node as usize],
                difference: miss.difference,
            }));
    }
    // The order one big solve would give.
    whole.surplus.sort_by_key(|slack| (slack.node, slack.item));
    whole.deficit.sort_by_key(|slack| (slack.node, slack.item));
    whole.overflow.sort_by_key(|slack| slack.edge);
    whole.pin_misses.sort_by_key(|miss| miss.node);
    whole
}

/// Union-find over node indices.
struct Groups {
    parent: Vec<u32>,
}

impl Groups {
    fn new(nodes: usize) -> Self {
        Groups {
            parent: (0..nodes as u32).collect(),
        }
    }

    fn root(&mut self, node: u32) -> u32 {
        let mut root = node;
        while self.parent[root as usize] != root {
            root = self.parent[root as usize];
        }
        let mut current = node;
        while self.parent[current as usize] != root {
            let next = self.parent[current as usize];
            self.parent[current as usize] = root;
            current = next;
        }
        root
    }

    /// The smaller root wins, so a component's root is its first node.
    fn join(&mut self, a: u32, b: u32) {
        let (a, b) = (self.root(a), self.root(b));
        self.parent[a.max(b) as usize] = a.min(b);
    }
}
