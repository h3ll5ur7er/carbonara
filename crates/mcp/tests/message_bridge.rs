// The desktop wiring end to end, with a fake webview: MCP client → HTTP server → MessageBridge → webview → back.
mod common;

use std::sync::Arc;

use carbonara_mcp::{Manifest, MessageBridge, Token, serve_http};
use common::{TOKEN, call, connect, text};
use serde_json::{Value, json};
use tokio::sync::mpsc;

#[tokio::test]
async fn carries_tool_calls_to_the_webview_and_its_answers_back() {
    let (to_webview, mut webview) = mpsc::unbounded_channel::<Value>();
    let bridge = Arc::new(MessageBridge::new(move |message| {
        to_webview.send(message).map_err(|error| error.to_string())
    }));
    // The webview's bridge (src/client/features/mcp/bridge.ts) answers in the RPC response shape.
    tokio::spawn({
        let bridge = bridge.clone();
        async move {
            while let Some(request) = webview.recv().await {
                let answer = if request["tool"] == "undo" {
                    json!({ "id": request["id"], "ok": false, "error": { "message": "The edit tools are switched off." } })
                } else {
                    json!({ "id": request["id"], "ok": true, "value": [{ "id": "doc-1", "name": "Iron" }] })
                };
                bridge.answer(answer);
            }
        }
    });
    let manifest = Arc::new(Manifest::bundled().expect("manifest"));
    let server = serve_http(manifest, bridge, 0, Token::from(TOKEN))
        .await
        .expect("serving");
    let client = connect(&server.url(), Some(TOKEN))
        .await
        .expect("connected");

    let listed = call(&client, "list_documents", json!({})).await;
    assert_eq!(
        serde_json::from_str::<Value>(&text(&listed)).expect("JSON"),
        json!([{ "id": "doc-1", "name": "Iron" }])
    );
    let refused = call(&client, "undo", json!({ "documentId": "active" })).await;
    assert_eq!(refused.is_error, Some(true));
    assert_eq!(text(&refused), "The edit tools are switched off.");

    client.cancel().await.expect("closed");
    server.shutdown().await;
}
