//! Streamable HTTP on `127.0.0.1` only, behind the per-install bearer token. Hides the web stack (axum) and the
//! checks every request passes before it reaches the server: the token, a loopback `Host` (no DNS rebinding) and
//! no browser `Origin` (no cross-site requests from web pages).

use std::io;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;

use axum::Router;
use axum::extract::{Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::bridge::Bridge;
use crate::manifest::Manifest;
use crate::server::CarbonaraServer;
use crate::token::Token;

/// A running server; it stops on [`HttpServer::shutdown`] or when dropped with its runtime.
pub struct HttpServer {
    address: SocketAddr,
    cancel: CancellationToken,
    task: JoinHandle<()>,
}

impl HttpServer {
    pub fn address(&self) -> SocketAddr {
        self.address
    }

    /// The endpoint MCP clients connect to.
    pub fn url(&self) -> String {
        format!("http://{}/mcp", self.address)
    }

    pub async fn shutdown(self) {
        self.cancel.cancel();
        let _ = self.task.await;
    }
}

/// Serves MCP at `http://127.0.0.1:<port>/mcp`; port 0 picks a free one. Only clients presenting `token` as
/// `Authorization: Bearer <token>` get through.
pub async fn serve_http<B: Bridge>(
    manifest: Arc<Manifest>,
    bridge: Arc<B>,
    port: u16,
    token: Token,
) -> io::Result<HttpServer> {
    let cancel = CancellationToken::new();
    let config = StreamableHttpServerConfig::default()
        .enforce_origin_validation()
        .with_cancellation_token(cancel.child_token());
    let server = CarbonaraServer::new(manifest, bridge);
    let service: StreamableHttpService<CarbonaraServer<B>, LocalSessionManager> =
        StreamableHttpService::new(move || Ok(server.clone()), Default::default(), config);
    let router = Router::new()
        .nest_service("/mcp", service)
        .layer(middleware::from_fn_with_state(token, require_token));

    let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await?;
    let address = listener.local_addr()?;
    let task = tokio::spawn({
        let cancel = cancel.clone();
        async move {
            let _ = axum::serve(listener, router)
                .with_graceful_shutdown(cancel.cancelled_owned())
                .await;
        }
    });
    Ok(HttpServer {
        address,
        cancel,
        task,
    })
}

async fn require_token(State(token): State<Token>, request: Request, next: Next) -> Response {
    let presented = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    if presented.is_some_and(|presented| token.matches(presented)) {
        return next.run(request).await;
    }
    (
        StatusCode::UNAUTHORIZED,
        [(header::WWW_AUTHENTICATE, "Bearer")],
        "Carbonara's MCP server needs its token: copy the client config from Carbonara (AI access).",
    )
        .into_response()
}
