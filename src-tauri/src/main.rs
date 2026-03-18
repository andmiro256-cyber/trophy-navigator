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

/// Получить аппаратный ID машины для привязки лицензии.
/// Windows: MachineGuid из реестра (уникален для каждой установки)
/// Linux: /etc/machine-id (уникален для системы)
/// Результат — детерминистичный хэш (стабилен между версиями Rust).
#[tauri::command]
fn get_hardware_id() -> Result<String, String> {
    let raw_id = get_raw_machine_id().map_err(|e| e.to_string())?;
    // FNV-1a 64-bit — детерминистичный, стабильный между версиями
    let h1 = fnv1a_64(raw_id.as_bytes());
    let salted = format!("TND-SALT-{}-{}", raw_id, h1);
    let h2 = fnv1a_64(salted.as_bytes());
    Ok(format!(
        "HW-{:08X}{:08X}",
        ((h1 >> 32) as u32) ^ ((h2 & 0xFFFFFFFF) as u32),
        ((h1 & 0xFFFFFFFF) as u32) ^ ((h2 >> 32) as u32)
    ))
}

/// FNV-1a 64-bit hash — стабильный, детерминистичный, не зависит от версии Rust.
fn fnv1a_64(data: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[cfg(target_os = "windows")]
fn get_raw_machine_id() -> Result<String, Box<dyn std::error::Error>> {
    // Читаем MachineGuid из реестра Windows
    use std::process::Command;
    let output = Command::new("reg")
        .args(["query", r"HKLM\SOFTWARE\Microsoft\Cryptography", "/v", "MachineGuid"])
        .output()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    // Парсим "MachineGuid    REG_SZ    xxxxxxxx-xxxx-..."
    for line in stdout.lines() {
        if line.contains("MachineGuid") {
            if let Some(guid) = line.split_whitespace().last() {
                return Ok(guid.to_string());
            }
        }
    }
    Err("MachineGuid not found in registry".into())
}

#[cfg(target_os = "linux")]
fn get_raw_machine_id() -> Result<String, Box<dyn std::error::Error>> {
    let id = std::fs::read_to_string("/etc/machine-id")?;
    Ok(id.trim().to_string())
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn get_raw_machine_id() -> Result<String, Box<dyn std::error::Error>> {
    // macOS: IOPlatformSerialNumber через system_profiler или fallback
    let output = std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.contains("IOPlatformUUID") {
            if let Some(uuid) = line.split('"').nth(3) {
                return Ok(uuid.to_string());
            }
        }
    }
    Err("Platform UUID not found".into())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            check_app_update,
            install_app_update,
            get_hardware_id
        ])
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
