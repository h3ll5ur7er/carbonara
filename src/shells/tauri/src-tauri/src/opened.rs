//! Hides how files reach the app from the operating system: a double-click on a `.carbonara` or `.cpack`
//! starts the app with the file's path as an argument (Windows, Linux), hands it to the running app through the
//! single-instance plugin, or arrives as an "opened" event (macOS). Paths wait here until the webview takes them,
//! so a file opened before the web app is ready isn't lost.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// The extensions the app opens: factory documents and game packs.
const EXTENSIONS: [&str; 2] = ["carbonara", "cpack"];

/// The files among a command line's arguments (without the program itself), relative ones resolved against the
/// folder the command ran in.
pub fn files_in_args<S: AsRef<str>>(args: &[S], cwd: &Path) -> Vec<PathBuf> {
    args.iter()
        .map(|arg| Path::new(arg.as_ref()))
        .filter(|path| is_openable(path))
        .map(|path| cwd.join(path))
        .collect()
}

pub fn is_openable(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            EXTENSIONS
                .iter()
                .any(|known| known.eq_ignore_ascii_case(extension))
        })
}

/// The paths that arrived and haven't been taken yet.
#[derive(Default)]
pub struct OpenedFiles(Mutex<Vec<PathBuf>>);

impl OpenedFiles {
    pub fn push(&self, paths: impl IntoIterator<Item = PathBuf>) {
        self.lock().extend(paths);
    }

    /// Everything that arrived since the last call, in order.
    pub fn take(&self) -> Vec<PathBuf> {
        std::mem::take(&mut *self.lock())
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Vec<PathBuf>> {
        // A panic while holding the lock can't leave a Vec of paths inconsistent, so a poisoned lock is fine.
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// A file as the webview receives it: its name and contents, or why it couldn't be read.
#[derive(Debug, PartialEq, Serialize)]
#[serde(untagged)]
pub enum FileContents {
    Read { name: String, bytes: Vec<u8> },
    Failed { name: String, error: String },
}

pub fn read(path: &Path) -> FileContents {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    match fs::read(path) {
        Ok(bytes) => FileContents::Read { name, bytes },
        Err(error) => FileContents::Failed {
            name,
            error: error.to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_documents_and_packs_among_the_arguments() {
        let cwd = Path::new("/home/ada");
        let args = [
            "--flag",
            "Iron.carbonara",
            "/packs/satisfactory.cpack",
            "notes.txt",
            "SHOUTING.CPACK",
        ];
        assert_eq!(
            files_in_args(&args, cwd),
            [
                PathBuf::from("/home/ada/Iron.carbonara"),
                PathBuf::from("/packs/satisfactory.cpack"),
                PathBuf::from("/home/ada/SHOUTING.CPACK"),
            ]
        );
    }

    #[test]
    fn ignores_files_without_an_extension_it_opens() {
        assert!(!is_openable(Path::new("carbonara")));
        assert!(!is_openable(Path::new("factory.carbonara.json")));
        assert!(is_openable(Path::new("factory.json.carbonara")));
    }

    #[test]
    fn hands_out_each_opened_file_once_in_order() {
        let opened = OpenedFiles::default();
        opened.push([PathBuf::from("a.carbonara")]);
        opened.push([PathBuf::from("b.cpack")]);
        assert_eq!(
            opened.take(),
            [PathBuf::from("a.carbonara"), PathBuf::from("b.cpack")]
        );
        assert!(opened.take().is_empty());
    }

    #[test]
    fn reads_a_file_by_name_or_says_why_it_cannot() {
        let folder = tempfile::tempdir().expect("a temporary folder");
        let path = folder.path().join("Iron.carbonara");
        fs::write(&path, [1, 2, 3]).expect("written");
        assert_eq!(
            read(&path),
            FileContents::Read {
                name: "Iron.carbonara".into(),
                bytes: vec![1, 2, 3]
            }
        );
        let FileContents::Failed { name, .. } = read(&folder.path().join("gone.cpack")) else {
            panic!("a missing file was read");
        };
        assert_eq!(name, "gone.cpack");
    }
}
