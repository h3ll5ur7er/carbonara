//! Vertices of a polytope that is only known through an oracle: `maximise(w)` returns a point of the
//! polytope that maximises `w · p`. Starting from affinely independent points that span the polytope's
//! affine hull, the hull of the known points grows until no facet can be pushed outwards: then the known
//! points' hull is the polytope. Meant for the few dimensions (≤ 4: up to 3 of a cut cone, and its cost)
//! and vertices of subgraph modes; facets are found by brute force over subsets of the known points.

/// Above this, a point lies beyond a facet. Points are normalised to sum to 1, so this is relative.
const TOLERANCE: f64 = 1e-7;

/// The polytope's vertices, or `None` when it has more than `limit`.
pub fn vertices<E>(
    start: Vec<Vec<f64>>,
    limit: usize,
    mut maximise: impl FnMut(&[f64]) -> Result<Vec<f64>, E>,
) -> Result<Option<Vec<Vec<f64>>>, E> {
    let Some(origin) = start.first().cloned() else {
        return Ok(Some(start));
    };
    let basis = orthonormal(start[1..].iter().map(|point| difference(point, &origin)));
    let project = |point: &[f64]| -> Vec<f64> {
        let offset = difference(point, &origin);
        basis.iter().map(|axis| dot(axis, &offset)).collect()
    };
    let mut points = start;
    'grow: loop {
        let projected: Vec<Vec<f64>> = points.iter().map(|point| project(point)).collect();
        for (normal, offset) in facets(&projected) {
            let direction = lift(&basis, &normal);
            let found = maximise(&direction)?;
            if dot(&normal, &project(&found)) > offset + TOLERANCE {
                points.push(found);
                // Some known points may be no vertex; give up only well past the limit.
                if points.len() > 2 * limit + 2 {
                    return Ok(None);
                }
                continue 'grow;
            }
        }
        // No facet moves: drop points that are no vertex (an oracle may return any optimal point).
        let all = facets(&projected);
        let dimension = basis.len();
        let kept: Vec<Vec<f64>> = points
            .iter()
            .zip(&projected)
            .filter(|(_, at)| {
                let normals: Vec<Vec<f64>> = all
                    .iter()
                    .filter(|(normal, offset)| (dot(normal, at) - offset).abs() <= TOLERANCE)
                    .map(|(normal, _)| normal.clone())
                    .collect();
                orthonormal(normals.into_iter()).len() == dimension
            })
            .map(|(point, _)| point.clone())
            .collect();
        return Ok((kept.len() <= limit).then_some(kept));
    }
}

/// Supporting hyperplanes `normal · y ≤ offset` through `k` of the points, in their `k` dimensions.
fn facets(points: &[Vec<f64>]) -> Vec<(Vec<f64>, f64)> {
    let Some(dimension) = points.first().map(Vec::len) else {
        return vec![];
    };
    if dimension == 0 {
        return vec![];
    }
    let mut found = Vec::new();
    for subset in subsets(points.len(), dimension) {
        let base = &points[subset[0]];
        let rows: Vec<Vec<f64>> = subset[1..]
            .iter()
            .map(|&i| difference(&points[i], base))
            .collect();
        let Some(normal) = null_vector(rows, dimension) else {
            continue;
        };
        let offset = dot(&normal, base);
        let sides = points.iter().map(|point| dot(&normal, point) - offset);
        let (low, high) = sides.fold((0.0f64, 0.0f64), |(low, high), side| {
            (low.min(side), high.max(side))
        });
        if high <= TOLERANCE {
            found.push((normal, offset));
        } else if low >= -TOLERANCE {
            found.push((normal.iter().map(|v| -v).collect(), -offset));
        }
    }
    found
}

/// All `size`-element subsets of `0..count`, in lexicographic order.
fn subsets(count: usize, size: usize) -> Vec<Vec<usize>> {
    let mut all = Vec::new();
    let mut current: Vec<usize> = (0..size).collect();
    if size > count {
        return all;
    }
    loop {
        all.push(current.clone());
        let Some(position) = (0..size).rev().find(|&i| current[i] < count - size + i) else {
            return all;
        };
        current[position] += 1;
        for i in position + 1..size {
            current[i] = current[i - 1] + 1;
        }
    }
}

/// A unit vector orthogonal to every row, when the rows leave exactly one direction free.
fn null_vector(mut rows: Vec<Vec<f64>>, dimension: usize) -> Option<Vec<f64>> {
    // Gaussian elimination with partial pivoting; `pivots[r]` is row r's pivot column.
    let mut pivots = Vec::new();
    let mut row = 0;
    for column in 0..dimension {
        if row == rows.len() {
            break;
        }
        let best = (row..rows.len())
            .max_by(|&a, &b| rows[a][column].abs().total_cmp(&rows[b][column].abs()))?;
        if rows[best][column].abs() <= 1e-12 {
            continue;
        }
        rows.swap(row, best);
        let pivot = rows[row].clone();
        for (other, values) in rows.iter_mut().enumerate() {
            if other != row {
                let factor = values[column] / pivot[column];
                for (value, p) in values.iter_mut().zip(&pivot) {
                    *value -= factor * p;
                }
            }
        }
        pivots.push(column);
        row += 1;
    }
    if pivots.len() + 1 != dimension {
        return None;
    }
    let free = (0..dimension).find(|c| !pivots.contains(c))?;
    let mut vector = vec![0.0; dimension];
    vector[free] = 1.0;
    for (r, &column) in pivots.iter().enumerate() {
        vector[column] = -rows[r][free] / rows[r][column];
    }
    let length = dot(&vector, &vector).sqrt();
    Some(vector.iter().map(|v| v / length).collect())
}

