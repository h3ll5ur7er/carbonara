// A scripted MCP client launches the stdio bridge, as Claude Desktop would, and reaches the app's HTTP server
// through it.
mod common;

use std::path::Path;
use std::sync::Arc;

use carbonara_mcp::{Connection, Manifest};
use common::{FakeApp, TOKEN, start, text};
use rmcp::model::{CallToolRequestParams, ClientConfig};
use rmcp::service::RunningService;
use rmcp::transport::{ConfigureCommandExt, TokioChildProcess};
use rmcp::{RoleClient, ServiceExt};
use serde_json::{Value, json};

async fn launch(connection_file: &Path) -> RunningService<RoleClient, ClientConfig> {
    let command = tokio::process::Command::new(env!("CARGO_BIN_EXE_carbonara-mcp-stdio"))
        .configure(|command| {
            command.arg(connection_file);
        });
    ClientConfig::default()
        .serve(TokioChildProcess::new(command).expect("launched"))
        .await
        .expect("initialized")
}

#[tokio::test]
async fn lists_and_calls_the_apps_tools_over_stdio() {
    let app = Arc::new(FakeApp::default());
    let server = start(app.clone()).await;
    let folder = tempfile::tempdir().expect("temp dir");
    let connection_file = folder.path().join("mcp.json");
    Connection {
        url: server.url(),
        token: TOKEN.into(),
    }
    .write(&connection_file)
    .expect("written");

    let client = launch(&connection_file).await;
    let names: Vec<_> = client
        .list_all_tools()
        .await
        .expect("tools")
        .into_iter()
        .map(|tool| tool.name.to_string())
        .collect();
    let manifest = Manifest::bundled().expect("manifest");
    assert_eq!(
        names,
        manifest
            .tools
            .iter()
            .map(|tool| tool.name.clone())
            .collect::<Vec<_>>()
    );

    let result = client
        .call_tool(CallToolRequestParams::new("list_documents"))
        .await
        .expect("called");
    let answer: Value = serde_json::from_str(&text(&result)).expect("JSON");
    assert_eq!(answer["answered"], "list_documents");
    assert_eq!(app.calls()[0].method, "listDocuments");

    client.cancel().await.expect("closed");
    server.shutdown().await;
}

#[tokio::test]
async fn says_clearly_when_the_app_isnt_running() {
    let folder = tempfile::tempdir().expect("temp dir");
    let client = launch(&folder.path().join("mcp.json")).await;

    let result = client
        .call_tool(CallToolRequestParams::new("list_documents"))
        .await
        .expect("answered");
    assert_eq!(result.is_error, Some(true));
    assert!(text(&result).contains("Carbonara isn't running"));
    let listing = client.list_all_tools().await.expect_err("no tools to list");
    assert!(listing.to_string().contains("Carbonara isn't running"));

    client.cancel().await.expect("closed");
}

#[tokio::test]
async fn is_turned_away_with_a_wrong_token() {
    let server = start(Arc::default()).await;
    let folder = tempfile::tempdir().expect("temp dir");
    let connection_file = folder.path().join("mcp.json");
    Connection {
        url: server.url(),
        token: "stale-token".into(),
    }
    .write(&connection_file)
    .expect("written");

    let client = launch(&connection_file).await;
    let result = client
        .call_tool(
            CallToolRequestParams::new("list_documents")
                .with_arguments(json!({}).as_object().cloned().expect("object")),
        )
        .await
        .expect("answered");
    assert_eq!(result.is_error, Some(true));
    client.cancel().await.expect("closed");
    server.shutdown().await;
}
