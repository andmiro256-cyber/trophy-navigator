//! Пакет стиля векторных карт с нашего сервера (порт Android `StylePack.kt`): правки оформления и новые
//! темы доходят до людей без нового выпуска десктопа.
//!
//! Пакет повторяет встроенную папку `ui/vector/` (style-liberty.json, theme-<id>.json, sprites/…):
//! `https://trophynav.ru/maps/v1/style/manifest.json` = {"version", "files": {путь: {sha256, size}}, "themes": [...]}.
//! Новый пакет качается в `staging-v<N>`, каждый файл сверяется по размеру и SHA-256, и только после этого
//! папка получает имя `v<N>`, а указатель `current` переключается (запись через rename). До того — и при
//! любой ошибке — работает прежний пакет или встроенные файлы.
//!
//! Совместимость: `minAppVersionCode` — номер сборки Android, десктоп его не смотрит; для десктопа
//! действует необязательный `minDesktopVersion` («0.9.36»). Пакет не новее встроенного (`ui/vector/manifest.json`)
//! не ставится.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};

const BASE_URL: &str = "https://trophynav.ru/maps/v1/style/";
const MAX_MANIFEST_BYTES: u64 = 1_000_000;
/// Предел одного файла пакета (сейчас самый большой — спрайт @2x, ~200 КБ).
const MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;
/// Предел всего пакета и числа файлов: манифест с сервера не может заставить писать без конца.
const MAX_PACK_BYTES: u64 = 64 * 1024 * 1024;
const MAX_PACK_FILES: usize = 512;
/// Событие для строки состояния: {"phase": "start" | "done" | "error", "version"} — только когда пакет
/// действительно качается; проверка без нового пакета ничего не показывает.
const EVENT: &str = "tnmaps-stylepack";

/// Скачать файл пакета: (путь, предел байт) → содержимое.
type Fetch<'a> = &'a dyn Fn(&str, u64) -> Result<Vec<u8>, String>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileInfo {
    sha256: String,
    size: u64,
}

#[derive(Clone, Debug)]
pub struct Manifest {
    version: i64,
    min_desktop: Option<String>,
    files: BTreeMap<String, FileInfo>,
    themes: Vec<serde_json::Value>,
}

struct State {
    root: PathBuf,
    /// Папка активного пакета; None — встроенные файлы.
    active: Option<PathBuf>,
    bundled_version: i64,
    bundled_themes: Vec<serde_json::Value>,
    app_version: String,
}

static STATE: OnceLock<Mutex<State>> = OnceLock::new();
/// Одна проверка за раз: повторный вызов во время скачивания ничего не делает.
static CHECKING: Mutex<()> = Mutex::new(());

// ─────────────────────────── чистые части (тесты внизу) ───────────────────────────

/// None для любого повреждённого манифеста, опасного пути или размера сверх пределов
/// (файл > MAX_FILE_BYTES, пакет > MAX_PACK_BYTES или > MAX_PACK_FILES файлов): такой манифест не применяется.
pub fn parse_manifest(text: &str) -> Option<Manifest> {
    let o: serde_json::Value = serde_json::from_str(text).ok()?;
    let entries = o.get("files")?.as_object()?;
    if entries.len() > MAX_PACK_FILES {
        return None;
    }
    let mut files = BTreeMap::new();
    let mut total: u64 = 0;
    for (path, f) in entries {
        if !is_safe_path(path) {
            return None;
        }
        let sha = f.get("sha256")?.as_str()?.to_ascii_lowercase();
        if sha.len() != 64 || !sha.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        let size = f.get("size")?.as_u64()?;
        total = total.checked_add(size)?;
        if size > MAX_FILE_BYTES || total > MAX_PACK_BYTES {
            return None;
        }
        files.insert(path.clone(), FileInfo { sha256: sha, size });
    }
    Some(Manifest {
        version: o.get("version")?.as_i64()?,
        min_desktop: o
            .get("minDesktopVersion")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        files,
        themes: o
            .get("themes")
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default(),
    })
}

/// Относительный путь, прямые слеши, без `..` и скрытых файлов: пакет пишет только в свою папку.
pub fn is_safe_path(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 200
        && !path.starts_with('/')
        && !path.contains('\\')
        && !path.contains('\0')
        && !path.contains(':')
        && path
            .split('/')
            .all(|s| !s.is_empty() && !s.starts_with('.'))
}

fn version_parts(v: &str) -> Vec<u64> {
    v.trim()
        .split('.')
        .map(|p| p.parse().unwrap_or(0))
        .collect()
}

