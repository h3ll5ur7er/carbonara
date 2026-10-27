//! Native open and save dialogs for the webview's `FileAccess` port (src/platforms/tauri/files.ts). The dialog
//! runs here and the file is read or written here, so the webview never names a path: it can only reach files
//! the person picked.

use crate::opened::{self, FileContents};
use serde::Deserialize;
use std::fs;
use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};

/// What a dialog offers, as `FileType` in src/contracts/platform.ts.
#[derive(Deserialize)]
pub struct FileType {
    description: String,
    extensions: Vec<String>,
}

fn dialog(
    app: &AppHandle,
    window: &WebviewWindow,
    file_type: &FileType,
) -> FileDialogBuilder<tauri::Wry> {
    let extensions: Vec<&str> = file_type.extensions.iter().map(String::as_str).collect();
    app.dialog()
        .file()
        .set_parent(window)
        .add_filter(&file_type.description, &extensions)
}

/// The picked file's name and contents; `None` when the person cancels.
#[tauri::command]
pub async fn open_file(
    app: AppHandle,
    window: WebviewWindow,
    file_type: FileType,
) -> Result<Option<FileContents>, String> {
    let dialog = dialog(&app, &window, &file_type);
    // Dialogs block until the person answers, so they wait off the async runtime's threads.
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_file())
        .await
        .map_err(|error| error.to_string())?;
    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|error| error.to_string())?;
    Ok(Some(opened::read(&path)))
}

/// Writes `bytes` where the person chooses, suggesting `name`; the saved file's name, or `None` when cancelled.
#[tauri::command]
pub async fn save_file(
    app: AppHandle,
    window: WebviewWindow,
    name: String,
    file_type: FileType,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    let dialog = dialog(&app, &window, &file_type).set_file_name(&name);
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_save_file())
        .await
        .map_err(|error| error.to_string())?;
    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|error| error.to_string())?;
    fs::write(&path, bytes).map_err(|error| format!("{}: {error}", path.display()))?;
    Ok(Some(path.file_name().map_or(name, |saved| {
        saved.to_string_lossy().into_owned()
    })))
}
