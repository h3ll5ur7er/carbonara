//! Plugs the MCP server (`crates/mcp`, docs/Architecture/MCP-server.md) into the desktop app: serves it on
//! 127.0.0.1 behind the per-install token while the app runs, carries each tool call to the webview (`mcp-call`
//! event, answered with `mcp_answer`), tells the webview where it listens (`mcp_connection`), and runs the stdio
//! bridge for `carbonara mcp`.

use carbonara_mcp::{Connection, HttpServer, Manifest, MessageBridge, Token};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

/// The port MCP clients are configured with. When it's taken, the server takes any free one: the connection file
/// and the copy-config snippets say which.
pub const PORT: u16 = 41736;

/// Tool calls go to the webview as this event.
const MCP_CALL: &str = "mcp-call";

type Error = Box<dyn std::error::Error + Send + Sync>;

/// Where the server listens, as `McpConnectionInfo` in src/client/features/mcp/snippets.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ConnectionInfo {
    url: String,
    token: String,
    /// The app's executable: `<command> mcp` runs the stdio bridge.
    command: String,
}

/// The running server, kept for the app's lifetime.
pub struct Mcp {
    bridge: Arc<MessageBridge>,
    connection: ConnectionInfo,
    _server: HttpServer,
}

/// Whether the command line asks for the stdio bridge: `carbonara mcp`.
pub fn wants_stdio_bridge<S: AsRef<str>>(args: &[S]) -> bool {
    args.get(1).is_some_and(|arg| arg.as_ref() == "mcp")
}

/// The app's config folder, as Tauri's `app_config_dir` names it, for `carbonara mcp`, which runs without a Tauri
/// app (it must not open a window or reach the running instance).
pub fn config_folder(identifier: &str) -> Option<PathBuf> {
    dirs::config_dir().map(|config| config.join(identifier))
}

fn connection_file(config: &Path) -> PathBuf {
    config.join("mcp.json")
}

/// `carbonara mcp`: MCP on stdin and stdout, forwarded to the running app's server.
pub fn run_stdio_bridge(identifier: &str) -> Result<(), Error> {
    let config = config_folder(identifier).ok_or("This system has no config folder")?;
    tauri::async_runtime::block_on(carbonara_mcp::run_stdio(connection_file(&config)))?;
    Ok(())
}

/// Serves MCP on `port` (or any free port when it's taken) with the token kept in `config`, and writes the
/// connection file the stdio bridge reads.
async fn serve(
    bridge: Arc<MessageBridge>,
    config: &Path,
    port: u16,
) -> Result<(HttpServer, Connection), Error> {
    let token = Token::load_or_create(&config.join("mcp-token"))?;
    let manifest = Arc::new(Manifest::bundled()?);
    let server = match carbonara_mcp::serve_http(
        manifest.clone(),
        bridge.clone(),
        port,
        token.clone(),
    )
    .await
    {
        Ok(server) => server,
        Err(_) => carbonara_mcp::serve_http(manifest, bridge, 0, token.clone()).await?,
    };
    let connection = Connection {
        url: server.url(),
        token: token.as_str().into(),
    };
    connection.write(&connection_file(config))?;
    Ok((server, connection))
}

/// Starts the server while the app sets up, before the webview asks where it is.
pub fn start(app: &AppHandle) -> Result<(), Error> {
    let config = app.path().app_config_dir()?;
    let bridge = Arc::new(MessageBridge::new({
        let app = app.clone();
        move |call| app.emit(MCP_CALL, call).map_err(|error| error.to_string())
    }));
    let (server, connection) =
        tauri::async_runtime::block_on(serve(bridge.clone(), &config, PORT))?;
    let command = std::env::current_exe()?.to_string_lossy().into_owned();
    app.manage(Mcp {
        bridge,
        connection: ConnectionInfo {
            url: connection.url,
            token: connection.token,
            command,
        },
        _server: server,
    });
    Ok(())
}

/// The webview's answer to a tool call (the RPC response shape).
#[tauri::command(async)]
pub fn mcp_answer(mcp: State<Mcp>, answer: Value) {
    mcp.bridge.answer(answer);
}

/// Where the server listens; `None` when it couldn't start.
#[tauri::command(async)]
pub fn mcp_connection(app: AppHandle) -> Option<ConnectionInfo> {
    app.try_state::<Mcp>().map(|mcp| mcp.connection.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runs_the_stdio_bridge_only_for_the_mcp_subcommand() {
        assert!(wants_stdio_bridge(&["carbonara", "mcp"]));
        assert!(!wants_stdio_bridge(&["carbonara"]));
        assert!(!wants_stdio_bridge(&["carbonara", "Iron.carbonara"]));
        assert!(!wants_stdio_bridge(&["carbonara", "--", "mcp"]));
    }

    fn bridge() -> Arc<MessageBridge> {
        Arc::new(MessageBridge::new(|_| Ok(())))
    }

    #[tokio::test]
    async fn serves_with_the_kept_token_and_says_where_in_the_connection_file() {
        let config = tempfile::tempdir().expect("a temporary folder");
        let (first, connection) = serve(bridge(), config.path(), 0).await.expect("serving");
        assert!(connection.url.starts_with("http://127.0.0.1:"));
        assert_eq!(
            Connection::read(&connection_file(config.path())).expect("written"),
            connection
        );
        first.shutdown().await;

        let (_second, again) = serve(bridge(), config.path(), 0).await.expect("serving");
        assert_eq!(again.token, connection.token, "the token is per install");
    }

    #[tokio::test]
    async fn takes_another_port_when_its_own_is_taken() {
        let config = tempfile::tempdir().expect("a temporary folder");
        let taken = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("a port");
        let port = taken.local_addr().expect("an address").port();
        let (server, connection) = serve(bridge(), config.path(), port).await.expect("serving");
        assert_ne!(server.address().port(), port);
        assert_eq!(connection.url, server.url());
    }
}
