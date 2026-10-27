//! Hides where the desktop app keeps durable key-value data: one folder per storage below the app data folder,
//! one file per key, holding the value as JSON text. The webview's `KeyValueStorage` port
//! (src/platforms/tauri/key-value.ts) reaches it through the `storage_*` commands, and the tests below are the
//! cases of src/contracts/platform.contract.ts.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// The app's storages, each a folder below `root`.
pub struct Storages {
    root: PathBuf,
}

impl Storages {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    /// The storage of that name. Names are chosen by the app (`carbonara-documents`), so anything that could
    /// leave the root (`..`, separators) is refused.
    pub fn open(&self, name: &str) -> io::Result<Storage> {
        let valid = !name.is_empty()
            && name
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
        if !valid {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("Not a storage name: {name:?}"),
            ));
        }
        Ok(Storage {
            folder: self.root.join(name),
        })
    }
}

/// One storage: a folder of `<key in hex>.json` files.
pub struct Storage {
    folder: PathBuf,
}

const EXTENSION: &str = ".json";

/// Makes each write's temporary file unique, so concurrent writes of one key never share one.
static WRITES: AtomicU64 = AtomicU64::new(0);

impl Storage {
    pub fn keys(&self) -> io::Result<Vec<String>> {
        let entries = match fs::read_dir(&self.folder) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(error),
        };
        let mut keys = Vec::new();
        for entry in entries {
            let name = entry?.file_name();
            // Unfinished writes (`*.tmp`) and anything else that isn't a key are not part of the storage.
            if let Some(key) = name
                .to_str()
                .and_then(|name| name.strip_suffix(EXTENSION))
                .and_then(decode)
            {
                keys.push(key);
            }
        }
        Ok(keys)
    }

    /// The stored JSON text, or `None` when the key isn't stored.
    pub fn get(&self, key: &str) -> io::Result<Option<String>> {
        match fs::read_to_string(self.path(key)) {
            Ok(value) => Ok(Some(value)),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error),
        }
    }

    /// Writes to a temporary file and renames it over the key's file, so a crash never leaves half a value.
    pub fn set(&self, key: &str, value: &str) -> io::Result<()> {
        fs::create_dir_all(&self.folder)?;
        let path = self.path(key);
        let write = WRITES.fetch_add(1, Ordering::Relaxed);
        let temporary = self.folder.join(format!(
            "{}.{}.{write}.tmp",
            encode(key),
            std::process::id()
        ));
        fs::write(&temporary, value)?;
        fs::rename(&temporary, &path).inspect_err(|_| {
            let _ = fs::remove_file(&temporary);
        })
    }

    /// Deleting a key that isn't stored is harmless.
    pub fn delete(&self, key: &str) -> io::Result<()> {
        match fs::remove_file(self.path(key)) {
            Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
            _ => Ok(()),
        }
    }

    fn path(&self, key: &str) -> PathBuf {
        self.folder.join(format!("{}{EXTENSION}", encode(key)))
    }
}

/// Keys become file names as lowercase hex of their UTF-8 bytes: any key is a valid, distinct file name on every
/// file system, including case-insensitive ones and Windows with its reserved names (`con`, `nul` …).
fn encode(key: &str) -> String {
    key.bytes().map(|byte| format!("{byte:02x}")).collect()
}

fn decode(name: &str) -> Option<String> {
    if !name.len().is_multiple_of(2) || !name.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let bytes = (0..name.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&name[index..index + 2], 16).ok())
        .collect::<Option<Vec<u8>>>()?;
    String::from_utf8(bytes).ok()
}

/// Where the storages live: below the app data folder, next to (not in) the webview's own `storage` folder.
pub fn root(app_data: &Path) -> PathBuf {
    app_data.join("key-value")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn backing() -> (tempfile::TempDir, Storages) {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let storages = Storages::new(root(folder.path()));
        (folder, storages)
    }

    fn open(storages: &Storages) -> Storage {
        storages.open("test").expect("a valid name")
    }

    fn sorted(mut keys: Vec<String>) -> Vec<String> {
        keys.sort();
        keys
    }

    #[test]
    fn reads_keys_that_were_never_stored_as_none() {
        let (_folder, storages) = backing();
        let storage = open(&storages);
        assert_eq!(storage.get("nothing").expect("readable"), None);
        assert!(storage.keys().expect("listable").is_empty());
    }

    #[test]
    fn returns_what_was_stored_overwriting_earlier_values() {
        let (_folder, storages) = backing();
        let storage = open(&storages);
        storage.set("doc", r#"{"name":"Iron"}"#).expect("written");
        storage.set("doc", r#"{"name":"Copper"}"#).expect("written");
        assert_eq!(
            storage.get("doc").expect("readable").as_deref(),
            Some(r#"{"name":"Copper"}"#)
        );
    }

    #[test]
    fn lists_the_stored_keys() {
        let (_folder, storages) = backing();
        let storage = open(&storages);
        storage.set("a", "1").expect("written");
        storage.set("b", "2").expect("written");
        assert_eq!(sorted(storage.keys().expect("listable")), ["a", "b"]);
    }

    #[test]
    fn forgets_deleted_keys_and_deleting_missing_keys_is_harmless() {
        let (_folder, storages) = backing();
        let storage = open(&storages);
        storage.set("a", "1").expect("written");
        storage.delete("a").expect("deleted");
        storage.delete("never").expect("harmless");
        assert_eq!(storage.get("a").expect("readable"), None);
        assert!(storage.keys().expect("listable").is_empty());
    }

    #[test]
    fn keeps_values_for_the_next_session() {
        let (_folder, storages) = backing();
        open(&storages).set("doc", "{}").expect("written");
        assert_eq!(
            open(&storages).get("doc").expect("readable").as_deref(),
            Some("{}")
        );
    }

    #[test]
    fn stores_keys_with_any_characters_apart() {
        let (_folder, storages) = backing();
        let storage = open(&storages);
        let keys = [
            "info/satisfactory",
            "../escape",
            "con",
            "Iron",
            "iron",
            "",
            "Eisenbarren ⚙",
        ];
        for (index, key) in keys.iter().enumerate() {
            storage.set(key, &index.to_string()).expect("written");
        }
        for (index, key) in keys.iter().enumerate() {
            assert_eq!(storage.get(key).expect("readable"), Some(index.to_string()));
        }
        assert_eq!(
            sorted(storage.keys().expect("listable")),
            sorted(keys.map(String::from).to_vec())
        );
    }

    #[test]
    fn keeps_storages_apart() {
        let (_folder, storages) = backing();
        storages
            .open("documents")
            .and_then(|storage| storage.set("a", "1"))
            .expect("written");
        let packs = storages.open("packs").expect("a valid name");
        assert_eq!(packs.get("a").expect("readable"), None);
    }

    #[test]
    fn refuses_storage_names_that_could_leave_the_folder() {
        let (_folder, storages) = backing();
        for name in ["", "..", "a/b", "a\\b", "Documents"] {
            assert!(storages.open(name).is_err(), "{name:?} was accepted");
        }
    }

    #[test]
    fn ignores_unfinished_writes() {
        let (_folder, storages) = backing();
        let storage = open(&storages);
        storage.set("a", "1").expect("written");
        fs::write(storage.folder.join("61.1.2.tmp"), "half").expect("written");
        assert_eq!(storage.keys().expect("listable"), ["a"]);
    }
}
