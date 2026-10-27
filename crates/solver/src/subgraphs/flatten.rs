//! Replaces a graph's instance nodes by what the LP solves instead. A summarised blueprint becomes one
//! macro node per mode; an inlined one becomes its body, balanced (no slack inside, as in its summary's
//! cone). Either way the boundary behaves like a machine's ports: what the graph around doesn't supply
//! is a deficit there, what it doesn't take a surplus. The graph's own nodes and edges keep their
//! indices, so its solution reads straight back; what the flat model adds comes after them.

use super::summary::{Shape, Summary};
use super::{Context, Resolved, scale_pins};
use crate::SolveError;
use crate::graph::Graph;
use crate::ir::{
    Comparison, Constraint, Edge, Inlined, InstanceSolution, Model, Node, NodeKind, PortSlack,
    Rate, Solution, Term,
};
use std::rc::Rc;

pub struct Flat {
    /// The model the LP solves: no instances and no blueprints.
    pub model: Model,
    /// The item each flat item stands for: itself, or the item a private item was made for.
    real: Vec<u32>,
    /// The graph node each flat node belongs to: itself, or the instance it was made for.
    owner: Vec<u32>,
    /// The flattened graph's own nodes and edges, which come first in `model`.
    nodes: usize,
    edges: usize,
    placements: Vec<Placement>,
    /// Blueprints solved inline, here or deeper.
    pub inlined: Vec<Inlined>,
}

enum Placement {
    Summarised {
        node: u32,
        summary: Rc<Summary>,
        /// The flat node of each mode.
        modes: Vec<u32>,
    },
    Inline {
        node: u32,
        body: Box<Flat>,
        /// Where the body's nodes and edges start in the flat model.
        offset: usize,
        edge_offset: usize,
        /// The flat node of each port inside.
        ports: Vec<u32>,
        /// Whether the instance node is the scale its blueprint's pins are tied to.
        scaled: bool,
    },
}

/// A process node: with no rates, the instance node's slot when other nodes do its work.
fn process(rates: Vec<Rate>, max: Option<f64>) -> Node {
    Node {
        kind: NodeKind::Process,
        rates,
        max,
        pin: None,
        cost: 0.0,
        blueprint: None,
    }
}

/// `Σ coefficient · activity = 0`
fn tie(terms: impl IntoIterator<Item = (u32, f64)>) -> Constraint {
    Constraint {
        terms: terms
            .into_iter()
            .map(|(node, coefficient)| Term { node, coefficient })
            .collect(),
        op: Comparison::Equal,
        rhs: 0.0,
    }
}

/// A port's node towards the graph around: it takes the item in (`in` port) or gives it out.
fn boundary(item: u32, entering: bool) -> Node {
    let per_second = if entering { -1.0 } else { 1.0 };
    process(vec![Rate { item, per_second }], None)
}

/// Flattens `graph`, a graph of `model` (its root graph or a blueprint's body).
pub fn flatten(
    model: &Model,
    graph: Graph,
    context: &mut impl Context,
) -> Result<Flat, SolveError> {
    let mut flat = Flat {
        model: Model {
            items: model.items,
            nodes: graph.nodes.to_vec(),
            edges: graph.edges.to_vec(),
            constraints: graph.constraints.to_vec(),
            blueprints: vec![],
        },
        real: (0..model.items).collect(),
        owner: (0..graph.nodes.len() as u32).collect(),
        nodes: graph.nodes.len(),
        edges: graph.edges.len(),
        placements: vec![],
        inlined: vec![],
    };
    let mut resolved: Vec<Option<Option<Rc<Resolved>>>> = vec![None; model.blueprints.len()];
    let mut endpoints: Vec<Vec<u32>> = vec![vec![]; graph.nodes.len()];
    for (n, node) in graph.nodes.iter().enumerate() {
        let Some(b) = node.blueprint else {
            continue;
        };
        let summary = match &resolved[b as usize] {
            Some(known) => known.clone(),
            None => {
                let found = context.summary(model, b)?.map(Rc::new);
                resolved[b as usize] = Some(found.clone());
                found
            }
        };
        endpoints[n] = match summary {
            Some(resolved) => {
                for inner in &resolved.summary.inlined {
                    flat.inlined.push(Inlined {
                        blueprint: resolved.blueprints[inner.blueprint as usize],
                        ..*inner
                    });
                }
                match resolved.summary.shape {
                    Shape::Inline { freedom } => {
                        flat.inlined.push(Inlined {
                            blueprint: b,
                            freedom,
                        });
                        flat.inline(model, n as u32, b, context)?
                    }
                    Shape::Modes { .. } => flat.summarise(model, n as u32, b, &resolved),
                }
            }
            None => flat.inline(model, n as u32, b, context)?,
        };
    }
    for edge in &mut flat.model.edges[..flat.edges] {
        if let Some(port) = edge.from_port.take() {
            edge.from = endpoints[edge.from as usize][port as usize];
        }
        if let Some(port) = edge.to_port.take() {
            edge.to = endpoints[edge.to as usize][port as usize];
        }
    }
    flat.inlined.sort_by_key(|inlined| inlined.blueprint);
    flat.inlined.dedup();
    Ok(flat)
}

