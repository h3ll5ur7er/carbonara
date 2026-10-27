//! Carbonara's MCP server (docs/Architecture/MCP-server.md). It hides the MCP protocol and its transports from the
//! rest of the app: the server offers the tools, resources and prompts of the manifest that `pnpm mcp:tools`
//! generates from the manager contracts, and forwards every call through a [`Bridge`] to the app's managers.
//!
//! The desktop shell wires it up:
//!
//! 1. [`Token::load_or_create`] the per-install token in the app's config folder.
//! 2. Make a [`MessageBridge`] whose `send` emits each call to the webview, and pass the webview's answers to
//!    [`MessageBridge::answer`]. The webview's end is `startMcpBridge` in `src/client/features/mcp/bridge.ts`.
//! 3. [`serve_http`] on `127.0.0.1`, then write a [`Connection`] file so `carbonara mcp` ([`run_stdio`]) can find
//!    the server.

mod bridge;
mod connection;
mod http;
mod manifest;
mod server;
mod stdio;
mod token;

pub use bridge::{Bridge, BridgeCall, BridgeError, MessageBridge};
pub use connection::Connection;
pub use http::{HttpServer, serve_http};
pub use manifest::{Manifest, ManifestError};
pub use server::CarbonaraServer;
pub use stdio::{StdioError, run_stdio};
pub use token::Token;
