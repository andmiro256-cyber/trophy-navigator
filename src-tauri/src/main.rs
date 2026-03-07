// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use tauri::{Manager, Runtime, Webview};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    rid: u32,
    current_version: String,
    version: String,
    date: Option<String>,
    body: Option<String>,
}

#[tauri::command]
async fn check_app_update<R: Runtime>(webview: Webview<R>) -> Result<Option<UpdateInfo>, String> {
    let updater = webview.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;

    let Some(update) = update else {
        return Ok(None);
    };

    let date = update
        .raw_json
        .get("pub_date")
        .and_then(|value| value.as_str())
        .map(str::to_owned);

    let current_version = update.current_version.clone();
    let version = update.version.clone();
    let body = update.body.clone();
    let rid = webview.resources_table().add(update);

    let info = UpdateInfo {
        rid,
        current_version,
        version,
        date,
        body,
    };

    Ok(Some(info))
}

#[tauri::command]
async fn install_app_update<R: Runtime>(webview: Webview<R>, rid: u32) -> Result<(), String> {
    let update = webview
        .resources_table()
        .get::<Update>(rid)
        .map_err(|e| e.to_string())?;
    let update = (*update).clone();
    let _ = webview.resources_table().close(rid);

    update
        .download_and_install(|_: usize, _: Option<u64>| {}, || {})
        .await
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            check_app_update,
            install_app_update
        ])
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