impl Flat {
    /// The item a flat item stands for.
    pub fn real_item(&self, item: u32) -> u32 {
        self.real[item as usize]
    }

    fn private_item(&mut self, real: u32) -> u32 {
        self.real.push(real);
        self.model.items += 1;
        self.model.items - 1
    }

    fn add(&mut self, node: Node, owner: u32) -> u32 {
        self.model.nodes.push(node);
        self.owner.push(owner);
        self.model.nodes.len() as u32 - 1
    }

    /// Places the blueprint's body, balanced, with its pins as ratios to the instance's scale and its
    /// belts' limits left to its expansion (docs/Architecture/Subgraphs.md). Each port gets a node
    /// towards the graph around, tied to the port node inside.
    fn inline(
        &mut self,
        model: &Model,
        node: u32,
        blueprint: u32,
        context: &mut impl Context,
    ) -> Result<Vec<u32>, SolveError> {
        let source = &model.blueprints[blueprint as usize];
        let mut body = flatten(model, source.graph(), context)?;
        for inner in &mut body.model.nodes {
            if inner.kind == NodeKind::Process {
                inner.kind = NodeKind::Balanced;
            }
        }
        for edge in &mut body.model.edges {
            edge.capacity = None;
        }
        self.inlined.append(&mut body.inlined);

        let offset = self.model.nodes.len();
        let edge_offset = self.model.edges.len();
        let items: Vec<u32> = (0..body.model.items)
            .map(|item| {
                if item < model.items {
                    item
                } else {
                    self.private_item(body.real[item as usize])
                }
            })
            .collect();
        for inner in &body.model.nodes {
            let placed = Node {
                rates: inner
                    .rates
                    .iter()
                    .map(|rate| Rate {
                        item: items[rate.item as usize],
                        ..*rate
                    })
                    .collect(),
                ..inner.clone()
            };
            self.add(placed, node);
        }
        let shift = |index: u32| index + offset as u32;
        for edge in &body.model.edges {
            self.model.edges.push(Edge {
                from: shift(edge.from),
                to: shift(edge.to),
                item: items[edge.item as usize],
                ..edge.clone()
            });
        }
        for constraint in &body.model.constraints {
            let mut placed = constraint.clone();
            for term in &mut placed.terms {
                term.node = shift(term.node);
            }
            self.model.constraints.push(placed);
        }
        let scaled = scale_pins(&mut self.model, offset..offset + source.nodes.len(), node);
        self.model.nodes[node as usize] = process(vec![], if scaled { None } else { Some(0.0) });

        let inside: Vec<u32> = source.ports.iter().map(|&port| shift(port)).collect();
        let mut endpoints = Vec::with_capacity(inside.len());
        for (port, &at) in inside.iter().enumerate() {
            let (item, entering) = source.port(port as u32).unwrap_or((0, false));
            let outside = self.add(boundary(item, entering), node);
            self.model
                .constraints
                .push(tie([(outside, 1.0), (at, -1.0)]));
            endpoints.push(outside);
        }
        body.model = Model::default();
        self.placements.push(Placement::Inline {
            node,
            body: Box::new(body),
            offset,
            edge_offset,
            ports: inside,
            scaled,
        });
        Ok(endpoints)
    }

