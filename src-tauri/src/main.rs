// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime, Url, Webview, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_updater::{Update, UpdaterExt};

const MAX_TILE_BYTES: u64 = 2 * 1024 * 1024;
const OFFLINE_DOWNLOAD_BATCH_SIZE: u64 = 250;
static OFFLINE_DOWNLOAD_CANCELLED: AtomicBool = AtomicBool::new(false);

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
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
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
    let agent = tile_fetch_agent();
    fetch_tile_bytes_with_agent(&agent, raw_url)
}

fn tile_fetch_agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(8))
        .timeout_read(Duration::from_secs(15))
        .build()
}

fn fetch_tile_bytes_with_agent(agent: &ureq::Agent, raw_url: &str) -> Result<Vec<u8>, String> {
    let parsed = Url::parse(raw_url).map_err(|_| "Некорректный URL тайла".to_string())?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("Разрешены только http/https тайлы".to_string()),
    }

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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfflineDownloadRequest {
    path: String,
    url_template: String,
    subdomains: Vec<String>,
    tms: bool,
    format: String,
    z_min: i32,
    z_max: i32,
    ranges: Vec<OfflineDownloadRange>,
    polygon: Option<Vec<OfflineDownloadPoint>>,
    total: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfflineDownloadRange {
    z: i32,
    x_min: i64,
    x_max: i64,
    y_min: i64,
    y_max: i64,
}

#[derive(Deserialize)]
struct OfflineDownloadPoint {
    lat: f64,
    lng: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OfflineDownloadProgress {
    done: u64,
    total: u64,
    saved: u64,
    errors: u64,
    bytes: u64,
    finished: bool,
    aborted: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OfflineDownloadResult {
    done: u64,
    total: u64,
    saved: u64,
    errors: u64,
    bytes: u64,
    aborted: bool,
}

#[tauri::command]
fn cancel_offline_map_download() {
    OFFLINE_DOWNLOAD_CANCELLED.store(true, Ordering::SeqCst);
}

#[tauri::command]
async fn download_offline_map<R: Runtime>(
    app: AppHandle<R>,
    request: OfflineDownloadRequest,
) -> Result<OfflineDownloadResult, String> {
    OFFLINE_DOWNLOAD_CANCELLED.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || download_offline_map_blocking(app, request))
        .await
        .map_err(|e| e.to_string())?
}

fn download_offline_map_blocking<R: Runtime>(
    app: AppHandle<R>,
    request: OfflineDownloadRequest,
) -> Result<OfflineDownloadResult, String> {
    validate_offline_download_request(&request)?;
    prepare_offline_download_target(&request.path)?;

    let conn = create_offline_download_db(&request)?;
    let agent = tile_fetch_agent();
    let polygon = request.polygon.as_deref();
    let mut done = 0_u64;
    let mut saved = 0_u64;
    let mut errors = 0_u64;
    let mut bytes_total = 0_u64;
    let mut batch_pending = 0_u64;
    let mut aborted = false;

    conn.execute_batch("BEGIN IMMEDIATE")
        .map_err(|e| e.to_string())?;

    'download: for range in &request.ranges {
        for x in range.x_min..=range.x_max {
            for y in range.y_min..=range.y_max {
                if OFFLINE_DOWNLOAD_CANCELLED.load(Ordering::SeqCst) {
                    aborted = true;
                    break 'download;
                }

                if let Some(points) = polygon {
                    let lat = tile_to_lat_fraction(y as f64 + 0.5, range.z);
                    let lng = tile_to_lng_fraction(x as f64 + 0.5, range.z);
                    if !point_in_polygon(lat, lng, points) {
                        continue;
                    }
                }

                let url = build_download_tile_url(&request, x, y, range.z)?;
                match fetch_tile_bytes_with_agent(&agent, &url) {
                    Ok(bytes) => {
                        let stored_z = stored_download_zoom(&request.format, range.z);
                        let byte_len = bytes.len() as u64;
                        conn.execute(
                            "INSERT OR IGNORE INTO tiles VALUES (?,?,?,?,?)",
                            params![x, y, stored_z, 0_i32, bytes.as_slice()],
                        )
                        .map_err(|e| e.to_string())?;
                        saved += 1;
                        bytes_total += byte_len;
                        batch_pending += 1;
                    }
                    Err(_) => {
                        errors += 1;
                    }
                }

                done += 1;

                if batch_pending >= OFFLINE_DOWNLOAD_BATCH_SIZE {
                    conn.execute_batch("COMMIT; BEGIN IMMEDIATE")
                        .map_err(|e| e.to_string())?;
                    batch_pending = 0;
                }

                if done % 10 == 0 || done == request.total {
                    emit_offline_download_progress(
                        &app,
                        done,
                        request.total,
                        saved,
                        errors,
                        bytes_total,
                        false,
                        false,
                    );
                }
            }
        }
    }

    conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;");

    emit_offline_download_progress(
        &app,
        done,
        request.total,
        saved,
        errors,
        bytes_total,
        true,
        aborted,
    );

    Ok(OfflineDownloadResult {
        done,
        total: request.total,
        saved,
        errors,
        bytes: bytes_total,
        aborted,
    })
}

fn validate_offline_download_request(request: &OfflineDownloadRequest) -> Result<(), String> {
    if request.path.trim().is_empty() {
        return Err("Не выбран путь сохранения".to_string());
    }
    if request.url_template.trim().is_empty() {
        return Err("У слоя нет URL шаблона для скачивания".to_string());
    }
    if request.ranges.is_empty() || request.total == 0 {
        return Err("В выбранной области нет тайлов".to_string());
    }
    if request.z_min > request.z_max {
        return Err("Некорректный диапазон zoom".to_string());
    }
    if request.z_min < 0 || request.z_max > 30 {
        return Err("Zoom вне поддерживаемого диапазона".to_string());
    }
    for range in &request.ranges {
        if range.z < request.z_min
            || range.z > request.z_max
            || range.x_min > range.x_max
            || range.y_min > range.y_max
            || range.x_min < 0
            || range.y_min < 0
        {
            return Err("Некорректный диапазон тайлов".to_string());
        }
    }
    Ok(())
}

fn prepare_offline_download_target(path: &str) -> Result<(), String> {
    let target = Path::new(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Не удалось создать папку карты: {e}"))?;
    }
    match fs::remove_file(target) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("Не удалось заменить старый файл карты: {e}")),
    }
    let _ = fs::remove_file(format!("{path}-wal"));
    let _ = fs::remove_file(format!("{path}-shm"));
    Ok(())
}

