//! The solver IR: the problem the compiler engine hands to the solver, and the solution it gets back.
//! Defined here once; `cargo test` writes the TypeScript twin to `src/contracts/ir/`.
//! Items, nodes and edges are indices into flat arrays. Every rate is in items per second.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A solvable factory: one component of a document, or a blueprint.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Model {
    /// Number of distinct items; item indices are `0..items`.
    pub items: u32,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    /// Extra linear constraints over node activities, from pack plugins.
    #[serde(default)]
    pub constraints: Vec<Constraint>,
}

/// Something with an activity level `x ≥ 0`: machines of a recipe (x = machine count), a source or sink
/// (x = items per second), or a junction, which only passes flows through.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Node {
    pub kind: NodeKind,
    /// Items per second per unit of activity: positive for outputs, negative for inputs.
    #[serde(default)]
    pub rates: Vec<Rate>,
    /// Upper bound of the activity (a source's supply, a fixed number of machines' capacity).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub max: Option<f64>,
    /// Activity the user asked for. Met if at all possible; misses are reported.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub pin: Option<f64>,
    /// Cost per unit of activity, minimised after pins and flows are satisfied.
    #[serde(default)]
    pub cost: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum NodeKind {
    /// Produces and consumes items in fixed ratios.
    Process,
    /// Passes every item through: what flows in flows out.
    Junction,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Rate {
    pub item: u32,
    pub per_second: f64,
}

/// A flow of one item from one node to another.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Edge {
    pub from: u32,
    pub to: u32,
    pub item: u32,
    /// Capacity of the belt or pipe. Exceeding it is allowed but reported as overflow.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub capacity: Option<f64>,
    /// Fixed share (0..=1) of the source node's output of this item.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub ratio: Option<f64>,
}

/// `Σ coefficient · activity(node)  op  rhs`
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Constraint {
    pub terms: Vec<Term>,
    pub op: Comparison,
    pub rhs: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Term {
    pub node: u32,
    pub coefficient: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Comparison {
    AtMost,
    Equal,
    AtLeast,
}

/// The solver's answer. Slacks explain every place where the model couldn't be met.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Solution {
    /// Activity per node, by node index.
    pub activity: Vec<f64>,
    /// Flow per edge, by edge index.
    pub flow: Vec<f64>,
    /// Output a node makes but nothing takes.
    pub surplus: Vec<PortSlack>,
    /// Input a node needs but doesn't get.
    pub deficit: Vec<PortSlack>,
    /// Flow beyond an edge's capacity.
    pub overflow: Vec<EdgeSlack>,
    /// How far a node's activity is from its pin.
    pub pin_misses: Vec<NodeSlack>,
}

/// Why a valid model has no solution. Only hard constraints from plugins (or negative costs) cause these;
/// everything else the user can ask for is soft and shows up as slack instead.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Unsolvable {
    /// The plugin constraints contradict each other or the node limits.
    Infeasible,
    /// A negative cost lets the objective fall without limit.
    Unbounded,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PortSlack {
    pub node: u32,
    pub item: u32,
    pub per_second: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EdgeSlack {
    pub edge: u32,
    pub per_second: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NodeSlack {
    pub node: u32,
    /// Activity minus pin: negative when the node runs below its pin.
    pub difference: f64,
}
