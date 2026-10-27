//! Times solving a model natively, warm (one LP for all tiers) against cold (one LP per tier).
//! `cargo run --release --example profile -- model.json [rounds]`, with a model the compiler built (as
//! JSON). Also times validating it and re-solving it with every component cached.
use carbonara_solver::ir::Model;
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

fn main() {
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("usage: profile <model.json>");
        return;
    };
    let model: Model = match std::fs::read_to_string(path).map(|text| serde_json::from_str(&text)) {
        Ok(Ok(model)) => model,
        _ => {
            eprintln!("not a model");
            return;
        }
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
}
