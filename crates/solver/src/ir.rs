//! The solver IR: the problem the compiler engine hands to the solver, and the solution it gets back.
//! Defined here once; `cargo test` writes the TypeScript twin to `src/contracts/ir/`.
//! Items, nodes and edges are indices into flat arrays. Every rate is in items per second.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A solvable factory: a document's graph, with the blueprints its instances place.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Model {
    /// Number of distinct items; item indices are `0..items`, in the blueprints too.
    pub items: u32,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    /// Extra linear constraints over node activities, from pack plugins.
    #[serde(default)]
    pub constraints: Vec<Constraint>,
    /// Subgraphs that instance nodes place, here or inside other blueprints, by index.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub blueprints: Vec<Blueprint>,
}

/// A reusable subgraph (docs/Architecture/Subgraphs.md). Its ports are process nodes with one rate of
/// +1 (an `in` port: the item enters here) or −1 (an `out` port: the item leaves here). Item and
/// blueprint indices are the model's. Pins inside a blueprint set its design: an instance at scale `t`
/// runs the blueprint with every pin multiplied by `t`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Blueprint {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    #[serde(default)]
    pub constraints: Vec<Constraint>,
    /// The port nodes, by port index.
    pub ports: Vec<u32>,
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
    /// Instance nodes: the blueprint they place.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub blueprint: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum NodeKind {
    /// Produces and consumes items in fixed ratios.
    Process,
    /// Passes every item through: what flows in flows out.
    Junction,
    /// A process whose ports balance exactly: an item an edge can carry is all carried, never left as
    /// surplus or deficit. The solver makes the insides of instances balanced (subgraphs).
    Balanced,
    /// A placed blueprint, reached through its ports. Its activity is its scale: how many times it runs
    /// the blueprint as designed (0 for a blueprint without pins, which has no design scale).
    Instance,
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
    /// When `from` is an instance: the `out` port of its blueprint the edge leaves through.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub from_port: Option<u32>,
    /// When `to` is an instance: the `in` port of its blueprint the edge enters through.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub to_port: Option<u32>,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Comparison {
    AtMost,
    Equal,
    AtLeast,
}

/// The solver's answer. Slacks explain every place where the model couldn't be met.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
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
    /// What each instance node does, in node order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub instances: Vec<InstanceSolution>,
    /// Blueprints solved inline (flattened into the LP around them) because they can run in too many
    /// independent ways to be summarised.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub inlined: Vec<Inlined>,
}

/// What an instance does: its boundary flows and, from its blueprint's summary, its inside. Expanding the
/// blueprint solves the inside exactly for given boundary flows.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct InstanceSolution {
    /// The instance node, in the graph that places it.
    pub node: u32,
    /// Items per second through each port of the blueprint, by port index.
    pub ports: Vec<f64>,
    /// Activity of each node of the blueprint (instances inside it: their scale).
    pub activity: Vec<f64>,
    /// The instances inside the blueprint.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub instances: Vec<InstanceSolution>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Inlined {
    pub blueprint: u32,
    /// Independent ways the blueprint can run: the dimension of its boundary flows.
    pub freedom: u32,
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

/// Changes to a list since the last solve: its new length, and the elements that differ, by index.
/// Elements at or past `length` are dropped; every index the list grows by is among `set`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Changes<T> {
    pub length: u32,
    pub set: Vec<(u32, T)>,
}

/// A model as changes to the model of the last solve (`Solver::solve_changes`): what crosses into
/// WebAssembly, so an edit sends what it changed rather than the whole document.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModelChanges {
    pub items: u32,
    pub nodes: Changes<Node>,
    pub edges: Changes<Edge>,
    pub constraints: Changes<Constraint>,
    pub blueprints: Changes<Blueprint>,
}

/// A solution as changes to the solution of the last solve: what comes back out of WebAssembly.
/// Slack lists are left out while they're the same.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SolutionChanges {
    pub activity: Changes<f64>,
    pub flow: Changes<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub surplus: Option<Vec<PortSlack>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub deficit: Option<Vec<PortSlack>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub overflow: Option<Vec<EdgeSlack>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub pin_misses: Option<Vec<NodeSlack>>,
    pub instances: Changes<InstanceSolution>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub inlined: Option<Vec<Inlined>>,
}
