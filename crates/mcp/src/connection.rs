//! Where the running app's MCP server is: a small file the app writes when the server starts and the stdio bridge
//! reads. Hides the file's format.

use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::token::write_private;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Connection {
    /// The Streamable HTTP endpoint, such as `http://127.0.0.1:41736/mcp`.
    pub url: String,
    pub token: String,
}

impl Connection {
    /// Readable by this user only: the file holds the token.
    pub fn write(&self, path: &Path) -> io::Result<()> {
        let json = serde_json::to_string_pretty(self).map_err(io::Error::other)?;
        write_private(path, &json)
    }

    pub fn read(path: &Path) -> io::Result<Self> {
        serde_json::from_str(&fs::read_to_string(path)?).map_err(io::Error::other)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_through_its_file() {
        let folder = tempfile::tempdir().expect("temp dir");
        let path = folder.path().join("mcp.json");
        let connection = Connection {
            url: "http://127.0.0.1:41736/mcp".into(),
            token: "abc".into(),
        };
        connection.write(&path).expect("written");
        assert_eq!(Connection::read(&path).expect("read"), connection);
    }
}