fn create_offline_download_db(request: &OfflineDownloadRequest) -> Result<Connection, String> {
    let conn = Connection::open(&request.path)
        .map_err(|e| format!("Не удалось создать SQLite карту: {e}"))?;
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    conn.execute_batch(
        "
        PRAGMA journal_mode=DELETE;
        PRAGMA synchronous=NORMAL;
        PRAGMA temp_store=MEMORY;
        CREATE TABLE tiles (x INTEGER, y INTEGER, z INTEGER, s INTEGER, image BLOB, PRIMARY KEY (x,y,z,s));
        CREATE TABLE info (minzoom INTEGER, maxzoom INTEGER);
        ",
    )
    .map_err(|e| e.to_string())?;

    let info_min = if request.format == "locus" {
        stored_download_zoom(&request.format, request.z_max)
    } else {
        stored_download_zoom(&request.format, request.z_min)
    };
    let info_max = if request.format == "locus" {
        stored_download_zoom(&request.format, request.z_min)
    } else {
        stored_download_zoom(&request.format, request.z_max)
    };
    conn.execute(
        "INSERT INTO info VALUES (?, ?)",
        params![info_min, info_max],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn stored_download_zoom(format: &str, z: i32) -> i32 {
    if format == "locus" {
        17 - z
    } else {
        z
    }
}

fn emit_offline_download_progress<R: Runtime>(
    app: &AppHandle<R>,
    done: u64,
    total: u64,
    saved: u64,
    errors: u64,
    bytes: u64,
    finished: bool,
    aborted: bool,
) {
    let _ = app.emit(
        "offline-download-progress",
        OfflineDownloadProgress {
            done,
            total,
            saved,
            errors,
            bytes,
            finished,
            aborted,
        },
    );
}

fn build_download_tile_url(
    request: &OfflineDownloadRequest,
    x: i64,
    y: i64,
    z: i32,
) -> Result<String, String> {
    let final_y = if request.tms {
        tile_matrix_size(z).ok_or_else(|| "Некорректный zoom тайла".to_string())?
            - 1
            - y
    } else {
        y
    };
    let subdomain = pick_download_subdomain(&request.subdomains, x, y, z);
    let quadkey = if request.url_template.contains("{q}") {
        bing_quad_key(x, y, z)
    } else {
        String::new()
    };
    Ok(request
        .url_template
        .replace("{x}", &x.to_string())
        .replace("{y}", &final_y.to_string())
        .replace("{z}", &z.to_string())
        .replace("{s}", &subdomain)
        .replace("{q}", &quadkey))
}

fn pick_download_subdomain(subdomains: &[String], x: i64, y: i64, z: i32) -> String {
    if subdomains.is_empty() {
        return String::new();
    }
    let idx = ((x * 31 + y * 17 + z as i64).unsigned_abs() as usize) % subdomains.len();
    subdomains[idx].clone()
}

fn bing_quad_key(x: i64, y: i64, z: i32) -> String {
    let mut quadkey = String::with_capacity(z.max(0) as usize);
    for i in (1..=z).rev() {
        let mask = 1_i64 << (i - 1);
        let mut digit = 0_u8;
        if (x & mask) != 0 {
            digit += 1;
        }
        if (y & mask) != 0 {
            digit += 2;
        }
        quadkey.push(char::from(b'0' + digit));
    }
    quadkey
}

fn tile_to_lng_fraction(x: f64, z: i32) -> f64 {
    x / tile_matrix_size(z).unwrap_or(1) as f64 * 360.0 - 180.0
}

fn tile_to_lat_fraction(y: f64, z: i32) -> f64 {
    let n = std::f64::consts::PI
        - 2.0 * std::f64::consts::PI * y / tile_matrix_size(z).unwrap_or(1) as f64;
    n.sinh().atan().to_degrees()
}

fn point_in_polygon(lat: f64, lng: f64, polygon: &[OfflineDownloadPoint]) -> bool {
    if polygon.len() < 3 {
        return true;
    }
    let mut inside = false;
    let mut j = polygon.len() - 1;
    for i in 0..polygon.len() {
        let yi = polygon[i].lat;
        let xi = polygon[i].lng;
        let yj = polygon[j].lat;
        let xj = polygon[j].lng;
        if ((yi > lat) != (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
        j = i;
    }
    inside
}

#[derive(Clone, Copy)]
enum OfflineMapFormat {
    RMaps,
    MBTiles,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OfflineMapInfo {
    format: String,
    min_zoom: i32,
    max_zoom: i32,
    mime: String,
    bounds: Option<[f64; 4]>,
    inverted: bool,
    scheme: String,
}

struct OfflineTileSource {
    format: OfflineMapFormat,
    min_zoom: i32,
    max_zoom: i32,
    mime: String,
    bounds: Option<[f64; 4]>,
    inverted: bool,
    mbtiles_tms: bool,
}

#[tauri::command]
async fn inspect_offline_map(path: String) -> Result<OfflineMapInfo, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_offline_map_blocking(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_offline_tile(
    path: String,
    x: i64,
    y: i64,
    z: i64,
) -> Result<tauri::ipc::Response, String> {
    let bytes =
        tauri::async_runtime::spawn_blocking(move || read_offline_tile_blocking(&path, x, y, z))
            .await
            .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes.unwrap_or_default()))
}

fn inspect_offline_map_blocking(path: &str) -> Result<OfflineMapInfo, String> {
    let conn = open_offline_map_db(path)?;
    let source = detect_offline_tile_source(&conn)?;
    Ok(OfflineMapInfo {
        format: match source.format {
            OfflineMapFormat::RMaps => "rmaps".to_string(),
            OfflineMapFormat::MBTiles => "mbtiles".to_string(),
        },
        min_zoom: source.min_zoom,
        max_zoom: source.max_zoom,
        mime: source.mime,
        bounds: source.bounds,
        inverted: source.inverted,
        scheme: if source.mbtiles_tms {
            "tms".to_string()
        } else {
            "xyz".to_string()
        },
    })
}

fn read_offline_tile_blocking(
    path: &str,
    x: i64,
    y: i64,
    z: i64,
) -> Result<Option<Vec<u8>>, String> {
    let conn = open_offline_map_db(path)?;
    let source = detect_offline_tile_source(&conn)?;
    let data = match source.format {
        OfflineMapFormat::RMaps => query_rmaps_tile(&conn, &source, x, y, z)?,
        OfflineMapFormat::MBTiles => query_mbtiles_tile(&conn, &source, x, y, z)?,
    };
    Ok(data.filter(|bytes| is_supported_raster_tile_data(bytes)))
}

fn open_offline_map_db(path: &str) -> Result<Connection, String> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Не удалось открыть SQLite карту: {e}"))?;
    let _ = conn.busy_timeout(Duration::from_secs(2));
    let _ = conn.pragma_update(None, "cache_size", -4096);
    let _ = conn.pragma_update(None, "mmap_size", 268_435_456_i64);
    Ok(conn)
}

fn detect_offline_tile_source(conn: &Connection) -> Result<OfflineTileSource, String> {
    let cols = offline_table_columns(conn, "tiles")?;
    if cols.contains("zoom_level")
        && cols.contains("tile_column")
        && cols.contains("tile_row")
        && cols.contains("tile_data")
    {
        return detect_mbtiles_source(conn);
    }
    if cols.contains("x") && cols.contains("y") && cols.contains("z") && cols.contains("image") {
        return detect_rmaps_source(conn);
    }
    Err("Неизвестная структура SQLite/MBTiles".to_string())
}

fn offline_table_columns(conn: &Connection, table: &str) -> Result<HashSet<String>, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?;
    let mut cols = HashSet::new();
    for row in rows {
        cols.insert(row.map_err(|e| e.to_string())?.to_ascii_lowercase());
    }
    Ok(cols)
}

fn detect_mbtiles_source(conn: &Connection) -> Result<OfflineTileSource, String> {
    let metadata_scheme = metadata_value(conn, "scheme").unwrap_or_default();
    let mbtiles_tms = metadata_scheme.to_ascii_lowercase() != "xyz";
    let metadata_format = metadata_value(conn, "format").unwrap_or_default();
    let mut mime = match metadata_format.to_ascii_lowercase().as_str() {
        value if value.contains("jpg") || value.contains("jpeg") => "image/jpeg".to_string(),
        value if value.contains("webp") => "image/webp".to_string(),
        _ => "image/png".to_string(),
    };
    if let Some(sample) = sample_tile_data(conn, OfflineMapFormat::MBTiles)? {
        if !is_supported_raster_tile_data(&sample) {
            return Err("Векторные MBTiles пока не поддерживаются".to_string());
        }
        mime = detect_mime(&sample).to_string();
    }

    let min_zoom = metadata_value(conn, "minzoom")
        .and_then(|v| v.parse::<i32>().ok())
        .or_else(|| {
            query_i32(conn, "SELECT MIN(zoom_level) FROM tiles")
                .ok()
                .flatten()
        })
        .unwrap_or(1);
    let max_zoom = metadata_value(conn, "maxzoom")
        .and_then(|v| v.parse::<i32>().ok())
        .or_else(|| {
            query_i32(conn, "SELECT MAX(zoom_level) FROM tiles")
                .ok()
                .flatten()
        })
        .unwrap_or(18);

    Ok(OfflineTileSource {
        format: OfflineMapFormat::MBTiles,
        min_zoom,
        max_zoom,
        mime,
        bounds: mbtiles_bounds(conn, mbtiles_tms).ok().flatten(),
        inverted: false,
        mbtiles_tms,
    })
}

fn detect_rmaps_source(conn: &Connection) -> Result<OfflineTileSource, String> {
    if let Some(sample) = sample_tile_data(conn, OfflineMapFormat::RMaps)? {
        if !is_supported_raster_tile_data(&sample) {
            return Err("Файл не похож на растровую SQLite-карту".to_string());
        }
    }
    let (min_stored, max_stored) =
        query_i32_pair(conn, "SELECT MIN(z), MAX(z) FROM tiles")?.unwrap_or((1, 18));
    let inverted = detect_rmaps_inverted(conn).unwrap_or(true);
    let (min_zoom, max_zoom) = if inverted {
        (17 - max_stored, 17 - min_stored)
    } else {
        (min_stored, max_stored)
    };

    Ok(OfflineTileSource {
        format: OfflineMapFormat::RMaps,
        min_zoom: min_zoom.clamp(0, 30),
        max_zoom: max_zoom.clamp(0, 30),
        mime: sample_tile_data(conn, OfflineMapFormat::RMaps)?
            .as_deref()
            .map(detect_mime)
            .unwrap_or("image/png")
            .to_string(),
        bounds: rmaps_bounds(conn, inverted).ok().flatten(),
        inverted,
        mbtiles_tms: false,
    })
}

fn metadata_value(conn: &Connection, name: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM metadata WHERE lower(name)=lower(?) LIMIT 1",
        [name],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
}

fn query_i32(conn: &Connection, sql: &str) -> Result<Option<i32>, String> {
    conn.query_row(sql, [], |row| row.get::<_, Option<i32>>(0))
        .map_err(|e| e.to_string())
}

fn query_i32_pair(conn: &Connection, sql: &str) -> Result<Option<(i32, i32)>, String> {
    conn.query_row(sql, [], |row| {
        let a = row.get::<_, Option<i32>>(0)?;
        let b = row.get::<_, Option<i32>>(1)?;
        Ok(a.zip(b))
    })
    .map_err(|e| e.to_string())
}

fn sample_tile_data(
    conn: &Connection,
    format: OfflineMapFormat,
) -> Result<Option<Vec<u8>>, String> {
    let sql = match format {
        OfflineMapFormat::RMaps => "SELECT image FROM tiles LIMIT 1",
        OfflineMapFormat::MBTiles => "SELECT tile_data FROM tiles LIMIT 1",
    };
    conn.query_row(sql, [], |row| row.get::<_, Vec<u8>>(0))
        .optional()
        .map_err(|e| e.to_string())
}

fn detect_rmaps_inverted(conn: &Connection) -> Result<bool, String> {
    let mut stmt = conn
        .prepare("SELECT z, MAX(x), MAX(y) FROM tiles GROUP BY z ORDER BY z")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let z = row.get::<_, i32>(0)?;
            let max_x = row.get::<_, i64>(1)?;
            let max_y = row.get::<_, i64>(2)?;
            Ok((z, max_x.max(max_y)))
        })
        .map_err(|e| e.to_string())?;
    let stats: Result<Vec<_>, _> = rows.collect();
    let stats = stats.map_err(|e| e.to_string())?;

    if stats.is_empty() {
        return Ok(true);
    }
    if stats.len() == 1 {
        let (stored_z, max_coord) = stats[0];
        let fits_normal = max_coord < tile_matrix_size(stored_z).unwrap_or(0);
        let fits_inverted = max_coord < tile_matrix_size((17 - stored_z).max(0)).unwrap_or(0);
        return Ok(match (fits_normal, fits_inverted) {
            (true, false) => false,
            (false, true) => true,
            _ => true,
        });
    }
    Ok(stats.last().map(|(_, max)| *max).unwrap_or(0)
        < stats.first().map(|(_, max)| *max).unwrap_or(0))
}

