//! The LP formulation of a model (docs/Architecture/Solver.md, "LP formulation"): which variables and
//! constraints a model becomes, the objective tiers, and how the variables read back as a [`Solution`].

use crate::ir::{Comparison, EdgeSlack, Model, NodeKind, NodeSlack, PortSlack, Solution};
use crate::program::{Program, Terms, Var};

/// Relative size below which a value is floating-point noise: shown as zero and never reported as slack.
const NOISE: f64 = 1e-7;

/// An objective, minimised without worsening the tiers before it.
pub struct Tier {
    pub terms: Terms,
    pub hold: Hold,
}

/// How a solved tier is kept at its optimum while later tiers are minimised.
pub enum Hold {
    /// Every slack keeps its value, so later tiers can't move a shortage to another port.
    EachSlack,
    /// Only the total is kept.
    Total,
}

/// A slack variable at a node's port, with the port's rate per unit of activity.
pub(crate) struct PortVar {
    pub node: u32,
    pub item: u32,
    pub var: Var,
    rate: f64,
}

pub struct Formulation {
    pub program: Program,
    /// In order of priority.
    pub tiers: Vec<Tier>,
    /// By node and by edge: subgraph summaries read these.
    pub(crate) activity: Vec<Var>,
    pub(crate) flow: Vec<Var>,
    pub(crate) surplus: Vec<PortVar>,
    pub(crate) deficit: Vec<PortVar>,
    overflow: Vec<(u32, Var)>,
    pins: Vec<(u32, f64)>,
}

pub fn formulate(model: &Model) -> Formulation {
    let mut program = Program::default();
    let activity: Vec<Var> = model
        .nodes
        .iter()
        .map(|node| program.variable(node.max.unwrap_or(f64::INFINITY)))
        .collect();
    let flow: Vec<Var> = model
        .edges
        .iter()
        .map(|_| program.variable(f64::INFINITY))
        .collect();

    let mut outgoing = vec![Vec::new(); model.nodes.len()];
    let mut incoming = vec![Vec::new(); model.nodes.len()];
    for (e, edge) in model.edges.iter().enumerate() {
        outgoing[edge.from as usize].push(e);
        incoming[edge.to as usize].push(e);
    }
    let rates: Vec<Vec<(u32, f64)>> = model.nodes.iter().map(net_rates).collect();
    let rate = |node: u32, item: u32| -> Option<f64> {
        let rates = &rates[node as usize];
        let found = rates.binary_search_by_key(&item, |&(item, _)| item).ok()?;
        Some(rates[found].1)
    };
    let is_process = |node: u32| model.nodes[node as usize].kind != NodeKind::Junction;

    // An edge only carries what its ends trade: a process must make the item to send it and use it to take it.
    for (e, edge) in model.edges.iter().enumerate() {
        let sends = !is_process(edge.from) || rate(edge.from, edge.item).is_some_and(|r| r > 0.0);
        let takes = !is_process(edge.to) || rate(edge.to, edge.item).is_some_and(|r| r < 0.0);
        if !(sends && takes) {
            program.bounds[flow[e]].1 = 0.0;
        }
    }
    let edge_flows = |edges: &[usize], item: u32| -> Terms {
        edges
            .iter()
            .filter(|&&e| model.edges[e].item == item)
            .map(|&e| (flow[e], 1.0))
            .collect()
    };

    let (mut surplus, mut deficit) = (Vec::new(), Vec::new());
    for (n, node) in model.nodes.iter().enumerate() {
        match node.kind {
            // Flat models have no instances (see `subgraphs`); one would be a process without rates.
            NodeKind::Process | NodeKind::Balanced | NodeKind::Instance => {
                for &(item, rate) in &rates[n] {
                    // Σ flows + slack = |rate| · activity
                    let (edges, slacks) = if rate > 0.0 {
                        (&outgoing[n], &mut surplus)
                    } else {
                        (&incoming[n], &mut deficit)
                    };
                    let mut terms = edge_flows(edges, item);
                    let carried = terms.iter().any(|&(flow, _)| program.bounds[flow].1 > 0.0);
                    let balanced = node.kind == NodeKind::Balanced && carried;
                    let slack = program.variable(if balanced { 0.0 } else { f64::INFINITY });
                    slacks.push(PortVar {
                        node: n as u32,
                        item,
                        var: slack,
                        rate: rate.abs(),
                    });
                    terms.extend([(slack, 1.0), (activity[n], -rate.abs())]);
                    program.row(terms, Comparison::Equal, 0.0);
                }
            }
            NodeKind::Junction => {
                let mut items: Vec<u32> = outgoing[n]
                    .iter()
                    .chain(&incoming[n])
                    .map(|&e| model.edges[e].item)
                    .collect();
                items.sort_unstable();
                items.dedup();
                for item in items {
                    let mut terms = edge_flows(&incoming[n], item);
                    terms.extend(
                        edge_flows(&outgoing[n], item)
                            .into_iter()
                            .map(|(f, _)| (f, -1.0)),
                    );
                    program.row(terms, Comparison::Equal, 0.0);
                }
                // A junction's activity is its throughput.
                let mut terms: Terms = incoming[n].iter().map(|&e| (flow[e], -1.0)).collect();
                terms.push((activity[n], 1.0));
                program.row(terms, Comparison::Equal, 0.0);
            }
        }
    }

    let mut overflow = Vec::new();
    for (e, edge) in model.edges.iter().enumerate() {
        if let Some(ratio) = edge.ratio {
            // flow = ratio · what the source node puts out of this item
            let mut terms = vec![(flow[e], 1.0)];
            match model.nodes[edge.from as usize].kind {
                NodeKind::Process | NodeKind::Balanced | NodeKind::Instance => {
                    if let Some(rate) = rate(edge.from, edge.item).filter(|&r| r > 0.0) {
                        terms.push((activity[edge.from as usize], -ratio * rate));
                    }
                }
                NodeKind::Junction => terms.extend(
                    edge_flows(&incoming[edge.from as usize], edge.item)
                        .into_iter()
                        .map(|(f, _)| (f, -ratio)),
                ),
            }
            program.row(terms, Comparison::Equal, 0.0);
        }
        if let Some(capacity) = edge.capacity {
            let slack = program.variable(f64::INFINITY);
            overflow.push((e as u32, slack));
            program.row(
                vec![(flow[e], 1.0), (slack, -1.0)],
                Comparison::AtMost,
                capacity,
            );
        }
    }

    let mut pins = Vec::new();
    let mut misses = Terms::new();
    for (n, node) in model.nodes.iter().enumerate() {
        if let Some(pin) = node.pin {
            let (above, below) = (
                program.variable(f64::INFINITY),
                program.variable(f64::INFINITY),
            );
            program.row(
                vec![(activity[n], 1.0), (above, -1.0), (below, 1.0)],
                Comparison::Equal,
                pin,
            );
            pins.push((n as u32, pin));
            misses.extend([(above, 1.0), (below, 1.0)]);
        }
    }

    for constraint in &model.constraints {
        let terms = constraint
            .terms
            .iter()
            .map(|term| (activity[term.node as usize], term.coefficient))
            .collect();
        program.row(terms, constraint.op, constraint.rhs);
    }

    let slacks = |terms: Terms| Tier {
        terms,
        hold: Hold::EachSlack,
    };
    let tiers = vec![
        slacks(misses),
        slacks(sum_of(&deficit)),
        // After deficits: an overloaded belt says more about the plan than a starved consumer.
        slacks(overflow.iter().map(|&(_, var)| (var, 1.0)).collect()),
        Tier {
            terms: model
                .nodes
                .iter()
                .enumerate()
                .filter(|(_, node)| node.cost != 0.0)
                .map(|(n, node)| (activity[n], node.cost))
                .collect(),
            hold: Hold::Total,
        },
        // Last, so that free choices go to using what is made rather than wasting it.
        slacks(sum_of(&surplus)),
    ];

    Formulation {
        program,
        tiers,
        activity,
        flow,
        surplus,
        deficit,
        overflow,
        pins,
    }
}

