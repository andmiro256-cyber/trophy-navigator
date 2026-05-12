// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::io::Read;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime, Url, Webview, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_updater::{Update, UpdaterExt};

const MAX_TILE_BYTES: u64 = 2 * 1024 * 1024;

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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    downloaded: usize,
    total: Option<u64>,
}

#[tauri::command]
async fn install_app_update<R: Runtime>(webview: Webview<R>, rid: u32) -> Result<(), String> {
    let update = webview
        .resources_table()
        .get::<Update>(rid)
        .map_err(|e| e.to_string())?;
    let update = (*update).clone();
    let _ = webview.resources_table().close(rid);

    let webview_clone = webview.clone();
    update
        .download_and_install(
            move |downloaded: usize, total: Option<u64>| {
                let _ =
                    webview_clone.emit("update-progress", DownloadProgress { downloaded, total });
            },
            || {},
        )
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

#[tauri::command]
fn open_map_viewer<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    title: String,
) -> Result<(), String> {
    let parsed_url = parse_map_viewer_url(&url)?;
    let title = sanitize_map_viewer_title(&title);

    if let Some(viewer) = app.get_webview_window("map_viewer") {
        viewer.navigate(parsed_url).map_err(|e| e.to_string())?;
        let _ = viewer.set_title(&title);
        let _ = viewer.show();
        let _ = viewer.set_focus();
        return Ok(());
    }

    let width = 560.0;
    let height = 430.0;
    let (x, y) = map_viewer_position(&app, width, height);

    let viewer = WebviewWindowBuilder::new(&app, "map_viewer", WebviewUrl::External(parsed_url))
        .title(title)
        .inner_size(width, height)
        .min_inner_size(360.0, 260.0)
        .position(x, y)
        .resizable(true)
        .prevent_overflow()
        .build()
        .map_err(|e| e.to_string())?;

    let _ = viewer.set_focus();
    Ok(())
}

#[tauri::command]
async fn fetch_tile_bytes(url: String) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_tile_bytes_blocking(&url))
        .await
        .map_err(|e| e.to_string())?
}

fn fetch_tile_bytes_blocking(raw_url: &str) -> Result<Vec<u8>, String> {
    let parsed = Url::parse(raw_url).map_err(|_| "Некорректный URL тайла".to_string())?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("Разрешены только http/https тайлы".to_string()),
    }

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(8))
        .timeout_read(Duration::from_secs(15))
        .build();

    let response = agent
        .get(raw_url)
        .set("User-Agent", "TrophyNavigator/0.9 tile-cache")
        .set(
            "Accept",
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        )
        .call()
        .map_err(|e| e.to_string())?;

    if !(200..300).contains(&response.status()) {
        return Err(format!("HTTP {}", response.status()));
    }

    let mut bytes = Vec::new();
    let mut reader = response.into_reader().take(MAX_TILE_BYTES + 1);
    reader.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_TILE_BYTES {
        return Err("Тайл слишком большой".to_string());
    }
    Ok(bytes)
}

fn parse_map_viewer_url(raw_url: &str) -> Result<Url, String> {
    let url = Url::parse(raw_url).map_err(|_| "Некорректная ссылка карты".to_string())?;
    match url.scheme() {
        "http" | "https" => {}
        _ => return Err("Разрешены только http/https ссылки".to_string()),
    }

    let host = url
        .host_str()
        .ok_or_else(|| "В ссылке карты нет домена".to_string())?
        .to_ascii_lowercase();

    if is_allowed_map_host(&host) {
        Ok(url)
    } else {
        Err("Можно открыть только Google/Yandex карты".to_string())
    }
}

fn is_allowed_map_host(host: &str) -> bool {
    host == "yandex.ru"
        || host.ends_with(".yandex.ru")
        || host == "yandex.com"
        || host.ends_with(".yandex.com")
        || host == "yandex.eu"
        || host.ends_with(".yandex.eu")
        || host == "google.com"
        || host.ends_with(".google.com")
        || host == "google.ru"
        || host.ends_with(".google.ru")
        || host == "maps.google.com"
}

fn sanitize_map_viewer_title(title: &str) -> String {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        "Карта точки".to_string()
    } else {
        trimmed.chars().take(80).collect()
    }
}

fn map_viewer_position<R: Runtime>(app: &AppHandle<R>, width: f64, height: f64) -> (f64, f64) {
    let monitor = app.get_webview_window("main").and_then(|window| {
        window
            .current_monitor()
            .ok()
            .flatten()
            .or_else(|| window.primary_monitor().ok().flatten())
    });

    if let Some(monitor) = monitor {
        let work_area = monitor.work_area();
        let scale = monitor.scale_factor().max(1.0);
        let margin = 24.0;
        let available_width = work_area.size.width as f64 / scale;
        let x_margin = if available_width > width + margin * 2.0 {
            margin
        } else {
            0.0
        };
        let x = work_area.position.x as f64 / scale + x_margin;
        let y = work_area.position.y as f64 / scale
            + (work_area.size.height as f64 / scale - height - margin).max(margin);
        (x, y)
    } else {
        (24.0, 120.0)
    }
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
        .args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\Cryptography",
            "/v",
            "MachineGuid",
        ])
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
            open_map_viewer,
            fetch_tile_bytes,
            get_hardware_id
        ])
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
