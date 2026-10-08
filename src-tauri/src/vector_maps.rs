//! TrophyNav Maps — векторные карты областей с нашего сервера (как на Android: NavData.kt + TileServer.kt).
//!
//! Отдельный типизированный путь, растровые офлайн-карты (`read_offline_tile`) его не используют:
//! - протокол `tnmap://` отдаёт MVT-тайлы из `<id>.mbtiles` (gzip распаковывается здесь, без надежды на
//!   `Content-Encoding` у WebView), PNG рельефа из `<id>.dem.mbtiles` / `<id>.slope.mbtiles` и файлы стиля
//!   (стиль, темы, спрайты, шрифты) из встроенной папки `ui/vector/`;
//! - каталог `https://trophynav.ru/maps/v1/maps.json` с копией в рабочей папке на случай без сети;
//! - загрузка с докачкой, SHA-256 и атомарной заменой: недокачанный или битый файл картой не становится,
//!   а старая карта остаётся рабочей до самой замены.
//!
//! Рабочая папка: `Documents/TrophyNavigator/maps/vector/` (рядом с растровыми картами `maps/`).

use flate2::read::GzDecoder;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Emitter, Manager, Runtime, UriSchemeContext, UriSchemeResponder};

pub const SCHEME: &str = "tnmap";
const CATALOG_URL: &str = "https://trophynav.ru/maps/v1/maps.json";
const MAPS_BASE_URL: &str = "https://trophynav.ru/maps/v1/";
const CATALOG_CACHE_FILE: &str = "catalog.json";
/// Сжатый тайл больше этого — повреждённые данные, а не карта.
const MAX_STORED_TILE_BYTES: i64 = 8 * 1024 * 1024;
/// Предел распакованного MVT (защита от «gzip-бомбы»).
const MAX_INFLATED_TILE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_CATALOG_BYTES: u64 = 4 * 1024 * 1024;
const OPEN_DB_LIMIT: usize = 8;
const DOWNLOAD_EVENT: &str = "tnmaps-download";

static MAPS_DIR: OnceLock<PathBuf> = OnceLock::new();
static DB_CACHE: OnceLock<Mutex<DbCache>> = OnceLock::new();
static DOWNLOADS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

// ─────────────────────────── рабочая папка ───────────────────────────

/// Вызывается из `setup`: папка карт внутри Documents/TrophyNavigator, как у остальных данных десктопа.
pub fn init<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(docs) = app.path().document_dir() {
        let dir = docs.join("TrophyNavigatorTest").join("maps").join("vector");
        let _ = fs::create_dir_all(&dir);
        let _ = MAPS_DIR.set(dir);
    }
}

fn maps_dir() -> Result<&'static PathBuf, String> {
    MAPS_DIR
        .get()
        .ok_or_else(|| "Папка Documents/TrophyNavigator недоступна".to_string())
}

/// Идентификатор области из каталога: только `a-z 0-9 _ -` — он становится частью имени файла.
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'-')
}

/// Имя файла на сервере (каталог): без путей и `..`.
fn valid_remote_file(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && !name.starts_with('.')
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-' || b == b'.')
        && !name.contains("..")
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExtraKind {
    Dem,
    Slope,
}

impl ExtraKind {
    fn parse(s: &str) -> Option<Self> {
        match s {
            "dem" => Some(Self::Dem),
            "slope" => Some(Self::Slope),
            _ => None,
        }
    }
    fn as_str(self) -> &'static str {
        match self {
            Self::Dem => "dem",
            Self::Slope => "slope",
        }
    }
}

fn map_file(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.mbtiles"))
}

fn extra_file(dir: &Path, id: &str, kind: ExtraKind) -> PathBuf {
    dir.join(format!("{id}.{}.mbtiles", kind.as_str()))
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_os_string();
    s.push(suffix);
    PathBuf::from(s)
}

// ─────────────────────────── открытые базы ───────────────────────────

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum TileKind {
    Vector,
    Png,
}

struct OpenDb {
    conn: Arc<Mutex<Connection>>,
    sig: (u64, Option<SystemTime>),
    kind: TileKind,
    /// MBTiles по умолчанию TMS; `scheme=xyz` в metadata — без переворота Y.
    tms: bool,
}

#[derive(Default)]
struct DbCache {
    dbs: HashMap<PathBuf, OpenDb>,
    order: Vec<PathBuf>,
}

fn db_cache() -> &'static Mutex<DbCache> {
    DB_CACHE.get_or_init(|| Mutex::new(DbCache::default()))
}

fn file_sig(path: &Path) -> Option<(u64, Option<SystemTime>)> {
    let m = fs::metadata(path).ok()?;
    m.is_file().then(|| (m.len(), m.modified().ok()))
}

fn mbtiles_meta(conn: &Connection, name: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM metadata WHERE name = ?1",
        params![name],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
}

fn open_typed(path: &Path, kind: TileKind) -> Result<OpenDb, String> {
    let sig = file_sig(path).ok_or_else(|| "нет файла".to_string())?;
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("не открывается: {e}"))?;
    let _ = conn.busy_timeout(Duration::from_secs(2));
    let _ = conn.pragma_update(None, "mmap_size", 268_435_456_i64);
    let format = mbtiles_meta(&conn, "format").unwrap_or_default();
    let want = match kind {
        TileKind::Vector => "pbf",
        TileKind::Png => "png",
    };
    if format != want {
        return Err(format!("не та карта: format={format}, нужен {want}"));
    }
    let tms = !mbtiles_meta(&conn, "scheme")
        .map(|s| s.eq_ignore_ascii_case("xyz"))
        .unwrap_or(false);
    Ok(OpenDb {
        conn: Arc::new(Mutex::new(conn)),
        sig,
        kind,
        tms,
    })
}

