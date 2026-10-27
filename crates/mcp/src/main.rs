//! `carbonara-mcp-stdio <connection file>`: the stdio bridge on its own, for development and tests. The desktop
//! app offers the same as `carbonara mcp` by calling `carbonara_mcp::run_stdio` with its connection file.

use std::path::PathBuf;
use std::process::ExitCode;

#[tokio::main]
async fn main() -> ExitCode {
    let Some(connection_file) = std::env::args_os().nth(1).map(PathBuf::from) else {
        eprintln!(
            "usage: carbonara-mcp-stdio <connection file (mcp.json in Carbonara's config folder)>"
        );
        return ExitCode::from(2);
    };
    match carbonara_mcp::run_stdio(connection_file).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