    /// Places a summary: one macro node per mode. A single mode whose items all differ attaches to the
    /// edges itself; otherwise each port gets a node whose flow is tied to the modes'.
    fn summarise(
        &mut self,
        model: &Model,
        node: u32,
        blueprint: u32,
        resolved: &Resolved,
    ) -> Vec<u32> {
        let summary = &resolved.summary;
        let (modes, max) = match &summary.shape {
            Shape::Modes { modes, max } => (modes, *max),
            Shape::Inline { .. } => (&Vec::new(), None),
        };
        self.placements.push(Placement::Summarised {
            node,
            summary: summary.clone(),
            modes: vec![],
        });
        let source = &model.blueprints[blueprint as usize];
        let ports: Vec<(u32, bool)> = (0..source.ports.len() as u32)
            .map(|port| source.port(port).unwrap_or((0, false)))
            .collect();
        if modes.is_empty() {
            self.model.nodes[node as usize] = process(vec![], Some(0.0));
            return vec![node; ports.len()];
        }
        let loose: Vec<(u32, bool)> = summary
            .loose
            .iter()
            .map(|loose| (resolved.items[loose.item as usize], loose.surplus))
            .collect();
        let items = ports.iter().chain(&loose).map(|&(item, _)| item);
        let uses = |item: u32| items.clone().filter(|&other| other == item).count();
        let direct = modes.len() == 1 && items.clone().all(|item| uses(item) == 1);

        let loose_items: Vec<u32> = if direct {
            loose.iter().map(|&(item, _)| item).collect()
        } else {
            // Loose ports of one item stay apart; otherwise a surplus would make up a deficit.
            let loose_uses = |item: u32| loose.iter().filter(|other| other.0 == item).count();
            loose
                .iter()
                .map(|&(item, _)| {
                    if loose_uses(item) == 1 {
                        item
                    } else {
                        self.private_item(item)
                    }
                })
                .collect()
        };
        let rates = |mode: &super::summary::Mode, with_ports: bool| -> Vec<Rate> {
            let mut rates = Vec::new();
            if with_ports {
                for (&(item, entering), &flow) in ports.iter().zip(&mode.inside.ports) {
                    if flow > 0.0 {
                        let per_second = if entering { -flow } else { flow };
                        rates.push(Rate { item, per_second });
                    }
                }
            }
            for ((&(_, surplus), &item), &amount) in loose.iter().zip(&loose_items).zip(&mode.loose)
            {
                if amount > 0.0 {
                    let per_second = if surplus { amount } else { -amount };
                    rates.push(Rate { item, per_second });
                }
            }
            rates
        };
        let single = modes.len() == 1;
        let mode_nodes: Vec<u32> = if direct {
            self.model.nodes[node as usize] = Node {
                cost: modes[0].cost,
                ..process(rates(&modes[0], true), max)
            };
            vec![node]
        } else {
            self.model.nodes[node as usize] = process(vec![], Some(0.0));
            modes
                .iter()
                .map(|mode| {
                    let at = Node {
                        cost: mode.cost,
                        ..process(rates(mode, false), if single { max } else { None })
                    };
                    self.add(at, node)
                })
                .collect()
        };
        let endpoints = if direct {
            vec![node; ports.len()]
        } else {
            let mut endpoints = Vec::with_capacity(ports.len());
            for (p, &(item, entering)) in ports.iter().enumerate() {
                let at = self.add(boundary(item, entering), node);
                let modes = modes.iter().zip(&mode_nodes);
                let terms = modes
                    .filter(|(mode, _)| mode.inside.ports[p] > 0.0)
                    .map(|(mode, &m)| (m, -mode.inside.ports[p]));
                self.model
                    .constraints
                    .push(tie(std::iter::once((at, 1.0)).chain(terms)));
                endpoints.push(at);
            }
            endpoints
        };
        if let Some(Placement::Summarised { modes, .. }) = self.placements.last_mut() {
            *modes = mode_nodes;
        }
        endpoints
    }

