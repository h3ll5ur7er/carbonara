//! The tools, resources and prompts the server offers, read from `crates/mcp/manifest.json`, which `pnpm mcp:tools`
//! (tools/mcp-tools.ts) generates from the manager contracts. Hides the manifest's format from the server.

use std::collections::HashMap;
use std::sync::Arc;

use rmcp::model::{Prompt, PromptArgument, Resource, Tool, ToolAnnotations};
use serde::Deserialize;
use serde_json::{Map, Value};

const BUNDLED: &str = include_str!("../manifest.json");

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    /// What the server tells clients when they connect.
    pub instructions: String,
    pub tools: Vec<ToolEntry>,
    pub resources: Vec<ResourceEntry>,
    pub prompts: Vec<PromptEntry>,
}

/// A tool and the manager method it calls.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolEntry {
    pub name: String,
    pub description: String,
    /// The permission group: `read`, `plan`, `edit` or `authoring`.
    pub group: String,
    pub manager: String,
    pub method: String,
    pub input_schema: Map<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceEntry {
    pub uri: String,
    pub name: String,
    pub description: String,
    pub mime_type: String,
    #[serde(flatten)]
    pub source: ResourceSource,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum ResourceSource {
    /// Fixed text, such as a JSON Schema.
    Text { text: String },
    /// What a read tool answers for these arguments, such as the active document.
    Tool { tool: String, arguments: Value },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptEntry {
    pub name: String,
    pub description: String,
    pub arguments: Vec<PromptArgumentEntry>,
    /// The message, with `{{argument}}` for each argument's value.
    pub text: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PromptArgumentEntry {
    pub name: String,
    pub description: String,
    pub required: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum ManifestError {
    #[error("the MCP manifest is invalid: {0}")]
    Invalid(#[from] serde_json::Error),
}

impl Manifest {
    /// The manifest built into this binary.
    pub fn bundled() -> Result<Self, ManifestError> {
        Ok(serde_json::from_str(BUNDLED)?)
    }

    pub fn tool(&self, name: &str) -> Option<&ToolEntry> {
        self.tools.iter().find(|tool| tool.name == name)
    }

    pub fn resource(&self, uri: &str) -> Option<&ResourceEntry> {
        self.resources.iter().find(|resource| resource.uri == uri)
    }

    pub fn prompt(&self, name: &str) -> Option<&PromptEntry> {
        self.prompts.iter().find(|prompt| prompt.name == name)
    }

    pub fn mcp_tools(&self) -> Vec<Tool> {
        self.tools
            .iter()
            .map(|tool| {
                let read_only = tool.group == "read";
                let annotations = ToolAnnotations::new().read_only(read_only);
                Tool::new(
                    tool.name.clone(),
                    tool.description.clone(),
                    Arc::new(tool.input_schema.clone()),
                )
                .with_annotations(annotations)
            })
            .collect()
    }

    pub fn mcp_resources(&self) -> Vec<Resource> {
        self.resources
            .iter()
            .map(|resource| {
                Resource::new(resource.uri.clone(), resource.name.clone())
                    .with_description(resource.description.clone())
                    .with_mime_type(resource.mime_type.clone())
            })
            .collect()
    }

    pub fn mcp_prompts(&self) -> Vec<Prompt> {
        self.prompts
            .iter()
            .map(|prompt| {
                let arguments = prompt
                    .arguments
                    .iter()
                    .map(|argument| {
                        PromptArgument::new(argument.name.clone())
                            .with_description(argument.description.clone())
                            .with_required(argument.required)
                    })
                    .collect();
                Prompt::new(
                    prompt.name.clone(),
                    Some(prompt.description.clone()),
                    Some(arguments),
                )
            })
            .collect()
    }
}

impl PromptEntry {
    /// The prompt's message for these argument values; the name of a missing required argument otherwise.
    pub fn render(&self, values: &HashMap<String, String>) -> Result<String, String> {
        let mut text = self.text.clone();
        for argument in &self.arguments {
            let value = match values.get(&argument.name) {
                Some(value) => value.as_str(),
                None if argument.required => return Err(argument.name.clone()),
                None => "",
            };
            text = text.replace(&format!("{{{{{}}}}}", argument.name), value);
        }
        Ok(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_bundled_manifest_names_a_manager_method_for_every_tool() {
        let manifest = Manifest::bundled().expect("valid manifest");
        let undo = manifest.tool("undo").expect("undo is a tool");
        assert_eq!(
            (undo.manager.as_str(), undo.method.as_str()),
            ("editing", "undo")
        );
        assert!(
            manifest
                .tools
                .iter()
                .all(|tool| !tool.manager.is_empty() && !tool.method.is_empty())
        );
    }

    #[test]
    fn resources_that_call_a_tool_name_one_of_the_manifest() {
        let manifest = Manifest::bundled().expect("valid manifest");
        for resource in &manifest.resources {
            if let ResourceSource::Tool { tool, .. } = &resource.source {
                assert!(
                    manifest.tool(tool).is_some(),
                    "{} names {tool}",
                    resource.uri
                );
            }
        }
    }

    #[test]
    fn only_read_tools_are_marked_read_only() {
        let manifest = Manifest::bundled().expect("valid manifest");
        for (entry, tool) in manifest.tools.iter().zip(manifest.mcp_tools()) {
            let read_only = tool
                .annotations
                .and_then(|annotations| annotations.read_only_hint);
            assert_eq!(read_only, Some(entry.group == "read"), "{}", entry.name);
        }
    }

    #[test]
    fn prompts_fill_in_their_arguments_and_insist_on_the_required_ones() {
        let manifest = Manifest::bundled().expect("valid manifest");
        let prompt = manifest.prompt("create_pack").expect("create_pack");
        let values = HashMap::from([("game".to_string(), "Factorio".to_string())]);
        let text = prompt.render(&values).expect("rendered");
        assert!(text.contains("game pack for Factorio."));
        assert!(!text.contains("{{"));
        assert_eq!(prompt.render(&HashMap::new()), Err("game".to_string()));
    }
}
