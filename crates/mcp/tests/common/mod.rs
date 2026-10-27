// Shared by the transport tests: a fake app behind the bridge, the server, and a scripted MCP client.
#![allow(dead_code)]

use std::sync::{Arc, Mutex};

use carbonara_mcp::{Bridge, BridgeCall, BridgeError, HttpServer, Manifest, Token, serve_http};
use rmcp::model::{CallToolRequestParams, CallToolResult, ClientConfig, ResourceContents};
use rmcp::service::RunningService;
use rmcp::transport::StreamableHttpClientTransport;
use rmcp::transport::streamable_http_client::StreamableHttpClientTransportConfig;
use rmcp::{RoleClient, ServiceExt};
use serde_json::{Value, json};

/// Plays the app: answers every tool with what it was asked, and refuses `edit_graph` like a switched-off group.
#[derive(Default)]
pub struct FakeApp {
    pub calls: Mutex<Vec<BridgeCall>>,
}

impl FakeApp {
    pub fn calls(&self) -> Vec<BridgeCall> {
        self.calls.lock().expect("lock").clone()
    }
}

impl Bridge for FakeApp {
    async fn call(&self, call: BridgeCall) -> Result<Value, BridgeError> {
        self.calls.lock().expect("lock").push(call.clone());
        if call.tool == "edit_graph" {
            return Err(BridgeError::Failed(
                "The edit tools are switched off in Carbonara.".into(),
            ));
        }
        Ok(json!({ "answered": call.tool, "args": call.args }))
    }
}

pub const TOKEN: &str = "test-token-0123456789";

pub async fn start(app: Arc<FakeApp>) -> HttpServer {
    let manifest = Arc::new(Manifest::bundled().expect("manifest"));
    serve_http(manifest, app, 0, Token::from(TOKEN))
        .await
        .expect("serving")
}

pub type Client = RunningService<RoleClient, ClientConfig>;

/// A scripted MCP client over Streamable HTTP, presenting `token` if there is one.
pub async fn connect(url: &str, token: Option<&str>) -> Result<Client, String> {
    let mut config = StreamableHttpClientTransportConfig::with_uri(url.to_string());
    if let Some(token) = token {
        config = config.auth_header(token.to_string());
    }
    ClientConfig::default()
        .serve(StreamableHttpClientTransport::from_config(config))
        .await
        .map_err(|error| error.to_string())
}

pub async fn call(client: &Client, tool: &str, args: Value) -> CallToolResult {
    let Value::Object(args) = args else {
        panic!("arguments are an object")
    };
    client
        .call_tool(CallToolRequestParams::new(tool.to_string()).with_arguments(args))
        .await
        .expect("tool call")
}

/// The text of a tool result's only content block.
pub fn text(result: &CallToolResult) -> String {
    result.content[0].as_text().expect("text").text.clone()
}

pub fn resource_text(contents: &ResourceContents) -> String {
    match contents {
        ResourceContents::TextResourceContents { text, .. } => text.clone(),
        other => panic!("expected text, got {other:?}"),
    }
}