impl Formulation {
    /// Reads the solved variables back. A slack is reported only when it isn't noise next to the
    /// quantity it qualifies (the port's throughput, the edge's flow, the pin).
    pub fn read(&self, values: &[f64]) -> Solution {
        let value = |var: Var| clean(values[var], 0.0);
        let activity: Vec<f64> = self.activity.iter().map(|&var| value(var)).collect();
        let flow: Vec<f64> = self.flow.iter().map(|&var| value(var)).collect();
        let ports = |slacks: &[PortVar]| {
            slacks
                .iter()
                .map(|port| PortSlack {
                    node: port.node,
                    item: port.item,
                    per_second: clean(values[port.var], port.rate * activity[port.node as usize]),
                })
                .filter(|slack| slack.per_second > 0.0)
                .collect()
        };
        Solution {
            surplus: ports(&self.surplus),
            deficit: ports(&self.deficit),
            overflow: self
                .overflow
                .iter()
                .map(|&(edge, var)| EdgeSlack {
                    edge,
                    per_second: clean(values[var], flow[edge as usize]),
                })
                .filter(|slack| slack.per_second > 0.0)
                .collect(),
            pin_misses: self
                .pins
                .iter()
                .map(|&(node, pin)| NodeSlack {
                    node,
                    difference: clean(activity[node as usize] - pin, pin),
                })
                .filter(|miss| miss.difference != 0.0)
                .collect(),
            activity,
            flow,
            ..Solution::default()
        }
    }
}

fn sum_of(slacks: &[PortVar]) -> Terms {
    slacks.iter().map(|port| (port.var, 1.0)).collect()
}

/// Rates per item, sorted by item, with items listed on both sides netted out.
fn net_rates(node: &crate::ir::Node) -> Vec<(u32, f64)> {
    let mut rates: Vec<(u32, f64)> = node.rates.iter().map(|r| (r.item, r.per_second)).collect();
    rates.sort_by_key(|&(item, _)| item);
    let mut net: Vec<(u32, f64)> = Vec::with_capacity(rates.len());
    for (item, rate) in rates {
        match net.last_mut() {
            Some((last, sum)) if *last == item => *sum += rate,
            _ => net.push((item, rate)),
        }
    }
    net.retain(|&(_, rate)| rate != 0.0);
    net
}

/// Zero when `value` is noise next to `reference`.
fn clean(value: f64, reference: f64) -> f64 {
    if value.abs() < NOISE * (1.0 + reference.abs()) {
        0.0
    } else {
        value
    }
}
