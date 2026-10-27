//! The way from the server to the managers. In the desktop app a tool call travels to the webview, whose MCP bridge
//! (`startMcpBridge` in src/client/features/mcp/bridge.ts) answers it through the connector. Hides that hop: the
//! server only sees [`Bridge::call`].

use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::oneshot;

/// One tool call: the tool, the manager method the manifest says it calls, and the arguments as the client sent them.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BridgeCall {
    pub tool: String,
    pub manager: String,
    pub method: String,
    pub args: Value,
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum BridgeError {
    /// The app couldn't take the call: no window listened, or it didn't answer in time.
    #[error("{0}")]
    Unavailable(String),
    /// The app answered with a failure: a refused tool, invalid arguments or a failing manager.
    #[error("{0}")]
    Failed(String),
}

pub trait Bridge: Send + Sync + 'static {
    /// The tool's answer: its view of the manager method's value.
    fn call(&self, call: BridgeCall) -> impl Future<Output = Result<Value, BridgeError>> + Send;
}

impl<B: Bridge> Bridge for Arc<B> {
    fn call(&self, call: BridgeCall) -> impl Future<Output = Result<Value, BridgeError>> + Send {
        self.as_ref().call(call)
    }
}

/// How long a call may take before it counts as unanswered. Planning a large factory can take a while.
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(120);

type SendMessage = Box<dyn Fn(Value) -> Result<(), String> + Send + Sync>;

/// A [`Bridge`] over a message pipe, such as Tauri events to the webview. Each call goes out through `send` as
/// `{id, tool, manager, method, args}`; the other end answers with the RPC response shape, `{id, ok: true, value}`
/// or `{id, ok: false, error: {message, issues?}}`, which comes back through [`MessageBridge::answer`].
pub struct MessageBridge {
    send: SendMessage,
    pending: Mutex<HashMap<u64, oneshot::Sender<Answer>>>,
    next_id: AtomicU64,
    timeout: Duration,
}

#[derive(Debug, Serialize)]
struct Request<'a> {
    id: u64,
    #[serde(flatten)]
    call: &'a BridgeCall,
}

#[derive(Debug, Deserialize)]
struct Answer {
    id: u64,
    ok: bool,
    #[serde(default)]
    value: Value,
    error: Option<AnswerError>,
}

#[derive(Debug, Deserialize)]
struct AnswerError {
    message: String,
    #[serde(default)]
    issues: Vec<Issue>,
}

#[derive(Debug, Deserialize)]
struct Issue {
    path: Vec<Value>,
    message: String,
}

