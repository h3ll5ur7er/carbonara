//! The desktop shell: the web app (src/shells/tauri/main.tsx) in a native window, with storage in the app data
//! folder, native file dialogs, file associations, one running instance, and updates. The webview reaches it only
//! through the commands below; see docs/Architecture/Desktop.md.

mod dialogs;
mod opened;
mod storage;
mod updater;

use opened::{FileContents, OpenedFiles};
use std::path::Path;
use storage::Storages;
use tauri::{AppHandle, Emitter, Manager, State};

/// Tells the webview that files arrived; it takes them with `take_opened_files`.
const FILES_OPENED: &str = "files-opened";

type CommandResult<T> = Result<T, String>;

fn failed(error: impl std::fmt::Display) -> String {
    error.to_string()
}

// Storage commands run on the async runtime's threads (`async`), so reading and writing files never blocks the
// window's event loop.

#[tauri::command(async)]
fn storage_keys(storages: State<Storages>, storage: String) -> CommandResult<Vec<String>> {
    storages
        .open(&storage)
        .and_then(|storage| storage.keys())
        .map_err(failed)
}

#[tauri::command(async)]
fn storage_get(
    storages: State<Storages>,
    storage: String,
    key: String,
) -> CommandResult<Option<String>> {
    storages
        .open(&storage)
        .and_then(|storage| storage.get(&key))
        .map_err(failed)
}

#[tauri::command(async)]
fn storage_set(
    storages: State<Storages>,
    storage: String,
    key: String,
    value: String,
) -> CommandResult<()> {
    storages
        .open(&storage)
        .and_then(|storage| storage.set(&key, &value))
        .map_err(failed)
}

#[tauri::command(async)]
fn storage_delete(storages: State<Storages>, storage: String, key: String) -> CommandResult<()> {
    storages
        .open(&storage)
        .and_then(|storage| storage.delete(&key))
        .map_err(failed)
}

/// The files opened with the app since the last call: at launch, from a second launch, or from Finder.
#[tauri::command(async)]
fn take_opened_files(opened: State<OpenedFiles>) -> Vec<FileContents> {
    opened
        .take()
        .iter()
        .map(|path| opened::read(path))
        .collect()
}

/// Queues files opened with the app, tells the webview, and brings the window to the front.
fn receive(app: &AppHandle, paths: Vec<std::path::PathBuf>) {
    if paths.is_empty() {
        return;
    }
    app.state::<OpenedFiles>().push(paths);
    let _ = app.emit(FILES_OPENED, ());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        // First, so a second launch hands its files to this one and exits before it starts anything else.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            receive(app, opened::files_in_args(&args, Path::new(&cwd)));
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(OpenedFiles::default())
        .invoke_handler(tauri::generate_handler![
            storage_keys,
            storage_get,
            storage_set,
            storage_delete,
            take_opened_files,
            dialogs::open_file,
            dialogs::save_file,
        ])
        .setup(|app| {
            app.manage(Storages::new(storage::root(&app.path().app_data_dir()?)));

            let args: Vec<String> = std::env::args().collect();
            let cwd = std::env::current_dir().unwrap_or_default();
            app.state::<OpenedFiles>()
                .push(opened::files_in_args(&args, &cwd));

            // MCP server (CARB-60): start the `crates/mcp` server here, on 127.0.0.1 with the per-install token.
            // It forwards each tool call to the webview's connector as an ordinary manager call, so it needs the
            // `AppHandle` (to emit the call and receive the answer) and nothing else from this shell.
            // See docs/Architecture/Desktop.md, "MCP server".

            if updater::is_configured(&app.config().plugins) {
                updater::start(app.handle())?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("the desktop app's configuration is valid");

    app.run(|_app, _event| {
        // macOS hands files to a running app as an event instead of arguments.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = _event {
            let paths = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .filter(|path| opened::is_openable(path))
                .collect();
            receive(_app, paths);
        }
    });
}
