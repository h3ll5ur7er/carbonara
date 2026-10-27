// A scripted MCP client talks to the server over Streamable HTTP, with a fake app behind the bridge.
mod common;

use std::collections::HashMap;
use std::sync::Arc;

use carbonara_mcp::Manifest;
use common::{FakeApp, TOKEN, call, connect, resource_text, start, text};
use rmcp::model::{GetPromptRequestParams, ReadResourceRequestParams};
use serde_json::{Value, json};

const INITIALIZE: &str = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}"#;

fn manifest() -> Manifest {
    Manifest::bundled().expect("manifest")
}

#[tokio::test]
async fn lists_the_manifests_tools_with_their_input_schemas() {
    let server = start(Arc::default()).await;
    let client = connect(&server.url(), Some(TOKEN))
        .await
        .expect("connected");
    let tools = client.list_all_tools().await.expect("tools");
    let manifest = manifest();
    let names: Vec<_> = tools.iter().map(|tool| tool.name.to_string()).collect();
    let expected: Vec<_> = manifest
        .tools
        .iter()
        .map(|tool| tool.name.clone())
        .collect();
    assert_eq!(names, expected);
    for (tool, entry) in tools.iter().zip(&manifest.tools) {
        assert_eq!(*tool.input_schema, entry.input_schema, "{}", entry.name);
    }
    client.cancel().await.expect("closed");
    server.shutdown().await;
}

#[tokio::test]
async fn forwards_every_tool_call_to_its_manager_method_and_answers_with_the_apps_value() {
    let app = Arc::new(FakeApp::default());
    let server = start(app.clone()).await;
    let client = connect(&server.url(), Some(TOKEN))
        .await
        .expect("connected");
    for tool in manifest()
        .tools
        .iter()
        .filter(|tool| tool.name != "edit_graph")
    {
        let args = json!({ "documentId": "active" });
        let result = call(&client, &tool.name, args.clone()).await;
        assert_ne!(result.is_error, Some(true), "{}", tool.name);
        let answer: Value = serde_json::from_str(&text(&result)).expect("JSON");
        assert_eq!(answer, json!({ "answered": tool.name, "args": args }));
        let forwarded = app.calls().pop().expect("a call");
        assert_eq!(
            (forwarded.manager, forwarded.method),
            (tool.manager.clone(), tool.method.clone())
        );
    }
    client.cancel().await.expect("closed");
    server.shutdown().await;
}

#[tokio::test]
async fn reports_a_refused_call_as_a_tool_error_the_model_can_read() {
    let server = start(Arc::default()).await;
    let client = connect(&server.url(), Some(TOKEN))
        .await
        .expect("connected");
    let result = call(
        &client,
        "edit_graph",
        json!({ "documentId": "active", "commands": [] }),
    )
    .await;
    assert_eq!(result.is_error, Some(true));
    assert_eq!(
        text(&result),
        "The edit tools are switched off in Carbonara."
    );
    client.cancel().await.expect("closed");
    server.shutdown().await;
}

#[tokio::test]
async fn turns_away_clients_without_the_token() {
    let server = start(Arc::default()).await;
    assert!(connect(&server.url(), None).await.is_err());
    assert!(connect(&server.url(), Some("wrong-token")).await.is_err());

    let http = reqwest::Client::new();
    let post = |token: Option<&str>| {
        let mut request = http
            .post(server.url())
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .body(INITIALIZE);
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        request.send()
    };
    let refused = post(None).await.expect("answered");
    assert_eq!(refused.status(), 401);
    assert_eq!(
        refused
            .headers()
            .get("www-authenticate")
            .map(|value| value.as_bytes()),
        Some(&b"Bearer"[..])
    );
    assert_eq!(post(Some(TOKEN)).await.expect("answered").status(), 200);
    server.shutdown().await;
}

#[tokio::test]
async fn turns_away_web_pages_even_with_the_token() {
    let server = start(Arc::default()).await;
    let response = reqwest::Client::new()
        .post(server.url())
        .bearer_auth(TOKEN)
        .header("Origin", "https://evil.example")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
        .body(INITIALIZE)
        .send()
        .await
        .expect("answered");
    assert_eq!(response.status(), 403);
    server.shutdown().await;
}

#[tokio::test]
async fn listens_on_the_loopback_interface_only() {
    let server = start(Arc::default()).await;
    assert!(server.address().ip().is_loopback());
    assert!(server.url().starts_with("http://127.0.0.1:"));
    server.shutdown().await;
}

#[tokio::test]
async fn serves_the_schemas_and_reads_the_active_document_through_the_bridge() {
    let app = Arc::new(FakeApp::default());
    let server = start(app.clone()).await;
    let client = connect(&server.url(), Some(TOKEN))
        .await
        .expect("connected");
    let uris: Vec<_> = client
        .list_all_resources()
        .await
        .expect("resources")
        .into_iter()
        .map(|resource| resource.uri.clone())
        .collect();
    assert!(uris.contains(&"carbonara://schemas/pack-data.json".to_string()));

    let schema = client
        .read_resource(ReadResourceRequestParams::new(
            "carbonara://schemas/pack-data.json",
        ))
        .await
        .expect("schema");
    let schema: Value = serde_json::from_str(&resource_text(&schema.contents[0])).expect("JSON");
    assert_eq!(schema["type"], "object");
    assert!(app.calls().is_empty(), "fixed resources don't need the app");

    let active = client
        .read_resource(ReadResourceRequestParams::new(
            "carbonara://documents/active",
        ))
        .await
        .expect("active document");
    let answer: Value = serde_json::from_str(&resource_text(&active.contents[0])).expect("JSON");
    assert_eq!(answer["answered"], "get_graph");
    assert_eq!(app.calls()[0].args, json!({ "documentId": "active" }));
    client.cancel().await.expect("closed");
    server.shutdown().await;
}

#[tokio::test]
async fn fills_in_prompts_and_insists_on_their_arguments() {
    let server = start(Arc::default()).await;
    let client = connect(&server.url(), Some(TOKEN))
        .await
        .expect("connected");
    let names: Vec<_> = client
        .list_all_prompts()
        .await
        .expect("prompts")
        .into_iter()
        .map(|prompt| prompt.name)
        .collect();
    assert_eq!(names, ["design_production_line", "create_pack"]);

    let arguments = HashMap::from([("item", "steel plate"), ("rate", "2 full yellow belts")])
        .into_iter()
        .map(|(name, value)| (name.to_string(), json!(value)))
        .collect();
    let prompt = client
        .get_prompt(GetPromptRequestParams::new("design_production_line").with_arguments(arguments))
        .await
        .expect("prompt");
    let message = serde_json::to_value(&prompt.messages[0]).expect("JSON");
    assert!(
        message["content"]["text"]
            .as_str()
            .is_some_and(|text| text.contains("makes steel plate at 2 full yellow belts"))
    );
    assert!(
        client
            .get_prompt(GetPromptRequestParams::new("design_production_line"))
            .await
            .is_err()
    );
    client.cancel().await.expect("closed");
    server.shutdown().await;
}