/// «0.9.36» ≥ «0.9.35»: по числам, недостающие части — нули.
pub fn version_at_least(have: &str, need: &str) -> bool {
    let (a, b) = (version_parts(have), version_parts(need));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (
            a.get(i).copied().unwrap_or(0),
            b.get(i).copied().unwrap_or(0),
        );
        if x != y {
            return x > y;
        }
    }
    true
}

/// Ставить пакет, только если он новее того, что уже работает, и эта версия десктопа его понимает.
pub fn should_install(remote: &Manifest, current_version: i64, app_version: &str) -> bool {
    remote.version > current_version
        && remote
            .min_desktop
            .as_deref()
            .is_none_or(|need| version_at_least(app_version, need))
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

// ─────────────────────────── хранение ───────────────────────────

fn read_active(root: &Path) -> Option<(PathBuf, Manifest)> {
    let n: i64 = fs::read_to_string(root.join("current"))
        .ok()?
        .trim()
        .parse()
        .ok()?;
    let dir = root.join(format!("v{n}"));
    let manifest = parse_manifest(&fs::read_to_string(dir.join("manifest.json")).ok()?)?;
    Some((dir, manifest))
}

/// Вызывается из `setup`: папка пакета — в данных приложения, не в Documents (это не данные пользователя).
pub fn init<R: Runtime>(app: &AppHandle<R>) {
    let Ok(data) = app.path().app_data_dir() else {
        return;
    };
    let root = data.join("stylepack");
    let _ = fs::create_dir_all(&root);
    let bundled = app
        .asset_resolver()
        .get("vector/manifest.json".to_string())
        .and_then(|a| parse_manifest(&String::from_utf8_lossy(&a.bytes)));
    let bundled_version = bundled.as_ref().map_or(0, |m| m.version);
    // Пакет, скачанный старым выпуском, не новее встроенного в этот выпуск — не нужен
    let active = read_active(&root)
        .filter(|(_, m)| m.version > bundled_version)
        .map(|(d, _)| d);
    let _ = STATE.set(Mutex::new(State {
        root,
        active,
        bundled_version,
        bundled_themes: bundled.map(|m| m.themes).unwrap_or_default(),
        app_version: app.package_info().version.to_string(),
    }));
}

/// Файл стиля из активного пакета; None — брать встроенный.
pub fn read_asset(rel: &str) -> Option<Vec<u8>> {
    if !is_safe_path(rel) {
        return None;
    }
    let dir = STATE.get()?.lock().ok()?.active.clone()?;
    fs::read(dir.join(rel)).ok()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackInfo {
    /// Номер работающего пакета (встроенного, если с сервера ничего не ставилось).
    version: i64,
    from_server: bool,
    themes: Vec<serde_json::Value>,
    /// Только у проверки: пакет только что поставлен — стиль карты надо пересобрать.
    activated: bool,
}

fn info(state: &State, activated: bool) -> PackInfo {
    let active = state
        .active
        .as_ref()
        .and_then(|d| parse_manifest(&fs::read_to_string(d.join("manifest.json")).ok()?));
    match active {
        Some(m) => PackInfo {
            version: m.version,
            from_server: true,
            themes: m.themes,
            activated,
        },
        None => PackInfo {
            version: state.bundled_version,
            from_server: false,
            themes: state.bundled_themes.clone(),
            activated,
        },
    }
}

fn http_get(agent: &ureq::Agent, url: &str, max: u64) -> Result<Vec<u8>, String> {
    let resp = agent
        .get(url)
        .set("Cache-Control", "no-cache")
        .set("User-Agent", "TrophyNavigator-Desktop")
        .call()
        .map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    resp.into_reader()
        .take(max + 1)
        .read_to_end(&mut buf)
        .map_err(|e| e.to_string())?;
    if buf.len() as u64 > max {
        return Err("файл больше заявленного".into());
    }
    Ok(buf)
}

/// Скачать и включить пакет. Ok(true) — новый пакет стал активным. Блокирующая.
/// `on_start(версия)` — перед скачиванием, только когда новый пакет действительно ставится.
fn update(manifest_text: &str, fetch: Fetch, on_start: &dyn Fn(i64)) -> Result<bool, String> {
    let remote = parse_manifest(manifest_text).ok_or("манифест пакета повреждён")?;
    let (root, active_dir, current, app_version) = {
        let st = STATE
            .get()
            .ok_or("пакет стиля не инициализирован")?
            .lock()
            .map_err(|e| e.to_string())?;
        let active = st.active.as_ref().and_then(|d| {
            Some((
                d.clone(),
                parse_manifest(&fs::read_to_string(d.join("manifest.json")).ok()?)?,
            ))
        });
        let current = active
            .as_ref()
            .map_or(st.bundled_version, |(_, m)| m.version);
        (st.root.clone(), active, current, st.app_version.clone())
    };
    if !should_install(&remote, current, &app_version) {
        return Ok(false);
    }
    on_start(remote.version);

    let staging = root.join(format!("staging-v{}", remote.version));
    let _ = fs::remove_dir_all(&staging);
    let result = (|| -> Result<(), String> {
        for (path, want) in &remote.files {
            let target = staging.join(path);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            // Неизменённый файл берётся из активного пакета, если он там цел
            let reused = active_dir.as_ref().and_then(|(d, m)| {
                (m.files.get(path) == Some(want))
                    .then(|| fs::read(d.join(path)).ok())
                    .flatten()
            });
            let bytes = match reused.filter(|b| sha256_hex(b) == want.sha256) {
                Some(b) => b,
                // want.size ≤ MAX_FILE_BYTES — проверено в parse_manifest; больше заявленного http_get не читает
                None => fetch(path, want.size).map_err(|e| format!("{path}: {e}"))?,
            };
            if bytes.len() as u64 != want.size || sha256_hex(&bytes) != want.sha256 {
                return Err(format!("{path}: контрольная сумма не совпала"));
            }
            fs::write(&target, &bytes).map_err(|e| e.to_string())?;
        }
        fs::write(staging.join("manifest.json"), manifest_text).map_err(|e| e.to_string())
    })();
    if let Err(e) = result {
        let _ = fs::remove_dir_all(&staging);
        return Err(e);
    }

    // Переключение: готовая папка получает имя, потом переезжает указатель
    let final_dir = root.join(format!("v{}", remote.version));
    let _ = fs::remove_dir_all(&final_dir);
    fs::rename(&staging, &final_dir).map_err(|e| e.to_string())?;
    let tmp = root.join("current.tmp");
    fs::write(&tmp, remote.version.to_string()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, root.join("current")).map_err(|e| e.to_string())?;
    if let Some(st) = STATE.get() {
        if let Ok(mut st) = st.lock() {
            st.active = Some(final_dir.clone());
        }
    }
    // Старые пакеты больше не нужны
    if let Ok(entries) = fs::read_dir(&root) {
        for e in entries.flatten() {
            if e.path().is_dir() && e.path() != final_dir {
                let _ = fs::remove_dir_all(e.path());
            }
        }
    }
    Ok(true)
}

fn check_blocking<R: Runtime>(app: AppHandle<R>) -> Result<PackInfo, String> {
    let _guard = CHECKING
        .try_lock()
        .map_err(|_| "проверка уже идёт".to_string())?;
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        .timeout_read(Duration::from_secs(30))
        .build();
    let text = http_get(
        &agent,
        &format!("{BASE_URL}manifest.json"),
        MAX_MANIFEST_BYTES,
    )
    .map_err(|e| format!("нет связи с сервером стиля: {e}"))?;
    let text = String::from_utf8(text).map_err(|_| "манифест пакета повреждён".to_string())?;
    let started = std::cell::Cell::new(None);
    let result = update(
        &text,
        &|path, max| http_get(&agent, &format!("{BASE_URL}{path}"), max),
        &|version| {
            started.set(Some(version));
            let _ = app.emit(
                EVENT,
                serde_json::json!({ "phase": "start", "version": version }),
            );
        },
    );
    if let Some(version) = started.get() {
        let phase = if result.is_ok() { "done" } else { "error" };
        let _ = app.emit(
            EVENT,
            serde_json::json!({ "phase": phase, "version": version }),
        );
    }
    let activated = result?;
    let st = STATE
        .get()
        .ok_or("пакет стиля не инициализирован")?
        .lock()
        .map_err(|e| e.to_string())?;
    Ok(info(&st, activated))
}

/// Какой пакет работает сейчас — без сети.
#[tauri::command]
pub fn tnmaps_stylepack_info() -> Result<PackInfo, String> {
    let st = STATE
        .get()
        .ok_or("пакет стиля не инициализирован")?
        .lock()
        .map_err(|e| e.to_string())?;
    Ok(info(&st, false))
}

/// Проверить сервер и поставить новый пакет, если он есть.
#[tauri::command]
pub async fn tnmaps_stylepack_check<R: Runtime>(app: AppHandle<R>) -> Result<PackInfo, String> {
    tauri::async_runtime::spawn_blocking(move || check_blocking(app))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHA_A: &str = "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb";

    fn manifest(version: i64, extra: &str) -> String {
        format!(
            r#"{{"version":{version},"minAppVersionCode":423{extra},"files":{{"theme-topo.json":{{"sha256":"{SHA_A}","size":1}}}},"themes":[{{"id":"topo","title":"Топо"}}]}}"#
        )
    }

    #[test]
    fn parses_server_manifest() {
        let m = parse_manifest(&manifest(19, "")).unwrap();
        assert_eq!(m.version, 19);
        assert_eq!(m.files.len(), 1);
        assert_eq!(m.themes[0]["id"], "topo");
        assert!(m.min_desktop.is_none());
    }

    #[test]
    fn rejects_unsafe_or_broken() {
        let bad_path =
            format!(r#"{{"version":1,"files":{{"../x.json":{{"sha256":"{SHA_A}","size":1}}}}}}"#);
        assert!(parse_manifest(&bad_path).is_none());
        assert!(
            parse_manifest(r#"{"version":1,"files":{"a.json":{"sha256":"zz","size":1}}}"#)
                .is_none()
        );
        assert!(parse_manifest("not json").is_none());
        for p in ["/abs", "a\\b", ".hidden", "a//b", "a/../b", "C:x", ""] {
            assert!(!is_safe_path(p), "{p}");
        }
        assert!(is_safe_path("sprites/osm-liberty@2x.png"));
    }

    #[test]
    fn rejects_oversized_files_and_packs() {
        let one = |size: u64| {
            format!(r#"{{"version":1,"files":{{"a.json":{{"sha256":"{SHA_A}","size":{size}}}}}}}"#)
        };
        assert!(parse_manifest(&one(MAX_FILE_BYTES)).is_some());
        assert!(parse_manifest(&one(MAX_FILE_BYTES + 1)).is_none());
        assert!(parse_manifest(&one(u64::MAX)).is_none());
        // Каждый файл в пределе, а вместе больше пакета
        let many = |n: u64| {
            let files: Vec<String> = (0..n)
                .map(|i| format!(r#""f{i}.json":{{"sha256":"{SHA_A}","size":{MAX_FILE_BYTES}}}"#))
                .collect();
            format!(r#"{{"version":1,"files":{{{}}}}}"#, files.join(","))
        };
        let fit = MAX_PACK_BYTES / MAX_FILE_BYTES;
        assert!(parse_manifest(&many(fit)).is_some());
        assert!(parse_manifest(&many(fit + 1)).is_none());
        // Слишком много файлов
        let tiny: Vec<String> = (0..=MAX_PACK_FILES)
            .map(|i| format!(r#""t{i}.json":{{"sha256":"{SHA_A}","size":1}}"#))
            .collect();
        assert!(parse_manifest(&format!(
            r#"{{"version":1,"files":{{{}}}}}"#,
            tiny.join(",")
        ))
        .is_none());
    }

    #[test]
    fn install_rules() {
        let m = parse_manifest(&manifest(20, "")).unwrap();
        assert!(should_install(&m, 19, "0.9.36"));
        assert!(!should_install(&m, 20, "0.9.36"));
        // Android-номер сборки (minAppVersionCode) десктоп не смотрит, свой порог — minDesktopVersion
        let m = parse_manifest(&manifest(20, r#","minDesktopVersion":"0.9.40""#)).unwrap();
        assert!(!should_install(&m, 19, "0.9.36"));
        assert!(should_install(&m, 19, "0.10.0"));
        assert!(version_at_least("0.9.36", "0.9.36"));
        assert!(!version_at_least("0.9.9", "0.9.36"));
    }

    #[test]
    fn update_downloads_verifies_and_switches() {
        let root = std::env::temp_dir().join(format!("tn-stylepack-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let _ = STATE.set(Mutex::new(State {
            root: root.clone(),
            active: None,
            bundled_version: 18,
            bundled_themes: vec![],
            app_version: "0.9.36".into(),
        }));
        // Битый файл: пакет не ставится, указателя нет
        let err = update(&manifest(19, ""), &|_, _| Ok(b"b".to_vec()), &|_| {}).unwrap_err();
        assert!(err.contains("контрольная сумма"), "{err}");
        assert!(!root.join("current").exists());
        // Не новее встроенного — ничего не делаем
        assert!(!update(&manifest(18, ""), &|_, _| Ok(b"a".to_vec()), &|_| {}).unwrap());
        // Правильный пакет
        assert!(update(&manifest(19, ""), &|_, _| Ok(b"a".to_vec()), &|_| {}).unwrap());
        assert_eq!(fs::read_to_string(root.join("current")).unwrap(), "19");
        assert_eq!(read_asset("theme-topo.json").unwrap(), b"a");
        assert!(read_asset("../current").is_none());
        // Следующий пакет берёт неизменённый файл из активного, без сети
        assert!(update(&manifest(20, ""), &|_, _| Err("нет сети".into()), &|_| {}).unwrap());
        assert!(!root.join("v19").exists());
        let _ = fs::remove_dir_all(&root);
    }
}
