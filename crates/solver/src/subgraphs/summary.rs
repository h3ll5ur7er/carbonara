//! A blueprint's summary: the boundary flows it can produce, found with LPs over its body.
//!
//! The coordinates of a blueprint's boundary are the flow through each port, each *loose* port (an
//! internal output or input no edge can carry: a byproduct it dumps, an input it lacks) and, when it has
//! pins, its design scale `t`. With every other port balanced exactly and pins turned into ratios to `t`,
//! the coordinates a blueprint can produce form a cone. Its dimension is how many independent ways the
//! blueprint can run; its extreme rays are modes, and so are the ways between them that cost less than
//! combining them (`lower_vertices`). Directional LPs over the cone, cut by `Σ coordinates = 1`, find
//! all of them (`hull`). Node maxima and constraints that hold at zero limit how far
//! an instance can run: along a single mode that is the macro node's maximum; several modes with limits
//! are inlined, since the limits couple them.

use super::closure::Closure;
use super::flatten::flatten;
use super::{Context, hull, scale_pins};
use crate::SolveError;
use crate::formulation::formulate;
use crate::ir::{Comparison, Inlined, InstanceSolution, Model, Node, NodeKind, Unsolvable};
use crate::program::{Backend, BackendError, Hold, Program, Terms, Tier, Var};
use std::collections::HashSet;

/// A blueprint that can run in more independent ways than this is inlined.
pub const MAX_FREEDOM: usize = 4;
/// As is one with more modes than this.
const MAX_MODES: usize = 8;
/// Coordinates sum to 1 while modes are searched, so this is relative.
const TOLERANCE: f64 = 1e-7;