/// Открытая база для файла; перечитывается, если файл заменили или удалили (размер+mtime).
fn get_db(path: &Path, kind: TileKind) -> Result<(Arc<Mutex<Connection>>, bool), String> {
    let mut cache = db_cache().lock().map_err(|_| "кэш карт недоступен")?;
    let sig = file_sig(path);
    let fresh = matches!((cache.dbs.get(path), sig), (Some(db), Some(s)) if db.sig == s);
    if !fresh {
        cache.dbs.remove(path);
        cache.order.retain(|p| p != path);
        if sig.is_none() {
            return Err("нет файла".to_string());
        }
        let db = open_typed(path, kind)?;
        cache.dbs.insert(path.to_path_buf(), db);
    }
    cache.order.retain(|p| p != path);
    cache.order.push(path.to_path_buf());
    while cache.order.len() > OPEN_DB_LIMIT {
        let old = cache.order.remove(0);
        cache.dbs.remove(&old);
    }
    let db = cache.dbs.get(path).ok_or("карта не открылась")?;
    if db.kind != kind {
        return Err("не та карта".to_string());
    }
    Ok((Arc::clone(&db.conn), db.tms))
}

/// Закрыть все базы области перед заменой/удалением файлов (Windows не даёт заменить открытый файл).
fn close_region(cache: &mut DbCache, dir: &Path, id: &str) {
    let paths = [
        map_file(dir, id),
        extra_file(dir, id, ExtraKind::Dem),
        extra_file(dir, id, ExtraKind::Slope),
    ];
    for p in paths.iter() {
        cache.dbs.remove(p);
        cache.order.retain(|o| o != p);
    }
}

fn read_tile(
    path: &Path,
    kind: TileKind,
    z: u32,
    x: u32,
    y: u32,
) -> Result<Option<Vec<u8>>, String> {
    let (conn, tms) = get_db(path, kind)?;
    let row = if tms { (1u32 << z) - 1 - y } else { y };
    let conn = conn.lock().map_err(|_| "база занята")?;
    // Длина проверяется до того, как SQLite отдаст BLOB в память
    let found: Option<(Option<Vec<u8>>, i64)> = conn
        .query_row(
            "SELECT CASE WHEN length(tile_data) <= ?4 THEN tile_data END, length(tile_data)
             FROM tiles WHERE zoom_level = ?1 AND tile_column = ?2 AND tile_row = ?3",
            params![z, x, row, MAX_STORED_TILE_BYTES],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| format!("чтение тайла: {e}"))?;
    match found {
        None => Ok(None),
        Some((Some(data), _)) => Ok(Some(data)),
        Some((None, len)) => Err(format!("тайл слишком большой: {len} байт")),
    }
}

/// gzip (planetiler хранит MVT сжатыми) распаковывается с пределом; несжатый MVT — как есть.
pub fn inflate_tile(data: Vec<u8>) -> Result<Vec<u8>, String> {
    if data.len() < 2 || data[0] != 0x1f || data[1] != 0x8b {
        if data.len() as u64 > MAX_INFLATED_TILE_BYTES {
            return Err("тайл слишком большой".to_string());
        }
        return Ok(data);
    }
    let mut out = Vec::with_capacity(data.len() * 4);
    GzDecoder::new(&data[..])
        .take(MAX_INFLATED_TILE_BYTES + 1)
        .read_to_end(&mut out)
        .map_err(|e| format!("повреждённый gzip: {e}"))?;
    if out.len() as u64 > MAX_INFLATED_TILE_BYTES {
        return Err("распакованный тайл слишком большой".to_string());
    }
    Ok(out)
}

// ─────────────────────────── протокол tnmap:// ───────────────────────────

#[derive(Debug, PartialEq, Eq)]
pub enum Route {
    Vector {
        id: String,
        z: u32,
        x: u32,
        y: u32,
    },
    Extra {
        id: String,
        kind: ExtraKind,
        z: u32,
        x: u32,
        y: u32,
    },
    Asset(String),
}

fn percent_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = s.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn parse_zxy(z: &str, x: &str, y_with_ext: &str, ext: &str) -> Option<(u32, u32, u32)> {
    let y = y_with_ext.strip_suffix(ext)?;
    let all_digits =
        |s: &str| !s.is_empty() && s.len() <= 9 && s.bytes().all(|b| b.is_ascii_digit());
    if !all_digits(z) || !all_digits(x) || !all_digits(y) {
        return None;
    }
    let (z, x, y) = (
        z.parse::<u32>().ok()?,
        x.parse::<u32>().ok()?,
        y.parse::<u32>().ok()?,
    );
    if z > 24 || x >= (1u32 << z) || y >= (1u32 << z) {
        return None;
    }
    Some((z, x, y))
}

/// Файл стиля из `ui/vector/`: только известные типы, без `..`, обратных слешей и NUL.
fn valid_asset_path(rel: &str) -> bool {
    let ext_ok = [".json", ".png", ".pbf"].iter().any(|e| rel.ends_with(e));
    ext_ok
        && rel.len() <= 200
        && !rel.starts_with('/')
        && !rel.contains('\\')
        && !rel.contains('\0')
        && rel
            .split('/')
            .all(|seg| !seg.is_empty() && seg != "." && seg != "..")
}

/// Путь запроса (`/vector/<id>/z/x/y.pbf`, `/extra/<id>.dem/z/x/y.png`, `/assets/<файл>`) → маршрут.
pub fn parse_route(raw_path: &str) -> Option<Route> {
    let path = percent_decode(raw_path)?;
    let parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
    match parts.as_slice() {
        ["vector", id, z, x, y] if valid_id(id) => {
            let (z, x, y) = parse_zxy(z, x, y, ".pbf")?;
            Some(Route::Vector {
                id: id.to_string(),
                z,
                x,
                y,
            })
        }
        ["extra", key, z, x, y] => {
            let (id, kind) = key.rsplit_once('.')?;
            let kind = ExtraKind::parse(kind)?;
            if !valid_id(id) {
                return None;
            }
            let (z, x, y) = parse_zxy(z, x, y, ".png")?;
            Some(Route::Extra {
                id: id.to_string(),
                kind,
                z,
                x,
                y,
            })
        }
        ["assets", rest @ ..] if !rest.is_empty() => {
            let rel = rest.join("/");
            valid_asset_path(&rel).then_some(Route::Asset(rel))
        }
        _ => None,
    }
}

