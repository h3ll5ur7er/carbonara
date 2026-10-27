//! Times solving a model natively, warm (one LP for all tiers) against cold (one LP per tier).
//! `cargo run --release --example profile -- model.json [rounds] [edited.json]`, with a model the compiler
//! built (as JSON). Also times validating it and re-solving it with every component cached; with a second
//! model (the first after an edit), it times edits back and forth as the WebAssembly `Solver` gets them.
use carbonara_solver::ir::{Model, ModelChanges};
use carbonara_solver::program::{Backend, BackendError, MicroLp, Program, Var};
use carbonara_solver::solve_whole;
use std::time::Instant;

/// microlp with a fresh LP per tier.
struct Cold;

impl Backend for Cold {
    fn minimise(
        &self,
        program: &Program,
        objective: &[(Var, f64)],
    ) -> Result<Vec<f64>, BackendError> {
        MicroLp.minimise(program, objective)
    }
}

fn time(backend: &impl Backend, model: &Model) -> f64 {
    let start = Instant::now();
    if let Err(error) = solve_whole(model, backend) {
        eprintln!("unsolved: {error}");
    }
    start.elapsed().as_secs_f64() * 1e3
}

fn read(path: &str) -> Option<Model> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn main() {
    let Some(model) = std::env::args().nth(1).as_deref().and_then(read) else {
        eprintln!("usage: profile <model.json> [rounds] [edited.json]");
        return;
    };
    let rounds: usize = std::env::args()
        .nth(2)
        .and_then(|n| n.parse().ok())
        .unwrap_or(3);
    for _ in 0..rounds {
        println!(
            "warm {:.1} ms, cold {:.1} ms",
            time(&MicroLp, &model),
            time(&Cold, &model)
        );
    }
    let start = Instant::now();
    let _ = carbonara_solver::validate(&model);
    println!("validate: {:.1} ms", start.elapsed().as_secs_f64() * 1e3);
    let mut solver = carbonara_solver::Solver::new(MicroLp);
    if solver.solve(&model).is_ok() {
        let start = Instant::now();
        let _ = solver.solve(&model);
        println!(
            "re-solve, all cached: {:.1} ms",
            start.elapsed().as_secs_f64() * 1e3
        );
    }
    let Some(edited) = std::env::args().nth(3).as_deref().and_then(read) else {
        return;
    };
    let mut solver = carbonara_solver::Solver::new(MicroLp);
    let _ = solver.solve_changes(ModelChanges::between(&Model::default(), &model));
    let (mut edits, mut unchanged) = (Vec::new(), Vec::new());
    for round in 0..rounds.max(1) * 2 {
        let (from, to) = if round % 2 == 0 {
            (&model, &edited)
        } else {
            (&edited, &model)
        };
        let changes = ModelChanges::between(from, to);
        let start = Instant::now();
        let _ = solver.solve_changes(changes);
        edits.push(start.elapsed().as_secs_f64() * 1e3);
        let start = Instant::now();
        let _ = solver.solve_changes(ModelChanges::between(to, to));
        unchanged.push(start.elapsed().as_secs_f64() * 1e3);
    }
    let median = |times: &mut Vec<f64>| {
        times.sort_by(f64::total_cmp);
        times[times.len() / 2]
    };
    println!(
        "edits: {:.1} ms (median, {} components re-solved), no change: {:.1} ms",
        median(&mut edits),
        solver.last_solved(),
        median(&mut unchanged)
    );
}