    /// The values of the flattened graph's own nodes and edges, with what its instances do, from the
    /// values of the flat model. An instance's activity is its scale.
    pub fn unflatten(
        &self,
        activity: &[f64],
        flow: &[f64],
    ) -> (Vec<f64>, Vec<f64>, Vec<InstanceSolution>) {
        let mut nodes = activity[..self.nodes].to_vec();
        let edges = flow[..self.edges].to_vec();
        let mut instances = Vec::with_capacity(self.placements.len());
        for placement in &self.placements {
            let (node, scale, inside) = match placement {
                Placement::Summarised {
                    node,
                    summary,
                    modes,
                } => {
                    let mut inside = InstanceSolution {
                        node: *node,
                        ports: vec![0.0; summary.ports],
                        activity: vec![0.0; summary.nodes],
                        instances: vec![],
                    };
                    let mut scale = 0.0;
                    for (mode, &at) in summary.modes().iter().zip(modes) {
                        let amount = activity[at as usize];
                        add_scaled(&mut inside, &mode.inside, amount);
                        scale += amount * mode.scale;
                    }
                    (*node, scale, inside)
                }
                Placement::Inline {
                    node,
                    body,
                    offset,
                    edge_offset,
                    ports,
                    scaled,
                } => {
                    let (inner, _, nested) =
                        body.unflatten(&activity[*offset..], &flow[*edge_offset..]);
                    let scale = if *scaled {
                        activity[*node as usize]
                    } else {
                        0.0
                    };
                    let inside = InstanceSolution {
                        node: *node,
                        ports: ports.iter().map(|&port| activity[port as usize]).collect(),
                        activity: inner,
                        instances: nested,
                    };
                    (*node, scale, inside)
                }
            };
            nodes[node as usize] = scale;
            instances.push(inside);
        }
        (nodes, edges, instances)
    }

    /// The flattened graph's solution from the flat model's: slacks of what an instance stands for are
    /// the instance's, in real items.
    pub fn solution(&self, flat: &Solution) -> Solution {
        let (activity, flow, instances) = self.unflatten(&flat.activity, &flat.flow);
        let ports = |slacks: &[PortSlack]| {
            let mut mapped: Vec<PortSlack> = slacks
                .iter()
                .map(|slack| PortSlack {
                    node: self.owner[slack.node as usize],
                    item: self.real[slack.item as usize],
                    per_second: slack.per_second,
                })
                .collect();
            mapped.sort_by_key(|slack| (slack.node, slack.item));
            let mut merged: Vec<PortSlack> = Vec::with_capacity(mapped.len());
            for slack in mapped {
                match merged.last_mut() {
                    Some(last) if (last.node, last.item) == (slack.node, slack.item) => {
                        last.per_second += slack.per_second;
                    }
                    _ => merged.push(slack),
                }
            }
            merged
        };
        Solution {
            surplus: ports(&flat.surplus),
            deficit: ports(&flat.deficit),
            overflow: flat
                .overflow
                .iter()
                .filter(|slack| (slack.edge as usize) < self.edges)
                .copied()
                .collect(),
            pin_misses: flat
                .pin_misses
                .iter()
                .filter(|miss| (miss.node as usize) < self.nodes)
                .copied()
                .collect(),
            activity,
            flow,
            instances,
            inlined: self.inlined.clone(),
        }
    }
}

/// `sum += amount · part`, for two solutions of instances of the same blueprint.
pub fn add_scaled(sum: &mut InstanceSolution, part: &InstanceSolution, amount: f64) {
    let add = |sum: &mut Vec<f64>, part: &[f64]| {
        for (s, p) in sum.iter_mut().zip(part) {
            *s += amount * p;
        }
    };
    add(&mut sum.ports, &part.ports);
    add(&mut sum.activity, &part.activity);
    if sum.instances.is_empty() {
        sum.instances = part
            .instances
            .iter()
            .map(|inner| InstanceSolution {
                node: inner.node,
                ports: vec![0.0; inner.ports.len()],
                activity: vec![0.0; inner.activity.len()],
                instances: vec![],
            })
            .collect();
    }
    for (s, p) in sum.instances.iter_mut().zip(&part.instances) {
        add_scaled(s, p, amount);
    }
}
