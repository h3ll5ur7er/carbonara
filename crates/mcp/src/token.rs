//! The per-install bearer token MCP clients must present. Hides how it's made, stored and compared.

use std::fmt;
use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::sync::Arc;

#[derive(Clone, PartialEq, Eq)]
pub struct Token(Arc<str>);

impl Token {
    /// 256 random bits, hex-encoded.
    pub fn generate() -> io::Result<Self> {
        let mut bytes = [0u8; 32];
        getrandom::fill(&mut bytes).map_err(|error| io::Error::other(error.to_string()))?;
        let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
        Ok(Self(hex.into()))
    }

    /// The token stored at `path`; on first use, a new one, written there readable by this user only.
    pub fn load_or_create(path: &Path) -> io::Result<Self> {
        match fs::read_to_string(path) {
            Ok(text) if !text.trim().is_empty() => return Ok(Self(text.trim().into())),
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        let token = Self::generate()?;
        write_private(path, token.as_str())?;
        Ok(token)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Whether `presented` is this token, in time that doesn't depend on where they differ.
    pub fn matches(&self, presented: &str) -> bool {
        let (expected, presented) = (self.0.as_bytes(), presented.as_bytes());
        expected.len() == presented.len()
            && expected
                .iter()
                .zip(presented)
                .fold(0u8, |difference, (a, b)| difference | (a ^ b))
                == 0
    }
}

impl From<&str> for Token {
    fn from(text: &str) -> Self {
        Self(text.into())
    }
}

/// Never prints the secret, so tokens can't leak into logs.
impl fmt::Debug for Token {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Token(…)")
    }
}

/// Writes a file only this user may read: it holds the token.
pub(crate) fn write_private(path: &Path, contents: &str) -> io::Result<()> {
    if let Some(folder) = path.parent() {
        fs::create_dir_all(folder)?;
    }
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut file = options.open(path)?;
    file.write_all(contents.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn makes_a_long_random_token_once_and_keeps_it() {
        let folder = tempfile::tempdir().expect("temp dir");
        let path = folder.path().join("config").join("mcp-token");
        let token = Token::load_or_create(&path).expect("created");
        assert_eq!(token.as_str().len(), 64);
        assert_eq!(Token::load_or_create(&path).expect("loaded"), token);
        assert_ne!(Token::generate().expect("generated"), token);
    }

    #[cfg(unix)]
    #[test]
    fn stores_the_token_for_this_user_only() {
        use std::os::unix::fs::PermissionsExt;
        let folder = tempfile::tempdir().expect("temp dir");
        let path = folder.path().join("mcp-token");
        Token::load_or_create(&path).expect("created");
        let mode = fs::metadata(&path).expect("metadata").permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[test]
    fn matches_only_the_exact_token() {
        let token = Token::from("abc123");
        assert!(token.matches("abc123"));
        assert!(!token.matches("abc124"));
        assert!(!token.matches("abc12"));
        assert!(!token.matches(""));
    }

    #[test]
    fn keeps_the_secret_out_of_debug_output() {
        assert_eq!(format!("{:?}", Token::from("secret")), "Token(…)");
    }
}