fn tile_matrix_size(z: i32) -> Option<i64> {
    if !(0..=30).contains(&z) {
        return None;
    }
    Some(1_i64 << z)
}

fn mbtiles_bounds(conn: &Connection, tms_y: bool) -> Result<Option<[f64; 4]>, String> {
    if let Some(raw_bounds) = metadata_value(conn, "bounds") {
        let parts: Vec<f64> = raw_bounds
            .split(',')
            .filter_map(|part| part.trim().parse::<f64>().ok())
            .collect();
        if parts.len() == 4 {
            return Ok(Some([parts[3], parts[1], parts[2], parts[0]])); // north, south, east, west
        }
    }
    let max_zoom = query_i32(conn, "SELECT MAX(zoom_level) FROM tiles")?.unwrap_or(0);
    bounds_from_tile_range(
        conn,
        max_zoom,
        max_zoom,
        "tile_column",
        "tile_row",
        "zoom_level",
        tms_y,
    )
}

fn rmaps_bounds(conn: &Connection, inverted: bool) -> Result<Option<[f64; 4]>, String> {
    let stored_min = query_i32(conn, "SELECT MIN(z) FROM tiles")?.unwrap_or(0);
    let actual_z = if inverted {
        17 - stored_min
    } else {
        stored_min
    };
    bounds_from_tile_range(conn, stored_min, actual_z, "x", "y", "z", false)
}