impl MessageBridge {
    /// `send` delivers one message to the other end, or says why it couldn't.
    pub fn new(send: impl Fn(Value) -> Result<(), String> + Send + Sync + 'static) -> Self {
        Self {
            send: Box::new(send),
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            timeout: DEFAULT_TIMEOUT,
        }
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Hands an answer from the other end to the call waiting for it. Answers nobody waits for (any more) and
    /// messages that aren't answers are dropped; returns whether a call took it.
    pub fn answer(&self, message: Value) -> bool {
        let Ok(answer) = serde_json::from_value::<Answer>(message) else {
            return false;
        };
        let waiting = self.pending().remove(&answer.id);
        waiting.is_some_and(|sender| sender.send(answer).is_ok())
    }

    fn pending(&self) -> std::sync::MutexGuard<'_, HashMap<u64, oneshot::Sender<Answer>>> {
        self.pending.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl Bridge for MessageBridge {
    async fn call(&self, call: BridgeCall) -> Result<Value, BridgeError> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = oneshot::channel();
        self.pending().insert(id, sender);
        let message = serde_json::to_value(Request { id, call: &call })
            .map_err(|error| BridgeError::Failed(error.to_string()))?;
        if let Err(reason) = (self.send)(message) {
            self.pending().remove(&id);
            return Err(BridgeError::Unavailable(format!(
                "Carbonara couldn't take the call: {reason}"
            )));
        }
        let answer = tokio::time::timeout(self.timeout, receiver).await;
        self.pending().remove(&id);
        match answer {
            Ok(Ok(answer)) if answer.ok => Ok(answer.value),
            Ok(Ok(answer)) => Err(BridgeError::Failed(describe(answer.error))),
            Ok(Err(_)) | Err(_) => Err(BridgeError::Unavailable(
                "Carbonara didn't answer. Is a Carbonara window open?".to_string(),
            )),
        }
    }
}

fn describe(error: Option<AnswerError>) -> String {
    let Some(AnswerError { message, issues }) = error else {
        return "The call failed.".to_string();
    };
    let mut text = message;
    for Issue { path, message } in issues {
        let path: Vec<String> = path
            .iter()
            .map(|key| match key {
                Value::String(key) => key.clone(),
                other => other.to_string(),
            })
            .collect();
        text.push_str(&format!("\n- {}: {message}", path.join(".")));
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Arc;
    use tokio::sync::mpsc;

    fn call() -> BridgeCall {
        BridgeCall {
            tool: "undo".into(),
            manager: "editing".into(),
            method: "undo".into(),
            args: json!({ "documentId": "doc-1" }),
        }
    }

    /// A bridge whose sent messages arrive on the returned receiver.
    fn piped() -> (Arc<MessageBridge>, mpsc::UnboundedReceiver<Value>) {
        let (sender, receiver) = mpsc::unbounded_channel();
        let bridge = MessageBridge::new(move |message| {
            sender.send(message).map_err(|error| error.to_string())
        });
        (Arc::new(bridge), receiver)
    }

    #[tokio::test]
    async fn sends_each_call_with_an_id_and_resolves_it_with_its_answer() {
        let (bridge, mut sent) = piped();
        let pending = tokio::spawn({
            let bridge = bridge.clone();
            async move { bridge.call(call()).await }
        });
        let message = sent.recv().await.expect("a message");
        assert_eq!(
            message,
            json!({ "id": 1, "tool": "undo", "manager": "editing", "method": "undo", "args": { "documentId": "doc-1" } })
        );
        assert!(bridge.answer(json!({ "id": 1, "ok": true, "value": { "version": 4 } })));
        assert_eq!(pending.await.expect("joined"), Ok(json!({ "version": 4 })));
    }

    #[tokio::test]
    async fn matches_answers_to_calls_by_id_whatever_their_order() {
        let (bridge, mut sent) = piped();
        let first = tokio::spawn({
            let bridge = bridge.clone();
            async move { bridge.call(call()).await }
        });
        sent.recv().await.expect("first");
        let second = tokio::spawn({
            let bridge = bridge.clone();
            async move { bridge.call(call()).await }
        });
        sent.recv().await.expect("second");
        bridge.answer(json!({ "id": 2, "ok": true, "value": "two" }));
        bridge.answer(json!({ "id": 1, "ok": true, "value": "one" }));
        assert_eq!(first.await.expect("joined"), Ok(json!("one")));
        assert_eq!(second.await.expect("joined"), Ok(json!("two")));
    }

    #[tokio::test]
    async fn reports_failures_with_their_issues() {
        let (bridge, mut sent) = piped();
        let pending = tokio::spawn({
            let bridge = bridge.clone();
            async move { bridge.call(call()).await }
        });
        sent.recv().await.expect("a message");
        bridge.answer(json!({
            "id": 1,
            "ok": false,
            "error": { "message": "Invalid arguments for editing.apply", "issues": [{ "path": ["commands", 0], "message": "Required" }] }
        }));
        assert_eq!(
            pending.await.expect("joined"),
            Err(BridgeError::Failed(
                "Invalid arguments for editing.apply\n- commands.0: Required".into()
            ))
        );
    }

    #[tokio::test]
    async fn says_the_app_is_unavailable_when_nothing_takes_the_call() {
        let bridge = MessageBridge::new(|_| Err("no window".to_string()));
        assert!(matches!(
            bridge.call(call()).await,
            Err(BridgeError::Unavailable(message)) if message.contains("no window")
        ));
    }

    #[tokio::test]
    async fn gives_up_on_calls_nobody_answers() {
        let (bridge, _sent) = piped();
        let bridge = Arc::into_inner(bridge)
            .expect("only owner")
            .with_timeout(Duration::from_millis(20));
        assert!(matches!(
            bridge.call(call()).await,
            Err(BridgeError::Unavailable(_))
        ));
        assert!(
            !bridge.answer(json!({ "id": 1, "ok": true, "value": null })),
            "a late answer is dropped"
        );
    }
}