/// An orthonormal basis of the vectors' span (Gram–Schmidt, dropping dependent vectors).
pub fn orthonormal(vectors: impl Iterator<Item = Vec<f64>>) -> Vec<Vec<f64>> {
    let mut basis: Vec<Vec<f64>> = Vec::new();
    for mut vector in vectors {
        for axis in &basis {
            let along = dot(axis, &vector);
            for (v, a) in vector.iter_mut().zip(axis) {
                *v -= along * a;
            }
        }
        let length = dot(&vector, &vector).sqrt();
        if length > 1e-9 {
            basis.push(vector.iter().map(|v| v / length).collect());
        }
    }
    basis
}

fn lift(basis: &[Vec<f64>], coordinates: &[f64]) -> Vec<f64> {
    let mut lifted = vec![0.0; basis.first().map_or(0, Vec::len)];
    for (axis, &c) in basis.iter().zip(coordinates) {
        for (l, a) in lifted.iter_mut().zip(axis) {
            *l += c * a;
        }
    }
    lifted
}

pub fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

fn difference(a: &[f64], b: &[f64]) -> Vec<f64> {
    a.iter().zip(b).map(|(x, y)| x - y).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::convert::Infallible;

    /// An oracle over a polytope given by its vertices (and other points inside it).
    fn oracle(points: Vec<Vec<f64>>) -> impl FnMut(&[f64]) -> Result<Vec<f64>, Infallible> {
        move |direction| {
            let best = points
                .iter()
                .max_by(|a, b| dot(a, direction).total_cmp(&dot(b, direction)))
                .cloned()
                .unwrap_or_default();
            Ok(best)
        }
    }

    fn sorted(mut points: Vec<Vec<f64>>) -> Vec<Vec<f64>> {
        points.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        points
    }

    fn found(start: Vec<Vec<f64>>, polytope: Vec<Vec<f64>>, limit: usize) -> Option<Vec<Vec<f64>>> {
        match vertices(start, limit, oracle(polytope)) {
            Ok(found) => found.map(sorted),
            Err(never) => match never {},
        }
    }

    #[test]
    fn a_segment_has_its_two_ends() {
        // On the plane x + y = 1: the segment from (0.2, 0.8) to (0.9, 0.1), found from a middle point.
        let segment = vec![vec![0.2, 0.8], vec![0.9, 0.1], vec![0.5, 0.5]];
        let start = vec![vec![0.5, 0.5], vec![0.6, 0.4]];
        assert_eq!(
            found(start, segment, 8),
            Some(vec![vec![0.2, 0.8], vec![0.9, 0.1]])
        );
    }

    #[test]
    fn a_triangle_in_three_dimensions_is_found_from_inside() {
        let corners = vec![
            vec![1.0, 0.0, 0.0],
            vec![0.0, 1.0, 0.0],
            vec![0.0, 0.0, 1.0],
        ];
        let mut polytope = corners.clone();
        polytope.push(vec![0.4, 0.3, 0.3]);
        let start = vec![
            vec![0.4, 0.3, 0.3],
            vec![0.3, 0.4, 0.3],
            vec![0.3, 0.3, 0.4],
        ];
        assert_eq!(found(start, polytope, 8), Some(sorted(corners)));
    }

    #[test]
    fn a_square_drops_points_on_its_edges() {
        // A square in the plane z = 1 - x - y + ... : use 3 coordinates summing to 1 is not needed here.
        let square = vec![
            vec![0.0, 0.0, 1.0],
            vec![1.0, 0.0, 1.0],
            vec![1.0, 1.0, 1.0],
            vec![0.0, 1.0, 1.0],
        ];
        // The oracle returns an edge's middle point when a direction ties along that edge.
        let mut with_middles = vec![vec![0.5, 0.0, 1.0], vec![1.0, 0.5, 1.0]];
        with_middles.extend(square.clone());
        let start = vec![
            vec![0.5, 0.0, 1.0],
            vec![1.0, 0.5, 1.0],
            vec![0.0, 1.0, 1.0],
        ];
        assert_eq!(found(start, with_middles, 8), Some(sorted(square)));
    }

    #[test]
    fn a_tetrahedron_has_four_vertices_in_three_dimensions_of_four() {
        let corners: Vec<Vec<f64>> = (0..4)
            .map(|i| (0..4).map(|j| if i == j { 1.0 } else { 0.0 }).collect())
            .collect();
        let start = vec![
            vec![0.25, 0.25, 0.25, 0.25],
            vec![0.4, 0.2, 0.2, 0.2],
            vec![0.2, 0.4, 0.2, 0.2],
            vec![0.2, 0.2, 0.4, 0.2],
        ];
        let mut polytope = corners.clone();
        polytope.extend(start.clone());
        assert_eq!(found(start, polytope, 8), Some(sorted(corners)));
    }

    #[test]
    fn too_many_vertices_give_up() {
        // A hexagon has more than 4 vertices.
        let hexagon: Vec<Vec<f64>> = (0..6)
            .map(|i| {
                let angle = f64::from(i) * std::f64::consts::PI / 3.0;
                vec![angle.cos(), angle.sin(), 1.0]
            })
            .collect();
        let start = hexagon[..3].to_vec();
        assert_eq!(found(start, hexagon, 4), None);
    }
}