fn bounds_from_tile_range(
    conn: &Connection,
    stored_z: i32,
    actual_z: i32,
    x_col: &str,
    y_col: &str,
    z_col: &str,
    tms_y: bool,
) -> Result<Option<[f64; 4]>, String> {
    let n = tile_matrix_size(actual_z).ok_or_else(|| "Некорректный zoom карты".to_string())? as f64;
    let sql = format!(
        "SELECT MIN({x_col}), MAX({x_col}), MIN({y_col}), MAX({y_col}) FROM tiles WHERE {z_col}=?"
    );
    let range: Option<(i64, i64, i64, i64)> = conn
        .query_row(sql.as_str(), [stored_z], |row| {
            let min_x = row.get::<_, Option<i64>>(0)?;
            let max_x = row.get::<_, Option<i64>>(1)?;
            let min_y = row.get::<_, Option<i64>>(2)?;
            let max_y = row.get::<_, Option<i64>>(3)?;
            Ok(match (min_x, max_x, min_y, max_y) {
                (Some(a), Some(b), Some(c), Some(d)) => Some((a, b, c, d)),
                _ => None,
            })
        })
        .map_err(|e| e.to_string())?;

    let Some((min_x, max_x, min_y, max_y)) = range else {
        return Ok(None);
    };

    let west = min_x as f64 / n * 360.0 - 180.0;
    let east = (max_x + 1) as f64 / n * 360.0 - 180.0;
    let (north, south) = if tms_y {
        let max_tile = tile_matrix_size(actual_z).unwrap_or(1) - 1;
        let min_y_xyz = max_tile - max_y;
        let max_y_xyz = max_tile - min_y;
        (
            tile_to_lat(min_y_xyz, actual_z),
            tile_to_lat(max_y_xyz + 1, actual_z),
        )
    } else {
        (
            tile_to_lat(min_y, actual_z),
            tile_to_lat(max_y + 1, actual_z),
        )
    };

    Ok(Some([north, south, east, west]))
}

