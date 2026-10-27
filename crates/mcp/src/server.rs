//! The MCP server proper: offers the manifest's tools, resources and prompts, and forwards tool calls (and reads of
//! resources backed by a tool) through the bridge. Transport-agnostic; see `http` and `stdio`.

use std::collections::HashMap;
use std::sync::Arc;

use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, GetPromptRequestParams,
    GetPromptResponse, GetPromptResult, Implementation, ListPromptsResult, ListResourcesResult,
    ListToolsResult, PaginatedRequestParams, PromptMessage, ReadResourceRequestParams,
    ReadResourceResponse, ReadResourceResult, ResourceContents, Role, ServerCapabilities,
    ServerConfig,
};
use rmcp::service::RequestContext;
use rmcp::{ErrorData as McpError, RoleServer, ServerHandler};
use serde_json::{Value, json};

use crate::bridge::{Bridge, BridgeCall, BridgeError};
use crate::manifest::{Manifest, ResourceSource};

pub struct CarbonaraServer<B> {
    manifest: Arc<Manifest>,
    bridge: Arc<B>,
}

impl<B> Clone for CarbonaraServer<B> {
    fn clone(&self) -> Self {
        Self {
            manifest: self.manifest.clone(),
            bridge: self.bridge.clone(),
        }
    }
}

impl<B: Bridge> CarbonaraServer<B> {
    pub fn new(manifest: Arc<Manifest>, bridge: Arc<B>) -> Self {
        Self { manifest, bridge }
    }

    async fn forward(&self, tool: &str, args: Value) -> Option<Result<Value, BridgeError>> {
        let entry = self.manifest.tool(tool)?;
        let call = BridgeCall {
            tool: entry.name.clone(),
            manager: entry.manager.clone(),
            method: entry.method.clone(),
            args,
        };
        Some(self.bridge.call(call).await)
    }
}

/// What the server tells clients about itself; the stdio bridge says the same.
pub(crate) fn server_config(manifest: &Manifest) -> ServerConfig {
    let capabilities = ServerCapabilities::builder()
        .enable_tools()
        .enable_resources()
        .enable_prompts()
        .build();
    ServerConfig::new(capabilities)
        .with_server_info(Implementation::new("carbonara", env!("CARGO_PKG_VERSION")))
        .with_instructions(manifest.instructions.clone())
}

impl<B: Bridge> ServerHandler for CarbonaraServer<B> {
    fn get_info(&self) -> ServerConfig {
        server_config(&self.manifest)
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        Ok(ListToolsResult::with_all_items(self.manifest.mcp_tools()))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, McpError> {
        let args = request.arguments.map_or_else(|| json!({}), Value::Object);
        let Some(answer) = self.forward(&request.name, args).await else {
            return Err(McpError::invalid_params(
                format!("Unknown tool {}", request.name),
                None,
            ));
        };
        // Failures are tool results, not protocol errors, so the model reads why and can react.
        Ok(match answer {
            Ok(value) => CallToolResult::success(vec![ContentBlock::text(value.to_string())]),
            Err(error) => CallToolResult::error(vec![ContentBlock::text(error.to_string())]),
        }
        .into())
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, McpError> {
        Ok(ListResourcesResult::with_all_items(
            self.manifest.mcp_resources(),
        ))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, McpError> {
        let Some(resource) = self.manifest.resource(&request.uri) else {
            return Err(McpError::resource_not_found(
                format!("Unknown resource {}", request.uri),
                None,
            ));
        };
        let text = match &resource.source {
            ResourceSource::Text { text } => text.clone(),
            ResourceSource::Tool { tool, arguments } => {
                match self.forward(tool, arguments.clone()).await {
                    Some(Ok(value)) => value.to_string(),
                    Some(Err(error)) => {
                        return Err(McpError::internal_error(error.to_string(), None));
                    }
                    None => {
                        return Err(McpError::internal_error(
                            format!("{} names the unknown tool {tool}", resource.uri),
                            None,
                        ));
                    }
                }
            }
        };
        let contents = ResourceContents::text(text, resource.uri.clone())
            .with_mime_type(resource.mime_type.clone());
        Ok(ReadResourceResult::new(vec![contents]).into())
    }

    async fn list_prompts(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListPromptsResult, McpError> {
        Ok(ListPromptsResult::with_all_items(
            self.manifest.mcp_prompts(),
        ))
    }

    async fn get_prompt(
        &self,
        request: GetPromptRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<GetPromptResponse, McpError> {
        let Some(prompt) = self.manifest.prompt(&request.name) else {
            return Err(McpError::invalid_params(
                format!("Unknown prompt {}", request.name),
                None,
            ));
        };
        let values: HashMap<String, String> = request
            .arguments
            .unwrap_or_default()
            .into_iter()
            .map(|(name, value)| {
                let text = match value {
                    Value::String(text) => text,
                    other => other.to_string(),
                };
                (name, text)
            })
            .collect();
        let text = prompt.render(&values).map_err(|missing| {
            McpError::invalid_params(format!("The prompt needs the argument {missing}"), None)
        })?;
        Ok(
            GetPromptResult::new(vec![PromptMessage::new_text(Role::User, text)])
                .with_description(prompt.description.clone())
                .into(),
        )
    }
}