fn respond(status: StatusCode, mime: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime)
        // Страница живёт на tauri://localhost (или http://tauri.localhost) — для неё это другой origin
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        // Файл карты может обновиться: WebView не должен держать свою копию
        .header(header::CACHE_CONTROL, "no-store")
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn serve_route<R: Runtime>(app: &AppHandle<R>, route: Route) -> Response<Vec<u8>> {
    const MVT: &str = "application/x-protobuf";
    match route {
        Route::Vector { id, z, x, y } => {
            let Ok(dir) = maps_dir() else {
                return respond(StatusCode::NOT_FOUND, "text/plain", b"no maps dir".to_vec());
            };
            match read_tile(&map_file(dir, &id), TileKind::Vector, z, x, y)
                .and_then(|t| t.map(inflate_tile).transpose())
            {
                Ok(Some(data)) => respond(StatusCode::OK, MVT, data),
                // Нет тайла (море, край области) — пустой MVT, это «здесь ничего не рисовать»
                Ok(None) => respond(StatusCode::OK, MVT, Vec::new()),
                Err(e) if e == "нет файла" => {
                    respond(StatusCode::NOT_FOUND, "text/plain", e.into_bytes())
                }
                Err(e) => respond(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "text/plain",
                    e.into_bytes(),
                ),
            }
        }
        Route::Extra { id, kind, z, x, y } => {
            let Ok(dir) = maps_dir() else {
                return respond(StatusCode::NOT_FOUND, "text/plain", Vec::new());
            };
            match read_tile(&extra_file(dir, &id, kind), TileKind::Png, z, x, y) {
                Ok(Some(data)) => respond(StatusCode::OK, "image/png", data),
                // Ровная местность без тайла крутизны: «нет тайла», а не пустой PNG (его MapLibre не декодирует)
                Ok(None) => respond(StatusCode::NO_CONTENT, "image/png", Vec::new()),
                Err(e) => respond(StatusCode::NOT_FOUND, "text/plain", e.into_bytes()),
            }
        }
        Route::Asset(rel) => {
            let mime = if rel.ends_with(".json") {
                "application/json"
            } else if rel.ends_with(".png") {
                "image/png"
            } else {
                MVT
            };
            match app.asset_resolver().get(format!("vector/{rel}")) {
                Some(asset) => respond(StatusCode::OK, mime, asset.bytes),
                // Диапазона глифов нет в комплекте (редкие символы): пустой ответ — просто без этих букв
                None if rel.starts_with("fonts/") => respond(StatusCode::OK, MVT, Vec::new()),
                None => respond(StatusCode::NOT_FOUND, "text/plain", Vec::new()),
            }
        }
    }
}

/// Обработчик `tnmap://` — чтение SQLite в отдельном потоке, не в потоке окна.
pub fn handle_protocol<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    let path = request.uri().path().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let response = match parse_route(&path) {
            Some(route) => serve_route(&app, route),
            None => respond(
                StatusCode::BAD_REQUEST,
                "text/plain",
                b"bad tnmap request".to_vec(),
            ),
        };
        responder.respond(response);
    });
}

