//! A graph of the IR seen on its own: the model's root graph or a blueprint's body. Both are checked,
//! flattened and solved the same way.

use crate::ir::{Blueprint, Constraint, Edge, Model, Node};

#[derive(Debug, Clone, Copy)]
pub struct Graph<'a> {
    pub nodes: &'a [Node],
    pub edges: &'a [Edge],
    pub constraints: &'a [Constraint],
}

impl Model {
    pub fn graph(&self) -> Graph<'_> {
        Graph {
            nodes: &self.nodes,
            edges: &self.edges,
            constraints: &self.constraints,
        }
    }
}

impl Blueprint {
    pub fn graph(&self) -> Graph<'_> {
        Graph {
            nodes: &self.nodes,
            edges: &self.edges,
            constraints: &self.constraints,
        }
    }

    /// The item of a port and whether it is an `in` port (+1: the item enters the blueprint there).
    /// `validate` makes sure every port node has exactly one rate of ±1.
    pub fn port(&self, port: u32) -> Option<(u32, bool)> {
        let node = self.nodes.get(*self.ports.get(port as usize)? as usize)?;
        let rate = node.rates.first()?;
        Some((rate.item, rate.per_second > 0.0))
    }
}