fn tile_to_lat(y: i64, z: i32) -> f64 {
    let n = std::f64::consts::PI
        - 2.0 * std::f64::consts::PI * y as f64 / tile_matrix_size(z).unwrap_or(1) as f64;
    n.sinh().atan().to_degrees()
}

fn query_rmaps_tile(
    conn: &Connection,
    source: &OfflineTileSource,
    x: i64,
    y: i64,
    z: i64,
) -> Result<Option<Vec<u8>>, String> {
    let combinations = if source.inverted {
        [(true, false), (false, false), (true, true), (false, true)]
    } else {
        [(false, false), (true, false), (false, true), (true, true)]
    };
    for (invert_z, invert_y) in combinations {
        if let Some(data) = query_rmaps_tile_with_formula(conn, x, y, z, invert_z, invert_y)? {
            return Ok(Some(data));
        }
    }
    Ok(None)
}

fn query_rmaps_tile_with_formula(
    conn: &Connection,
    x: i64,
    y: i64,
    z: i64,
    invert_z: bool,
    invert_y: bool,
) -> Result<Option<Vec<u8>>, String> {
    let rz = if invert_z { 17 - z } else { z };
    let ry = if invert_y {
        tile_matrix_size(z as i32).unwrap_or(1) - 1 - y
    } else {
        y
    };
    conn.query_row(
        "SELECT image FROM tiles WHERE x=? AND y=? AND z=? LIMIT 1",
        (x, ry, rz),
        |row| row.get::<_, Vec<u8>>(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn query_mbtiles_tile(
    conn: &Connection,
    source: &OfflineTileSource,
    x: i64,
    y: i64,
    z: i64,
) -> Result<Option<Vec<u8>>, String> {
    let tms_y = tile_matrix_size(z as i32).unwrap_or(1) - 1 - y;
    let first_y = if source.mbtiles_tms { tms_y } else { y };
    let second_y = if source.mbtiles_tms { y } else { tms_y };
    if let Some(data) = query_mbtiles_tile_y(conn, x, first_y, z)? {
        return Ok(Some(data));
    }
    query_mbtiles_tile_y(conn, x, second_y, z)
}

fn query_mbtiles_tile_y(
    conn: &Connection,
    x: i64,
    y: i64,
    z: i64,
) -> Result<Option<Vec<u8>>, String> {
    conn.query_row(
        "SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=? LIMIT 1",
        (z, x, y),
        |row| row.get::<_, Vec<u8>>(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn detect_mime(data: &[u8]) -> &'static str {
    if data.len() >= 2 && data[0] == 0xFF && data[1] == 0xD8 {
        "image/jpeg"
    } else if data.len() >= 4 && data[0] == 0x89 && data[1] == 0x50 {
        "image/png"
    } else if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        "image/webp"
    } else {
        "application/octet-stream"
    }
}

fn is_supported_raster_tile_data(data: &[u8]) -> bool {
    matches!(detect_mime(data), "image/jpeg" | "image/png" | "image/webp")
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
            get_app_version,
            check_app_update,
            install_app_update,
            open_map_viewer,
            fetch_tile_bytes,
            download_offline_map,
            cancel_offline_map_download,
            inspect_offline_map,
            read_offline_tile,
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