#[derive(Debug, Clone, PartialEq)]
pub struct Summary {
    /// Number of ports and of the blueprint's nodes.
    pub ports: usize,
    pub nodes: usize,
    /// The loose coordinates, in the closure's items.
    pub loose: Vec<Loose>,
    pub shape: Shape,
    /// Blueprints inlined inside this one, in the closure's numbering.
    pub inlined: Vec<Inlined>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Loose {
    pub item: u32,
    /// Made and dumped (surplus), or needed and missing (deficit).
    pub surplus: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Shape {
    /// Instances run a non-negative combination of the modes. None: the blueprint can't run at all.
    Modes {
        modes: Vec<Mode>,
        /// How far a single mode can run.
        max: Option<f64>,
    },
    Inline {
        freedom: u32,
    },
}

/// One way of running the blueprint, per unit: the instance's scale goes up by `scale`.
#[derive(Debug, Clone, PartialEq)]
pub struct Mode {
    /// Per loose coordinate.
    pub loose: Vec<f64>,
    pub scale: f64,
    pub cost: f64,
    /// The boundary flows (`ports`) and the inside.
    pub inside: InstanceSolution,
}

impl Summary {
    pub fn modes(&self) -> &[Mode] {
        match &self.shape {
            Shape::Modes { modes, .. } => modes,
            Shape::Inline { .. } => &[],
        }
    }
}

/// The LP of a blueprint's balanced operation, with its coordinates.
struct Cone {
    program: Program,
    coordinates: Vec<Var>,
    activity: Vec<Var>,
    flow: Vec<Var>,
    loose: Vec<Loose>,
}

/// The blueprint's formulation with every slack fixed at zero except those of loose ports.
fn cone(model: &Model, ports: &[u32], scale: Option<u32>) -> Cone {
    let formulation = formulate(model);
    let mut program = formulation.program;
    // (node, item, outgoing) of every port some edge can carry.
    let connected: HashSet<(u32, u32, bool)> = model
        .edges
        .iter()
        .zip(&formulation.flow)
        .filter(|&(_, &flow)| program.bounds[flow].1 > 0.0)
        .flat_map(|(edge, _)| [(edge.from, edge.item, true), (edge.to, edge.item, false)])
        .collect();
    let mut coordinates: Vec<Var> = ports
        .iter()
        .map(|&port| formulation.activity[port as usize])
        .collect();
    let mut loose = Vec::new();
    for (slacks, surplus) in [(&formulation.surplus, true), (&formulation.deficit, false)] {
        for port in slacks {
            if ports.contains(&port.node) || connected.contains(&(port.node, port.item, surplus)) {
                program.bounds[port.var] = (0.0, 0.0);
            } else {
                loose.push(Loose {
                    item: port.item,
                    surplus,
                });
                coordinates.push(port.var);
            }
        }
    }
    if let Some(scale) = scale {
        coordinates.push(formulation.activity[scale as usize]);
    }
    Cone {
        program,
        coordinates,
        activity: formulation.activity,
        flow: formulation.flow,
        loose,
    }
}

pub fn summarise(
    closure: &Closure,
    context: &mut impl Context,
    backend: &impl Backend,
) -> Result<Summary, SolveError> {
    let model = &closure.model;
    let mut body = flatten(model, model.graph(), context)?;
    let scale = body.model.nodes.len() as u32;
    body.model.nodes.push(Node {
        kind: NodeKind::Process,
        rates: vec![],
        max: None,
        pin: None,
        cost: 0.0,
        blueprint: None,
    });
    let pinned = scale_pins(&mut body.model, 0..model.nodes.len(), scale);
    let scale = pinned.then_some(scale);
    // Belt limits inside are checked when the blueprint is expanded, not by the graph around it.
    for edge in &mut body.model.edges {
        edge.capacity = None;
    }
    // Homogeneous constraints shape the cone; those that hold at zero limit it like maxima. Others
    // (which zero activity breaks) have no summary.
    let mut limits = Vec::new();
    let mut summarisable = true;
    body.model.constraints.retain(|constraint| {
        if constraint.rhs == 0.0 {
            return true;
        }
        match (constraint.op, constraint.rhs > 0.0) {
            (Comparison::AtMost, true) | (Comparison::AtLeast, false) => {
                limits.push(constraint.clone())
            }
            _ => summarisable = false,
        }
        false
    });
    let limited = !limits.is_empty() || body.model.nodes.iter().any(|node| node.max.is_some());
    let mut unlimited = body.model.clone();
    for node in &mut unlimited.nodes {
        node.max = None;
    }

    let free = cone(&unlimited, &closure.ports, scale);
    let mut cut = free.program.clone();
    cut.row(
        free.coordinates.iter().map(|&var| (var, 1.0)).collect(),
        Comparison::Equal,
        1.0,
    );
    let coordinates =
        |values: &[f64]| -> Vec<f64> { free.coordinates.iter().map(|&var| values[var]).collect() };
    let maximise = |direction: &[f64]| -> Result<Vec<f64>, SolveError> {
        let objective: Terms = free
            .coordinates
            .iter()
            .zip(direction)
            .filter(|&(_, &weight)| weight != 0.0)
            .map(|(&var, &weight)| (var, -weight))
            .collect();
        Ok(backend.minimise(&cut, &objective)?)
    };

    let summary = |shape: Shape| Summary {
        ports: closure.ports.len(),
        nodes: model.nodes.len(),
        // Private items of placements inside stand for real ones.
        loose: free
            .loose
            .iter()
            .map(|loose| Loose {
                item: body.real_item(loose.item),
                ..*loose
            })
            .collect(),
        shape,
        inlined: body.inlined.clone(),
    };
    let first = match backend.minimise(&cut, &[]) {
        Ok(values) => coordinates(&values),
        // Nothing can cross the boundary.
        Err(BackendError::Unsolvable(Unsolvable::Infeasible)) => {
            return Ok(summary(Shape::Modes {
                modes: vec![],
                max: None,
            }));
        }
        Err(error) => return Err(error.into()),
    };

    // The cone's dimension: grow a set of independent points until no direction orthogonal to their
    // span leaves it.
    let mut points = vec![first];
    loop {
        let basis = hull::orthonormal(points.iter().cloned());
        let mut found = None;
        'search: for axis in 0..free.coordinates.len() {
            let mut direction: Vec<f64> = (0..free.coordinates.len())
                .map(|i| if i == axis { 1.0 } else { 0.0 })
                .collect();
            for along in &basis {
                let length = hull::dot(along, &direction);
                for (d, a) in direction.iter_mut().zip(along) {
                    *d -= length * a;
                }
            }
            if hull::dot(&direction, &direction) < 1e-12 {
                continue;
            }
            for sign in [1.0, -1.0] {
                let signed: Vec<f64> = direction.iter().map(|d| sign * d).collect();
                let point = coordinates(&maximise(&signed)?);
                if hull::dot(&signed, &point) > TOLERANCE {
                    found = Some(point);
                    break 'search;
                }
            }
        }
        match found {
            Some(point) => points.push(point),
            None => break,
        }
    }
    let freedom = points.len();
    let inline = || {
        Ok(summary(Shape::Inline {
            freedom: freedom as u32,
        }))
    };
    if !summarisable || freedom > MAX_FREEDOM {
        return inline();
    }
    let vertices = if freedom == 1 {
        points
    } else {
        match hull::vertices(points, MAX_MODES, |direction| {
            maximise(direction).map(|values| coordinates(&values))
        })? {
            Some(vertices) => vertices,
            None => return inline(),
        }
    };

    let ports = closure.ports.len();
    let loose = free.loose.len();
    let costs: Terms = unlimited
        .nodes
        .iter()
        .zip(&free.activity)
        .filter(|(node, _)| node.cost != 0.0)
        .map(|(node, &var)| (var, node.cost))
        .collect();
    // A vertex's mode, and what the vertex costs (the mode is per unit).
    let mode = |vertex: &[f64]| -> Result<(Mode, f64), SolveError> {
        // Per unit of design scale when the mode has one, else per unit of its largest flow.
        let largest = vertex.iter().copied().fold(0.0, f64::max);
        let unit = match scale {
            Some(_) if vertex[ports + loose] > TOLERANCE * largest => vertex[ports + loose],
            _ => largest,
        };
        let point: Vec<f64> = vertex
            .iter()
            .map(|&v| {
                if v > TOLERANCE * largest {
                    v / unit
                } else {
                    0.0
                }
            })
            .collect();
        let mode = witness(&free, &body, &costs, &point, ports, loose, backend)?;
        let cost = mode.cost * unit;
        Ok((mode, cost))
    };
    let mut lifted = Vec::with_capacity(vertices.len());
    let mut modes = Vec::with_capacity(vertices.len());
    for vertex in vertices {
        let (found, cost) = mode(&vertex)?;
        lifted.push(vertex.into_iter().chain([cost]).collect::<Vec<f64>>());
        modes.push(found);
    }
    if freedom > 1 && !costs.is_empty() {
        // Costs of about 1 at most, like the coordinates, for the hull's tolerance.
        let norm = lifted
            .iter()
            .map(|vertex| vertex[vertex.len() - 1].abs())
            .fold(1.0, f64::max);
        for vertex in &mut lifted {
            if let Some(cost) = vertex.last_mut() {
                *cost /= norm;
            }
        }
        let lowest = |direction: &[f64]| -> Result<Vec<f64>, SolveError> {
            let (along, weight) = direction.split_at(free.coordinates.len());
            let objective: Terms = free
                .coordinates
                .iter()
                .zip(along)
                .map(|(&var, &w)| (var, -w))
                .chain(costs.iter().map(|&(var, cost)| (var, -weight[0] * cost)))
                .collect();
            let values = backend.minimise(&cut, &objective)?;
            let cost: f64 = costs.iter().map(|&(var, cost)| cost * values[var]).sum();
            Ok(coordinates(&values)
                .into_iter()
                .chain([cost / norm])
                .collect())
        };
        let Some(cheapest) = lower_vertices(&lifted, lowest)? else {
            return inline();
        };
        modes = cheapest
            .iter()
            .map(
                |vertex| match lifted.iter().position(|known| known == vertex) {
                    Some(at) => Ok(modes[at].clone()),
                    None => Ok(mode(&vertex[..vertex.len() - 1])?.0),
                },
            )
            .collect::<Result<_, SolveError>>()?;
    }

    let mut max = None;
    if limited {
        let mut bounded = body.model.clone();
        bounded.constraints.extend(limits);
        let bounded = cone(&bounded, &closure.ports, scale);
        for mode in &modes {
            let point: Vec<f64> = mode
                .inside
                .ports
                .iter()
                .chain(&mode.loose)
                .copied()
                .chain(scale.map(|_| mode.scale))
                .collect();
            let reach = furthest(&bounded, &point, backend)?;
            if modes.len() > 1 && reach.is_some() {
                return inline();
            }
            max = reach;
        }
    }
    Ok(summary(Shape::Modes { modes, max }))
}

/// The cheapest inside that produces `point`, and the mode it makes.
fn witness(
    free: &Cone,
    body: &super::Flat,
    costs: &Terms,
    point: &[f64],
    ports: usize,
    loose: usize,
    backend: &impl Backend,
) -> Result<Mode, SolveError> {
    // The mode's cost decides ties with other routes in the graph around, which the LP settles to
    // 1e-8: the coordinates are held exactly, unless microlp finds that infeasible by a hair.
    let mut cheapest = None;
    for slack in [0.0, 1e-9, 1e-7] {
        let mut program = free.program.clone();
        for (&var, &value) in free.coordinates.iter().zip(point) {
            let margin = slack * value + slack * 1e-3;
            program.bounds[var] = ((value - margin).max(0.0), value + margin);
        }
        match backend.minimise(&program, costs) {
            Ok(values) => {
                cheapest = Some((program, values));
                break;
            }
            Err(BackendError::Unsolvable(Unsolvable::Infeasible)) => continue,
            Err(error) => return Err(error.into()),
        }
    }
    let Some((mut program, values)) = cheapest else {
        return Err(SolveError::Unsolvable(Unsolvable::Infeasible));
    };
    let cost: f64 = costs.iter().map(|&(var, cost)| cost * values[var]).sum();
    // Then no more activity and flow than needed (no idle loops), at that cost.
    let busy: Terms = free
        .activity
        .iter()
        .chain(&free.flow)
        .map(|&var| (var, 1.0))
        .collect();
    let tiers = [
        Tier {
            terms: costs.clone(),
            hold: Hold::Total,
        },
        Tier {
            terms: busy,
            hold: Hold::Total,
        },
    ];
    let values = backend.minimise_in_order(&mut program, &tiers)?;
    let activity: Vec<f64> = free.activity.iter().map(|&var| values[var]).collect();
    let flow: Vec<f64> = free.flow.iter().map(|&var| values[var]).collect();
    let (inside, _, instances) = body.unflatten(&activity, &flow);
    Ok(Mode {
        loose: point[ports..ports + loose].to_vec(),
        scale: point.get(ports + loose).copied().unwrap_or(0.0),
        cost,
        inside: InstanceSolution {
            node: 0,
            ports: point[..ports].to_vec(),
            activity: inside,
            instances,
        },
    })
}

/// The vertices of the lower side of the cone's points lifted by their cheapest cost (the last
/// coordinate), from the cone's vertices lifted; `None` when there are too many.
///
/// The cheapest inside's cost is convex over the cone, not linear: between two of its vertices, running
/// some other way can cost less than combining them (burning what enters and making what leaves are two
/// vertices, passing it through is cheaper than both; CARB-133). Those ways are kinks of the lifted
/// cone's lower side, and modes too. `lowest(w)` maximises `w` over the lifted cone for directions that
/// weigh cost negatively; nothing lies above the lifted vertices, so the others need no search.
fn lower_vertices<E>(
    lifted: &[Vec<f64>],
    mut lowest: impl FnMut(&[f64]) -> Result<Vec<f64>, E>,
) -> Result<Option<Vec<Vec<f64>>>, E> {
    // Downwards, away from the lifted vertices' span: when nothing lies below it, the cost is linear.
    let cost = lifted[0].len() - 1;
    let mut down: Vec<f64> = (0..=cost)
        .map(|i| if i == cost { -1.0 } else { 0.0 })
        .collect();
    for axis in hull::orthonormal(lifted.iter().cloned()) {
        let along = hull::dot(&axis, &down);
        for (d, a) in down.iter_mut().zip(&axis) {
            *d -= along * a;
        }
    }
    let mut start = lifted.to_vec();
    let length = hull::dot(&down, &down).sqrt();
    if length > 1e-9 {
        let down: Vec<f64> = down.iter().map(|d| d / length).collect();
        let below = lowest(&down)?;
        if hull::dot(&down, &below) <= TOLERANCE {
            return Ok(Some(start));
        }
        start.push(below);
    }
    let first = lifted[0].clone();
    hull::vertices(start, MAX_MODES, |direction| {
        if direction[cost] < 0.0 {
            lowest(direction)
        } else {
            Ok(first.clone())
        }
    })
}

/// How far along `point` the limited blueprint can run, or `None` when nothing limits it.
fn furthest(
    bounded: &Cone,
    point: &[f64],
    backend: &impl Backend,
) -> Result<Option<f64>, SolveError> {
    let mut program = bounded.program.clone();
    let reach = program.variable(f64::INFINITY);
    for (&var, &value) in bounded.coordinates.iter().zip(point) {
        program.row(vec![(var, 1.0), (reach, -value)], Comparison::Equal, 0.0);
    }
    match backend.minimise(&program, &[(reach, -1.0)]) {
        Ok(values) => Ok(Some(values[reach])),
        Err(BackendError::Unsolvable(Unsolvable::Unbounded)) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::convert::Infallible;

    /// Maximises over the lifted points given, as an LP over the cone would.
    fn over(points: Vec<Vec<f64>>) -> impl FnMut(&[f64]) -> Result<Vec<f64>, Infallible> {
        move |direction| {
            Ok(points
                .iter()
                .max_by(|a, b| hull::dot(a, direction).total_cmp(&hull::dot(b, direction)))
                .cloned()
                .unwrap_or_default())
        }
    }

    fn found(lifted: &[Vec<f64>], points: Vec<Vec<f64>>) -> Option<Vec<Vec<f64>>> {
        match lower_vertices(lifted, over(points)) {
            Ok(mut found) => {
                if let Some(found) = &mut found {
                    found.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                }
                found
            }
            Err(never) => match never {},
        }
    }

    #[test]
    fn a_way_between_two_vertices_that_costs_less_than_both_is_a_mode() {
        // (in, out, cost): burning what enters costs 1, making what leaves 2, passing through nothing.
        let (burn, make, through) = (
            vec![1.0, 0.0, 1.0],
            vec![0.0, 1.0, 2.0],
            vec![0.5, 0.5, 0.0],
        );
        let lifted = vec![burn.clone(), make.clone()];
        let points = vec![burn.clone(), make.clone(), through.clone()];
        assert_eq!(found(&lifted, points), Some(vec![make, through, burn]));
    }

    #[test]
    fn a_cost_linear_along_the_cone_adds_no_mode() {
        let (burn, make) = (vec![1.0, 0.0, 1.0], vec![0.0, 1.0, 2.0]);
        let lifted = vec![burn.clone(), make.clone()];
        // Halfway costs what combining the two does.
        let points = vec![burn.clone(), make.clone(), vec![0.5, 0.5, 1.5]];
        assert_eq!(found(&lifted, points), Some(vec![make, burn]));
    }
}
