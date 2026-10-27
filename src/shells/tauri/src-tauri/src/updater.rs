//! Hides how the desktop app updates itself: the Tauri updater checks the latest GitHub release on start, and
//! asks before it installs. Only release builds made by .github/workflows/release.yml carry the updater's
//! configuration (its public key and where to look), so local and CI builds never update.

use tauri::AppHandle;
use tauri::utils::config::PluginConfig;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

type Error = Box<dyn std::error::Error + Send + Sync>;

/// Whether this build was configured to update (the release workflow adds `plugins.updater`).
pub fn is_configured(plugins: &PluginConfig) -> bool {
    plugins.0.contains_key("updater")
}

/// Registers the updater and checks for an update in the background.
pub fn start(app: &AppHandle) -> tauri::Result<()> {
    app.plugin(tauri_plugin_updater::Builder::new().build())?;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Offline, or GitHub unreachable: try again next start.
        if let Err(error) = check(&app).await {
            eprintln!("Carbonara couldn't check for updates: {error}");
        }
    });
    Ok(())
}

async fn check(app: &AppHandle) -> Result<(), Error> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(());
    };
    let question = app
        .dialog()
        .message(format!(
            "Carbonara {} is available; you have {}. Install it and restart now? Your open factories are kept.",
            update.version, update.current_version
        ))
        .title("Update available")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install and restart".into(),
            "Later".into(),
        ));
    let install = tauri::async_runtime::spawn_blocking(move || question.blocking_show()).await?;
    if install {
        update.download_and_install(|_, _| {}, || {}).await?;
        app.restart();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn updates_only_builds_configured_for_it() {
        assert!(!is_configured(&PluginConfig(HashMap::new())));
        let configured = PluginConfig(HashMap::from([(
            "updater".to_string(),
            serde_json::json!({ "pubkey": "…", "endpoints": [] }),
        )]));
        assert!(is_configured(&configured));
    }
}
