//! `carbonara mcp`: MCP on stdin/stdout for clients that only launch stdio servers. It forwards every request to the
//! running app's HTTP server, which it finds through the app's connection file, so there is one server with one
//! set of permissions. Hides the reconnecting: the app may start after the client, or restart on another port.

use std::path::PathBuf;

use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, ClientConfig, ContentBlock,
    GetPromptRequestParams, GetPromptResponse, ListPromptsResult, ListResourcesResult,
    ListToolsResult, PaginatedRequestParams, ReadResourceRequestParams, ReadResourceResponse,
    ServerConfig,
};
use rmcp::service::{Peer, RequestContext, RunningService, ServiceError};
use rmcp::transport::StreamableHttpClientTransport;
use rmcp::transport::streamable_http_client::StreamableHttpClientTransportConfig;
use rmcp::{ErrorData as McpError, RoleClient, RoleServer, ServerHandler, ServiceExt};
use tokio::sync::Mutex;

use crate::connection::Connection;
use crate::manifest::{Manifest, ManifestError};
use crate::server::server_config;

const NOT_RUNNING: &str = "Carbonara isn't running, or its MCP server is off. Start the Carbonara desktop app and try again.";

#[derive(Debug, thiserror::Error)]
pub enum StdioError {
    #[error(transparent)]
    Manifest(#[from] ManifestError),
    #[error("the stdio connection failed: {0}")]
    Serve(String),
}

/// Serves MCP on this process's stdin and stdout until the client hangs up.
pub async fn run_stdio(connection_file: PathBuf) -> Result<(), StdioError> {
    let proxy = StdioProxy {
        config: server_config(&Manifest::bundled()?),
        connection_file,
        app: Mutex::new(None),
    };
    let service = proxy
        .serve(rmcp::transport::stdio())
        .await
        .map_err(|error| StdioError::Serve(error.to_string()))?;
    service
        .waiting()
        .await
        .map_err(|error| StdioError::Serve(error.to_string()))?;
    Ok(())
}

struct StdioProxy {
    config: ServerConfig,
    connection_file: PathBuf,
    /// The connection to the app's server, made on the first request and again after it drops.
    app: Mutex<Option<RunningService<RoleClient, ClientConfig>>>,
}

impl StdioProxy {
    async fn app(&self) -> Result<Peer<RoleClient>, McpError> {
        let mut app = self.app.lock().await;
        if let Some(running) = app.as_ref().filter(|running| !running.is_closed()) {
            return Ok(running.peer().clone());
        }
        let not_running = || McpError::internal_error(NOT_RUNNING, None);
        let connection = Connection::read(&self.connection_file).map_err(|_| not_running())?;
        let transport = StreamableHttpClientTransport::from_config(
            StreamableHttpClientTransportConfig::with_uri(connection.url)
                .auth_header(connection.token),
        );
        let running = ClientConfig::default()
            .serve(transport)
            .await
            .map_err(|_| not_running())?;
        let peer = running.peer().clone();
        *app = Some(running);
        Ok(peer)
    }

    /// The app's error as is; a broken connection as "not running", and dropped so the next request reconnects.
    async fn failed(&self, error: ServiceError) -> McpError {
        match error {
            ServiceError::McpError(error) => error,
            _ => {
                self.app.lock().await.take();
                McpError::internal_error(NOT_RUNNING, None)
            }
        }
    }
}

impl ServerHandler for StdioProxy {
    fn get_info(&self) -> ServerConfig {
        self.config.clone()
    }

    async fn list_tools(
        &self,
        request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        match self.app().await?.list_tools(request).await {
            Ok(result) => Ok(result),
            Err(error) => Err(self.failed(error).await),
        }
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, McpError> {
        let answer = match self.app().await {
            Ok(app) => app.call_tool_once(request).await,
            Err(error) => return Ok(tool_error(error)),
        };
        match answer {
            Ok(response) => Ok(response),
            Err(error) => Ok(tool_error(self.failed(error).await)),
        }
    }

    async fn list_resources(
        &self,
        request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, McpError> {
        match self.app().await?.list_resources(request).await {
            Ok(result) => Ok(result),
            Err(error) => Err(self.failed(error).await),
        }
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, McpError> {
        match self.app().await?.read_resource_once(request).await {
            Ok(result) => Ok(result),
            Err(error) => Err(self.failed(error).await),
        }
    }

    async fn list_prompts(
        &self,
        request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListPromptsResult, McpError> {
        match self.app().await?.list_prompts(request).await {
            Ok(result) => Ok(result),
            Err(error) => Err(self.failed(error).await),
        }
    }

    async fn get_prompt(
        &self,
        request: GetPromptRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<GetPromptResponse, McpError> {
        match self.app().await?.get_prompt_once(request).await {
            Ok(result) => Ok(result),
            Err(error) => Err(self.failed(error).await),
        }
    }
}

/// A failed call as a tool result, so the model reads why.
fn tool_error(error: McpError) -> CallToolResponse {
    CallToolResult::error(vec![ContentBlock::text(error.message.to_string())]).into()
}
