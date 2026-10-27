//! Top-down: a blueprint's inside, solved for the boundary flows its instances got from the solution
//! around them.

use crate::ir::{Edge, InstanceSolution, Model, Node, NodeKind, Solution};

/// The model whose solution is the inside of every instance of `blueprint` together: the blueprint's
/// body with its ports pinned to the instances' summed boundary flows, its pins (its design) times their
/// summed scale, and its limits times their number. With one instance, the usual case, that is exactly
/// that instance. Without instances, it is the blueprint as designed, with its ports open.
pub fn expansion(model: &Model, solution: &Solution, blueprint: u32) -> Model {
    let body = &model.blueprints[blueprint as usize];
    let mut found = Found {
        target: blueprint,
        count: 0,
        scale: 0.0,
        ports: vec![0.0; body.ports.len()],
    };
    for instance in &solution.instances {
        if let Some(placed) = model.nodes[instance.node as usize].blueprint {
            found.visit(
                model,
                placed,
                solution.activity[instance.node as usize],
                instance,
            );
        }
    }

    let copies = found.count.max(1) as f64;
    let scale = if found.count == 0 { 1.0 } else { found.scale };
    let mut nodes: Vec<Node> = body
        .nodes
        .iter()
        .map(|node| Node {
            pin: node.pin.map(|pin| pin * scale),
            max: node.max.map(|max| max * copies),
            ..node.clone()
        })
        .collect();
    if found.count > 0 {
        for (&port, &flow) in body.ports.iter().zip(&found.ports) {
            nodes[port as usize].pin = Some(flow);
        }
    }
    Model {
        items: model.items,
        nodes,
        edges: body
            .edges
            .iter()
            .map(|edge| Edge {
                capacity: edge.capacity.map(|capacity| capacity * copies),
                ..edge.clone()
            })
            .collect(),
        constraints: body
            .constraints
            .iter()
            .map(|constraint| {
                let mut scaled = constraint.clone();
                scaled.rhs *= copies;
                scaled
            })
            .collect(),
        blueprints: model.blueprints.clone(),
    }
}

/// The instances of one blueprint, wherever they are placed.
struct Found {
    target: u32,
    count: usize,
    scale: f64,
    ports: Vec<f64>,
}

impl Found {
    fn visit(&mut self, model: &Model, blueprint: u32, scale: f64, instance: &InstanceSolution) {
        if blueprint == self.target {
            self.count += 1;
            self.scale += scale;
            for (sum, flow) in self.ports.iter_mut().zip(&instance.ports) {
                *sum += flow;
            }
        }
        let body = &model.blueprints[blueprint as usize];
        for inner in &instance.instances {
            let node = &body.nodes[inner.node as usize];
            if let (NodeKind::Instance, Some(placed)) = (node.kind, node.blueprint) {
                self.visit(model, placed, instance.activity[inner.node as usize], inner);
            }
        }
    }
}