// ─────────────────────────── скачанные карты ───────────────────────────

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExtraInfo {
    size: u64,
    sha256: Option<String>,
    min_zoom: Option<i32>,
    max_zoom: Option<i32>,
    modified: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMap {
    id: String,
    name: Option<String>,
    size: u64,
    modified: u64,
    sha256: Option<String>,
    bounds: Option<[f64; 4]>,
    min_zoom: Option<i32>,
    max_zoom: Option<i32>,
    dem: Option<ExtraInfo>,
    slope: Option<ExtraInfo>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalState {
    dir: String,
    maps: Vec<LocalMap>,
    /// Недокачанные файлы (`<file>.part`) по id области: сколько байт уже есть.
    partial: HashMap<String, u64>,
}

fn modified_secs(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn read_sidecar_sha(path: &Path) -> Option<String> {
    fs::read_to_string(with_suffix(path, ".sha256"))
        .ok()
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
}

fn read_meta_conn(path: &Path) -> Option<Connection> {
    Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .ok()
}

fn meta_int(conn: &Connection, name: &str) -> Option<i32> {
    mbtiles_meta(conn, name)
        .and_then(|v| v.trim().parse::<f64>().ok())
        .map(|v| v as i32)
}

fn extra_info(path: &Path) -> Option<ExtraInfo> {
    let sig = file_sig(path)?;
    let conn = read_meta_conn(path);
    Some(ExtraInfo {
        size: sig.0,
        sha256: read_sidecar_sha(path),
        min_zoom: conn.as_ref().and_then(|c| meta_int(c, "minzoom")),
        max_zoom: conn.as_ref().and_then(|c| meta_int(c, "maxzoom")),
        modified: modified_secs(path),
    })
}

fn local_map(dir: &Path, id: &str) -> Option<LocalMap> {
    let path = map_file(dir, id);
    let (size, _) = file_sig(&path)?;
    let conn = read_meta_conn(&path);
    let mut error = None;
    let (name, bounds, min_zoom, max_zoom) = match conn.as_ref() {
        Some(c) => {
            if mbtiles_meta(c, "format").as_deref() != Some("pbf") {
                error = Some("это не векторная карта".to_string());
            }
            let bounds = mbtiles_meta(c, "bounds").and_then(|b| {
                let v: Vec<f64> = b.split(',').filter_map(|p| p.trim().parse().ok()).collect();
                (v.len() == 4).then(|| [v[0], v[1], v[2], v[3]])
            });
            (
                mbtiles_meta(c, "name"),
                bounds,
                meta_int(c, "minzoom"),
                meta_int(c, "maxzoom"),
            )
        }
        None => {
            error = Some("файл не открывается".to_string());
            (None, None, None, None)
        }
    };
    Some(LocalMap {
        id: id.to_string(),
        name,
        size,
        modified: modified_secs(&path),
        sha256: read_sidecar_sha(&path),
        bounds,
        min_zoom,
        max_zoom,
        dem: extra_info(&extra_file(dir, id, ExtraKind::Dem)),
        slope: extra_info(&extra_file(dir, id, ExtraKind::Slope)),
        error,
    })
}

fn list_local(dir: &Path) -> LocalState {
    let mut maps = Vec::new();
    let mut partial = HashMap::new();
    if let Ok(entries) = fs::read_dir(dir) {
        let mut names: Vec<String> = entries
            .filter_map(|e| e.ok()?.file_name().into_string().ok())
            .collect();
        names.sort();
        for name in names {
            if let Some(stem) = name.strip_suffix(".mbtiles") {
                // <id>.dem.mbtiles / <id>.slope.mbtiles — спутники карты, не карты
                if valid_id(stem) {
                    if let Some(m) = local_map(dir, stem) {
                        maps.push(m);
                    }
                }
            } else if let Some(stem) = name.strip_suffix(".mbtiles.part") {
                let id = stem.split('.').next().unwrap_or_default();
                if valid_id(id) {
                    let len = fs::metadata(dir.join(&name)).map(|m| m.len()).unwrap_or(0);
                    *partial.entry(id.to_string()).or_insert(0) += len;
                }
            }
        }
    }
    LocalState {
        dir: dir.to_string_lossy().into_owned(),
        maps,
        partial,
    }
}

#[tauri::command]
pub async fn tnmaps_local() -> Result<LocalState, String> {
    let dir = maps_dir()?.clone();
    tauri::async_runtime::spawn_blocking(move || list_local(&dir))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tnmaps_delete(id: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("Неверный id карты".to_string());
    }
    let dir = maps_dir()?.clone();
    if downloads()
        .lock()
        .map(|d| d.contains_key(&id))
        .unwrap_or(false)
    {
        return Err("Карта сейчас скачивается — сначала остановите загрузку".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut cache = db_cache().lock().map_err(|_| "кэш карт недоступен")?;
        close_region(&mut cache, &dir, &id);
        let mut files = Vec::new();
        for base in [
            map_file(&dir, &id),
            extra_file(&dir, &id, ExtraKind::Dem),
            extra_file(&dir, &id, ExtraKind::Slope),
        ] {
            for suffix in ["", ".sha256", ".part", ".part.meta"] {
                files.push(with_suffix(&base, suffix));
            }
        }
        for f in files {
            match fs::remove_file(&f) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(format!("Не удалось удалить {}: {e}", f.display())),
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─────────────────────────── каталог ───────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogResult {
    catalog: serde_json::Value,
    /// Сеть недоступна — показан сохранённый каталог.
    from_cache: bool,
    saved_at: Option<u64>,
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        .timeout_read(Duration::from_secs(30))
        .build()
}

fn validate_catalog(text: &str) -> Result<serde_json::Value, String> {
    let value: serde_json::Value =
        serde_json::from_str(text).map_err(|e| format!("каталог повреждён: {e}"))?;
    if !value.get("maps").map(|m| m.is_array()).unwrap_or(false) {
        return Err("в каталоге нет списка карт".to_string());
    }
    Ok(value)
}

fn fetch_catalog_text() -> Result<String, String> {
    let resp = agent()
        .get(CATALOG_URL)
        .set("Cache-Control", "no-cache")
        .set("User-Agent", "TrophyNavigator-Desktop")
        .call()
        .map_err(|e| format!("нет связи с сервером карт: {e}"))?;
    let mut text = String::new();
    resp.into_reader()
        .take(MAX_CATALOG_BYTES)
        .read_to_string(&mut text)
        .map_err(|e| e.to_string())?;
    validate_catalog(&text)?;
    Ok(text)
}

fn write_atomic(path: &Path, data: &[u8]) -> Result<(), String> {
    let tmp = with_suffix(path, ".tmp");
    {
        let mut f = File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(data).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn catalog_blocking(dir: &Path) -> Result<CatalogResult, String> {
    let cache = dir.join(CATALOG_CACHE_FILE);
    match fetch_catalog_text() {
        Ok(text) => {
            let _ = write_atomic(&cache, text.as_bytes());
            Ok(CatalogResult {
                catalog: validate_catalog(&text)?,
                from_cache: false,
                saved_at: Some(modified_secs(&cache)),
            })
        }
        Err(net) => {
            let text = fs::read_to_string(&cache).map_err(|_| net.clone())?;
            Ok(CatalogResult {
                catalog: validate_catalog(&text).map_err(|_| net)?,
                from_cache: true,
                saved_at: Some(modified_secs(&cache)),
            })
        }
    }
}

#[tauri::command]
pub async fn tnmaps_catalog() -> Result<CatalogResult, String> {
    let dir = maps_dir()?.clone();
    tauri::async_runtime::spawn_blocking(move || catalog_blocking(&dir))
        .await
        .map_err(|e| e.to_string())?
}

// ─────────────────────────── загрузка ───────────────────────────

fn downloads() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    DOWNLOADS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadEvent {
    id: String,
    /// download | verify | done | error | cancelled
    phase: &'static str,
    done: u64,
    total: u64,
    message: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RemoteFile {
    pub file: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Clone, Debug)]
pub struct RemoteMap {
    pub main: RemoteFile,
    pub terrain: Vec<(ExtraKind, RemoteFile)>,
}

fn remote_file(v: &serde_json::Value) -> Option<RemoteFile> {
    let file = v.get("file")?.as_str()?.to_string();
    let size = v.get("size")?.as_u64()?;
    let sha256 = v.get("sha256")?.as_str()?.to_ascii_lowercase();
    (valid_remote_file(&file)
        && size > 0
        && sha256.len() == 64
        && sha256.bytes().all(|b| b.is_ascii_hexdigit()))
    .then_some(RemoteFile { file, size, sha256 })
}

pub fn find_remote_map(catalog: &serde_json::Value, id: &str) -> Option<RemoteMap> {
    let entry = catalog
        .get("maps")?
        .as_array()?
        .iter()
        .find(|m| m.get("id").and_then(|v| v.as_str()) == Some(id))?;
    let main = remote_file(entry)?;
    let terrain = entry
        .get("terrain")
        .and_then(|t| t.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|t| {
                    Some((ExtraKind::parse(t.get("kind")?.as_str()?)?, remote_file(t)?))
                })
                .collect()
        })
        .unwrap_or_default();
    Some(RemoteMap { main, terrain })
}

/// Нужно ли качать файл: нет его, другой размер или хеш не тот, что в каталоге.
///
/// Файл нужного размера без `.sha256` (скопирован вручную, сайдкар не записался) сверяется по
/// содержимому: совпал с каталогом — сайдкар записывается и качать не нужно, иначе — качать.
/// `on_hash` вызывается перед пересчётом (большой файл считается секунды — показать «Проверка»).
fn needs_download(target: &Path, remote: &RemoteFile, on_hash: &mut dyn FnMut()) -> bool {
    match file_sig(target) {
        None => true,
        Some((len, _)) if len != remote.size => true,
        Some(_) => match read_sidecar_sha(target) {
            Some(sha) => sha != remote.sha256,
            None => {
                on_hash();
                let same = sha256_of_file(target)
                    .map(|(hasher, _)| hex(&hasher.finalize()) == remote.sha256)
                    .unwrap_or(false);
                if same {
                    write_sidecar(target, &remote.sha256);
                }
                !same
            }
        },
    }
}

/// `.sha256` рядом с файлом. Не записался — не ошибка загрузки: файл уже целый и проверенный,
/// окно покажет «Проверить», и следующая проверка пересчитает хеш.
fn write_sidecar(target: &Path, sha256: &str) {
    if let Err(e) = write_atomic(&with_suffix(target, ".sha256"), sha256.as_bytes()) {
        eprintln!(
            "TrophyNav Maps: не записан {}.sha256: {e}",
            target.display()
        );
    }
}

#[derive(Debug)]
pub enum DlError {
    Cancelled,
    /// Файл на сервере уже другой, чем в каталоге (пересобран во время загрузки).
    ServerChanged,
    Other(String),
}

impl From<std::io::Error> for DlError {
    fn from(e: std::io::Error) -> Self {
        DlError::Other(e.to_string())
    }
}

impl DlError {
    fn message(&self) -> String {
        match self {
            DlError::Cancelled => "Загрузка остановлена".to_string(),
            DlError::ServerChanged => {
                "Карта на сервере только что обновилась — запустите загрузку ещё раз".to_string()
            }
            DlError::Other(m) => m.clone(),
        }
    }
}

fn sha256_of_file(path: &Path) -> Result<(Sha256, u64), DlError> {
    let mut hasher = Sha256::new();
    let mut total = 0u64;
    let mut f = File::open(path)?;
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        total += n as u64;
    }
    Ok((hasher, total))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Одна попытка докачать `part` до `remote.size`. Возвращает итоговый SHA-256 части.
fn fetch_into_part(
    url: &str,
    part: &Path,
    remote: &RemoteFile,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64),
) -> Result<String, DlError> {
    let meta_path = with_suffix(part, ".meta");
    // .part от другой сборки файла (хеш в каталоге сменился) не докачивается — начинаем заново
    let meta_ok = fs::read_to_string(&meta_path)
        .map(|s| s.trim() == remote.sha256)
        .unwrap_or(false);
    let mut offset = if meta_ok {
        fs::metadata(part).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };
    if offset > remote.size {
        offset = 0;
    }
    if offset == 0 {
        let _ = fs::remove_file(part);
        fs::write(&meta_path, &remote.sha256)?;
    }
    let (mut hasher, _) = if offset > 0 {
        sha256_of_file(part)?
    } else {
        (Sha256::new(), 0)
    };
    if offset == remote.size {
        return Ok(hex(&hasher.finalize()));
    }
    let mut req = agent()
        .get(url)
        .set("User-Agent", "TrophyNavigator-Desktop");
    if offset > 0 {
        req = req.set("Range", &format!("bytes={offset}-"));
    }
    let resp = match req.call() {
        Ok(r) => r,
        // Range за концом файла: .part длиннее файла на сервере — заново с нуля
        Err(ureq::Error::Status(416, _)) => {
            let _ = fs::remove_file(part);
            return Err(DlError::Other("HTTP 416".to_string()));
        }
        Err(ureq::Error::Status(code, _)) => {
            return Err(DlError::Other(format!("сервер ответил HTTP {code}")))
        }
        Err(e) => return Err(DlError::Other(format!("нет связи с сервером карт: {e}"))),
    };
    let resuming = offset > 0 && resp.status() == 206;
    let server_size = if resuming {
        resp.header("Content-Range")
            .and_then(|r| r.rsplit('/').next())
            .and_then(|t| t.trim().parse::<u64>().ok())
    } else {
        resp.header("Content-Length")
            .and_then(|l| l.trim().parse::<u64>().ok())
    };
    if let Some(s) = server_size {
        if s != remote.size {
            return Err(DlError::ServerChanged);
        }
    }
    if resuming {
        let start = resp
            .header("Content-Range")
            .and_then(|r| r.trim().strip_prefix("bytes "))
            .and_then(|r| r.split('-').next())
            .and_then(|s| s.parse::<u64>().ok());
        if start != Some(offset) {
            let _ = fs::remove_file(part);
            return Err(DlError::Other(
                "сервер прислал не тот кусок файла".to_string(),
            ));
        }
    } else {
        // 200 на запрос с Range — сервер отдаёт файл целиком: пишем с нуля, а не в хвост
        offset = 0;
        hasher = Sha256::new();
    }
    let mut out = OpenOptions::new()
        .create(true)
        .write(true)
        .append(resuming)
        .truncate(!resuming)
        .open(part)?;
    let mut reader = resp.into_reader().take(remote.size - offset + 1);
    let mut buf = vec![0u8; 1 << 16];
    let mut done = offset;
    loop {
        if cancel.load(Ordering::SeqCst) {
            out.flush()?;
            return Err(DlError::Cancelled);
        }
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        out.write_all(&buf[..n])?;
        hasher.update(&buf[..n]);
        done += n as u64;
        if done > remote.size {
            drop(out);
            let _ = fs::remove_file(part);
            return Err(DlError::ServerChanged);
        }
        progress(done);
    }
    out.sync_all()?;
    if done != remote.size {
        return Err(DlError::Other(format!(
            "связь оборвалась: {done} из {} байт",
            remote.size
        )));
    }
    Ok(hex(&hasher.finalize()))
}

/// Скачать файл с докачкой и проверкой SHA-256; файл появляется под своим именем только целым.
pub fn download_verified(
    url: &str,
    target: &Path,
    remote: &RemoteFile,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64),
    on_verify: &mut dyn FnMut(),
    publish: &mut dyn FnMut(&Path, &Path) -> Result<(), String>,
) -> Result<(), DlError> {
    let part = with_suffix(target, ".part");
    let mut last_err = DlError::Other("нет связи с сервером карт".to_string());
    let mut restarted_after_bad_hash = false;
    for attempt in 1..=5u32 {
        if cancel.load(Ordering::SeqCst) {
            return Err(DlError::Cancelled);
        }
        let resumed = fs::metadata(&part).map(|m| m.len() > 0).unwrap_or(false);
        match fetch_into_part(url, &part, remote, cancel, progress) {
            Ok(sha) => {
                on_verify();
                if sha != remote.sha256 {
                    let _ = fs::remove_file(&part);
                    let _ = fs::remove_file(with_suffix(&part, ".meta"));
                    // Докачанный хвост мог лечь на начало старой сборки — один раз начинаем с нуля
                    if resumed && !restarted_after_bad_hash {
                        restarted_after_bad_hash = true;
                        continue;
                    }
                    return Err(DlError::Other(
                        "Контрольная сумма не совпала — файл повреждён, он не подключён"
                            .to_string(),
                    ));
                }
                publish(&part, target).map_err(DlError::Other)?;
                let _ = fs::remove_file(with_suffix(&part, ".meta"));
                write_sidecar(target, &remote.sha256);
                return Ok(());
            }
            Err(e @ (DlError::Cancelled | DlError::ServerChanged)) => return Err(e),
            Err(e) => {
                last_err = e;
                let wait = Duration::from_millis(1500 * attempt as u64);
                let until = Instant::now() + wait;
                while Instant::now() < until {
                    if cancel.load(Ordering::SeqCst) {
                        return Err(DlError::Cancelled);
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
        }
    }
    Err(last_err)
}

/// Замена файла карты: базы области закрываются и снова не открываются, пока идёт rename.
fn publish_file(dir: &Path, id: &str, part: &Path, target: &Path) -> Result<(), String> {
    let mut cache = db_cache().lock().map_err(|_| "кэш карт недоступен")?;
    close_region(&mut cache, dir, id);
    fs::rename(part, target).map_err(|e| format!("не удалось сохранить файл карты: {e}"))
}

fn download_region<R: Runtime>(
    app: &AppHandle<R>,
    dir: &Path,
    id: &str,
    cancel: &AtomicBool,
) -> Result<(), DlError> {
    let emit = |phase: &'static str, done: u64, total: u64, message: Option<String>| {
        let _ = app.emit(
            DOWNLOAD_EVENT,
            DownloadEvent {
                id: id.to_string(),
                phase,
                done,
                total,
                message,
            },
        );
    };
    // Свежая запись каталога: карту могли пересобрать после того, как окно показало список
    let catalog = catalog_blocking(dir).map_err(DlError::Other)?.catalog;
    let remote = find_remote_map(&catalog, id)
        .ok_or_else(|| DlError::Other("Карты нет в каталоге".to_string()))?;
    let mut jobs: Vec<(RemoteFile, PathBuf)> = Vec::new();
    let target = map_file(dir, id);
    let mut on_hash = || emit("verify", 0, 0, None);
    if needs_download(&target, &remote.main, &mut on_hash) {
        jobs.push((remote.main.clone(), target));
    }
    // Рельеф (отмывка, крутизна) идёт следом на том же прогрессе: без него у «Топо» нет теней
    for (kind, file) in &remote.terrain {
        let t = extra_file(dir, id, *kind);
        if needs_download(&t, file, &mut on_hash) {
            jobs.push((file.clone(), t));
        }
    }
    let total: u64 = jobs.iter().map(|(r, _)| r.size).sum();
    let mut before = 0u64;
    let mut last_tick = Instant::now() - Duration::from_secs(1);
    for (remote, target) in jobs {
        let url = format!("{MAPS_BASE_URL}{}", remote.file);
        let mut progress = |done: u64| {
            if last_tick.elapsed() >= Duration::from_millis(250) {
                last_tick = Instant::now();
                emit("download", before + done, total, None);
            }
        };
        let mut on_verify = || emit("verify", before + remote.size, total, None);
        let mut publish = |part: &Path, t: &Path| publish_file(dir, id, part, t);
        download_verified(
            &url,
            &target,
            &remote,
            cancel,
            &mut progress,
            &mut on_verify,
            &mut publish,
        )?;
        before += remote.size;
    }
    emit("done", total, total, None);
    Ok(())
}

#[tauri::command]
pub async fn tnmaps_download<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("Неверный id карты".to_string());
    }
    let dir = maps_dir()?.clone();
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut active = downloads().lock().map_err(|_| "загрузки недоступны")?;
        if active.contains_key(&id) {
            return Err("Эта карта уже скачивается".to_string());
        }
        active.insert(id.clone(), Arc::clone(&cancel));
    }
    let id2 = id.clone();
    let app2 = app.clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || download_region(&app2, &dir, &id2, &cancel))
            .await
            .map_err(|e| e.to_string());
    if let Ok(mut active) = downloads().lock() {
        active.remove(&id);
    }
    match result? {
        Ok(()) => Ok(()),
        Err(e) => {
            let phase = if matches!(e, DlError::Cancelled) {
                "cancelled"
            } else {
                "error"
            };
            let _ = app.emit(
                DOWNLOAD_EVENT,
                DownloadEvent {
                    id: id.clone(),
                    phase,
                    done: 0,
                    total: 0,
                    message: Some(e.message()),
                },
            );
            Err(e.message())
        }
    }
}

#[tauri::command]
pub fn tnmaps_cancel(id: String) {
    if let Ok(active) = downloads().lock() {
        if let Some(flag) = active.get(&id) {
            flag.store(true, Ordering::SeqCst);
        }
    }
}

// ─────────────────────────── тесты ───────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::{BufRead, BufReader};
    use std::net::TcpListener;

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("tnmaps-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn gzip(data: &[u8]) -> Vec<u8> {
        let mut e = GzEncoder::new(Vec::new(), Compression::default());
        e.write_all(data).unwrap();
        e.finish().unwrap()
    }

    fn make_mbtiles(
        path: &Path,
        format: &str,
        scheme: Option<&str>,
        tiles: &[(u32, u32, u32, Vec<u8>)],
    ) {
        let _ = fs::remove_file(path);
        let c = Connection::open(path).unwrap();
        c.execute_batch(
            "CREATE TABLE metadata (name TEXT, value TEXT);
             CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);",
        )
        .unwrap();
        c.execute(
            "INSERT INTO metadata VALUES ('format', ?1)",
            params![format],
        )
        .unwrap();
        if let Some(s) = scheme {
            c.execute("INSERT INTO metadata VALUES ('scheme', ?1)", params![s])
                .unwrap();
        }
        for (z, x, row, data) in tiles {
            c.execute(
                "INSERT INTO tiles VALUES (?1, ?2, ?3, ?4)",
                params![z, x, row, data],
            )
            .unwrap();
        }
    }

    #[test]
    fn routes_are_parsed_strictly() {
        assert_eq!(
            parse_route("/vector/leningrad/10/600/300.pbf"),
            Some(Route::Vector {
                id: "leningrad".into(),
                z: 10,
                x: 600,
                y: 300
            })
        );
        assert_eq!(
            parse_route("/extra/murmansk.dem/9/300/140.png"),
            Some(Route::Extra {
                id: "murmansk".into(),
                kind: ExtraKind::Dem,
                z: 9,
                x: 300,
                y: 140
            })
        );
        assert_eq!(
            parse_route("/assets/fonts/Roboto%20Regular/0-255.pbf"),
            Some(Route::Asset("fonts/Roboto Regular/0-255.pbf".into()))
        );
        // за пределами сетки тайлов, чужие расширения, обход каталогов
        assert_eq!(parse_route("/vector/leningrad/2/4/0.pbf"), None);
        assert_eq!(parse_route("/vector/leningrad/1/0/0.png"), None);
        assert_eq!(parse_route("/vector/../1/0/0.pbf"), None);
        assert_eq!(parse_route("/vector/Lenin/1/0/0.pbf"), None);
        assert_eq!(parse_route("/extra/murmansk.hack/1/0/0.png"), None);
        assert_eq!(parse_route("/assets/../tauri.conf.json"), None);
        assert_eq!(parse_route("/assets/%2e%2e/secret.json"), None);
        assert_eq!(parse_route("/assets/sprites/x.js"), None);
        assert_eq!(parse_route("/assets/a\\b.json"), None);
        assert_eq!(parse_route("/other/x"), None);
    }

    #[test]
    fn gzip_tiles_are_inflated_with_a_limit() {
        let mvt = b"\x1a\x05hello".to_vec();
        assert_eq!(inflate_tile(gzip(&mvt)).unwrap(), mvt);
        assert_eq!(inflate_tile(mvt.clone()).unwrap(), mvt);
        let mut broken = gzip(&mvt);
        broken.truncate(broken.len() - 6);
        assert!(inflate_tile(broken).is_err());
        let bomb = gzip(&vec![0u8; (MAX_INFLATED_TILE_BYTES + 10) as usize]);
        assert!(inflate_tile(bomb).is_err());
    }

    #[test]
    fn tiles_are_read_from_tms_and_reopened_after_replacement() {
        let dir = temp_dir("read");
        let path = dir.join("test.mbtiles");
        // z1 x0 y0 (XYZ) лежит в TMS-строке 1
        make_mbtiles(&path, "pbf", None, &[(1, 0, 1, gzip(b"north"))]);
        let got = read_tile(&path, TileKind::Vector, 1, 0, 0)
            .unwrap()
            .map(|d| inflate_tile(d).unwrap());
        assert_eq!(got.as_deref(), Some(&b"north"[..]));
        assert_eq!(read_tile(&path, TileKind::Vector, 1, 0, 1).unwrap(), None);
        // PNG-база векторным путём не читается
        assert!(read_tile(&path, TileKind::Png, 1, 0, 0).is_err());

        // Файл заменили (другой размер) — читается новый, а не закэшированная старая база
        std::thread::sleep(Duration::from_millis(20));
        let tmp = dir.join("new.mbtiles");
        make_mbtiles(
            &tmp,
            "pbf",
            Some("xyz"),
            &[(1, 0, 0, b"plain-new-tile".to_vec())],
        );
        fs::rename(&tmp, &path).unwrap();
        let got = read_tile(&path, TileKind::Vector, 1, 0, 0).unwrap();
        assert_eq!(got.as_deref(), Some(&b"plain-new-tile"[..]));

        fs::remove_file(&path).unwrap();
        assert!(read_tile(&path, TileKind::Vector, 1, 0, 0).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn catalog_entries_are_validated() {
        let sha = "a".repeat(64);
        let cat = serde_json::json!({"maps": [
            {"id": "murmansk", "file": "murmansk.mbtiles", "size": 10, "sha256": sha,
             "terrain": [{"kind": "dem", "file": "murmansk.dem.mbtiles", "size": 5, "sha256": sha},
                         {"kind": "bad", "file": "x.mbtiles", "size": 5, "sha256": sha}]},
            {"id": "evil", "file": "../evil.mbtiles", "size": 10, "sha256": sha}
        ]});
        let m = find_remote_map(&cat, "murmansk").unwrap();
        assert_eq!(m.main.file, "murmansk.mbtiles");
        assert_eq!(m.terrain.len(), 1);
        assert_eq!(m.terrain[0].0, ExtraKind::Dem);
        assert!(find_remote_map(&cat, "evil").is_none());
        assert!(validate_catalog("{\"maps\": 1}").is_err());
    }

    /// Мини-сервер: отдаёт `body` с поддержкой Range; `serve_full` — игнорировать Range (ответ 200).
    fn serve(body: Vec<u8>, serve_full: bool, requests: usize) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for stream in listener.incoming().take(requests) {
                let mut stream = stream.unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut range_start = None;
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                        break;
                    }
                    if let Some(v) = line.to_ascii_lowercase().strip_prefix("range: bytes=") {
                        range_start = v.trim().trim_end_matches('-').parse::<usize>().ok();
                    }
                }
                let resp = match range_start {
                    Some(start) if !serve_full => {
                        let chunk = &body[start..];
                        let mut head = format!(
                            "HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nContent-Range: bytes {}-{}/{}\r\nConnection: close\r\n\r\n",
                            chunk.len(), start, body.len() - 1, body.len()
                        )
                        .into_bytes();
                        head.extend_from_slice(chunk);
                        head
                    }
                    _ => {
                        let mut head = format!(
                            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                            body.len()
                        )
                        .into_bytes();
                        head.extend_from_slice(&body);
                        head
                    }
                };
                let _ = stream.write_all(&resp);
            }
        });
        format!("http://{addr}/file.mbtiles")
    }

    fn sha_hex(data: &[u8]) -> String {
        hex(&Sha256::digest(data))
    }

    fn run(url: &str, target: &Path, remote: &RemoteFile) -> Result<(), DlError> {
        let cancel = AtomicBool::new(false);
        download_verified(
            url,
            target,
            remote,
            &cancel,
            &mut |_| {},
            &mut || {},
            &mut |p, t| fs::rename(p, t).map_err(|e| e.to_string()),
        )
    }

    #[test]
    fn download_resumes_a_partial_file_and_verifies_sha() {
        let dir = temp_dir("resume");
        let body: Vec<u8> = (0..200_000u32).map(|i| (i % 251) as u8).collect();
        let remote = RemoteFile {
            file: "f.mbtiles".into(),
            size: body.len() as u64,
            sha256: sha_hex(&body),
        };
        let target = dir.join("f.mbtiles");
        let part = with_suffix(&target, ".part");
        fs::write(&part, &body[..50_000]).unwrap();
        fs::write(with_suffix(&part, ".meta"), &remote.sha256).unwrap();
        run(&serve(body.clone(), false, 1), &target, &remote).unwrap();
        assert_eq!(fs::read(&target).unwrap(), body);
        assert!(!part.exists());
        assert_eq!(
            read_sidecar_sha(&target).as_deref(),
            Some(remote.sha256.as_str())
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn download_restarts_when_server_ignores_range() {
        let dir = temp_dir("full");
        let body: Vec<u8> = (0..70_000u32).map(|i| (i % 13) as u8).collect();
        let remote = RemoteFile {
            file: "f.mbtiles".into(),
            size: body.len() as u64,
            sha256: sha_hex(&body),
        };
        let target = dir.join("f.mbtiles");
        let part = with_suffix(&target, ".part");
        fs::write(&part, vec![9u8; 30_000]).unwrap();
        fs::write(with_suffix(&part, ".meta"), &remote.sha256).unwrap();
        run(&serve(body.clone(), true, 1), &target, &remote).unwrap();
        assert_eq!(fs::read(&target).unwrap(), body);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupt_download_never_replaces_the_working_map() {
        let dir = temp_dir("corrupt");
        let body = vec![7u8; 40_000];
        let remote = RemoteFile {
            file: "f.mbtiles".into(),
            size: body.len() as u64,
            sha256: "0".repeat(64),
        };
        let target = dir.join("f.mbtiles");
        fs::write(&target, b"old working map").unwrap();
        let err = run(&serve(body, false, 1), &target, &remote).unwrap_err();
        assert!(matches!(err, DlError::Other(ref m) if m.contains("Контрольная сумма")));
        assert_eq!(fs::read(&target).unwrap(), b"old working map");
        assert!(!with_suffix(&target, ".part").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn file_without_sidecar_is_checked_by_content() {
        let dir = temp_dir("sidecar");
        let body = vec![5u8; 30_000];
        let remote = RemoteFile {
            file: "f.mbtiles".into(),
            size: body.len() as u64,
            sha256: sha_hex(&body),
        };
        let target = dir.join("f.mbtiles");
        let mut hashed = 0;
        assert!(needs_download(&target, &remote, &mut || hashed += 1));
        assert_eq!(hashed, 0, "нет файла — хеш не считается");

        // Скопирован вручную: тот же размер, сайдкара нет, содержимое то же — качать не нужно
        fs::write(&target, &body).unwrap();
        assert!(!needs_download(&target, &remote, &mut || hashed += 1));
        assert_eq!(hashed, 1);
        assert_eq!(
            read_sidecar_sha(&target).as_deref(),
            Some(remote.sha256.as_str())
        );
        // Сайдкар записан — второй раз не пересчитывается
        assert!(!needs_download(&target, &remote, &mut || hashed += 1));
        assert_eq!(hashed, 1);

        // Тот же размер, другая сборка — качать, сайдкар не появляется
        fs::remove_file(with_suffix(&target, ".sha256")).unwrap();
        fs::write(&target, vec![6u8; body.len()]).unwrap();
        assert!(needs_download(&target, &remote, &mut || hashed += 1));
        assert_eq!(hashed, 2);
        assert!(read_sidecar_sha(&target).is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn size_change_on_server_is_reported() {
        let dir = temp_dir("changed");
        let body = vec![1u8; 10_000];
        let remote = RemoteFile {
            file: "f.mbtiles".into(),
            size: 12_345,
            sha256: sha_hex(&body),
        };
        let err = run(&serve(body, false, 1), &dir.join("f.mbtiles"), &remote).unwrap_err();
        assert!(matches!(err, DlError::ServerChanged));
        let _ = fs::remove_dir_all(&dir);
    }
}

/// Названия скачанной карты области — для поиска без интернета (src/places.rs). Долго только в первый
/// раз (~1–2 с на область), потом из кэша `<id>.places.json`.
#[tauri::command]
pub async fn tnmaps_places(id: String) -> Result<Vec<crate::places::Place>, String> {
    if !valid_id(&id) {
        return Err("неверный идентификатор карты".into());
    }
    let path = map_file(maps_dir()?, &id);
    tauri::async_runtime::spawn_blocking(move || crate::places::places_for(&path))
        .await
        .map_err(|e| e.to_string())?
}
