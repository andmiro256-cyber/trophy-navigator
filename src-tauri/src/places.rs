//! Названия из скачанных карт TrophyNav Maps — для поиска без интернета (обычного и голосового).
//!
//! В карте области на z11–z12 уже есть все населённые пункты (слой `place`), урочища и прочие
//! подписи `outdoor`, высоты и парки: у Рязанской ~5 тыс. названий в ~2,3 тыс. тайлов. Тайлы читаются
//! из `<id>.mbtiles`, из Mapbox Vector Tile берутся только точки с именем (свой маленький разбор
//! protobuf — зависимостей не добавляем). Результат кэшируется рядом с картой: `<id>.places.json`,
//! ключ — размер и время изменения файла карты (обновили карту — индекс пересоберётся).

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::Path;

/// Зумы, на которых собираем подписи: на z11 — все НП, z12 добавляет часть POI и урочищ.
const ZOOMS: [u32; 2] = [11, 12];
const LAYERS: [&str; 6] = ["place", "outdoor", "mountain_peak", "park", "water_name", "poi"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Place {
    /// имя (русское, если есть)
    pub n: String,
    /// слой карты
    pub l: String,
    /// класс (city, town, village, hamlet, locality…)
    pub c: String,
    pub lat: f64,
    pub lon: f64,
}

#[derive(Serialize, Deserialize)]
struct Cache {
    size: u64,
    modified: u64,
    places: Vec<Place>,
}

/// Названия карты области (из кэша или собрать заново).
pub fn places_for(map: &Path) -> Result<Vec<Place>, String> {
    let meta = fs::metadata(map).map_err(|e| format!("карта не найдена: {e}"))?;
    let size = meta.len();
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let cache_path = map.with_extension("places.json");
    if let Ok(text) = fs::read_to_string(&cache_path) {
        if let Ok(c) = serde_json::from_str::<Cache>(&text) {
            if c.size == size && c.modified == modified {
                return Ok(c.places);
            }
        }
    }
    let places = extract(map)?;
    let tmp = cache_path.with_extension("json.tmp");
    if let Ok(text) = serde_json::to_string(&Cache { size, modified, places: places.clone() }) {
        if fs::write(&tmp, text).is_ok() {
            let _ = fs::rename(&tmp, &cache_path);
        }
    }
    Ok(places)
}

fn extract(map: &Path) -> Result<Vec<Place>, String> {
    let conn = Connection::open_with_flags(map, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for z in ZOOMS {
        let mut stmt = conn
            .prepare("select tile_column, tile_row, tile_data from tiles where zoom_level = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([z], |r| Ok((r.get::<_, u32>(0)?, r.get::<_, u32>(1)?, r.get::<_, Vec<u8>>(2)?)))
            .map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            let (x, tms_y, data) = row;
            let y = (1u32 << z) - 1 - tms_y;
            let data = if data.starts_with(&[0x1f, 0x8b]) {
                let mut d = Vec::new();
                if flate2::read::GzDecoder::new(&data[..]).read_to_end(&mut d).is_err() {
                    continue;
                }
                d
            } else {
                data
            };
            for p in tile_points(&data, z, x, y) {
                // одно имя в одном месте (≈1 км) — один раз; соседние тайлы повторяют подписи
                let key = (p.n.clone(), (p.lat * 100.0).round() as i64, (p.lon * 100.0).round() as i64);
                if seen.insert(key) {
                    out.push(p);
                }
            }
        }
    }
    Ok(out)
}

// ─── Минимальный разбор Mapbox Vector Tile (protobuf) ───

struct Pb<'a> {
    b: &'a [u8],
    i: usize,
}

impl<'a> Pb<'a> {
    fn new(b: &'a [u8]) -> Self {
        Self { b, i: 0 }
    }
    fn varint(&mut self) -> Option<u64> {
        let mut v = 0u64;
        for shift in (0..64).step_by(7) {
            let byte = *self.b.get(self.i)?;
            self.i += 1;
            v |= ((byte & 0x7f) as u64) << shift;
            if byte & 0x80 == 0 {
                return Some(v);
            }
        }
        None
    }
    /// (поле, тип провода) или None в конце
    fn key(&mut self) -> Option<(u32, u8)> {
        if self.i >= self.b.len() {
            return None;
        }
        let k = self.varint()?;
        Some(((k >> 3) as u32, (k & 7) as u8))
    }
    fn bytes(&mut self) -> Option<&'a [u8]> {
        let n = self.varint()? as usize;
        let s = self.b.get(self.i..self.i.checked_add(n)?)?;
        self.i += n;
        Some(s)
    }
    fn skip(&mut self, wire: u8) -> Option<()> {
        match wire {
            0 => {
                self.varint()?;
            }
            1 => self.i += 8,
            2 => {
                self.bytes()?;
            }
            5 => self.i += 4,
            _ => return None,
        }
        (self.i <= self.b.len()).then_some(())
    }
}

fn packed(b: &[u8]) -> Vec<u32> {
    let mut p = Pb::new(b);
    let mut v = Vec::new();
    while p.i < b.len() {
        match p.varint() {
            Some(x) => v.push(x as u32),
            None => break,
        }
    }
    v
}

fn zigzag(n: u32) -> i32 {
    ((n >> 1) as i32) ^ -((n & 1) as i32)
}

/// Строковое значение тега (Value.string_value) или None.
fn value_string(b: &[u8]) -> Option<String> {
    let mut p = Pb::new(b);
    while let Some((f, w)) = p.key() {
        if f == 1 && w == 2 {
            return std::str::from_utf8(p.bytes()?).ok().map(str::to_string);
        }
        p.skip(w)?;
    }
    None
}

/// Точки с именем из нужных слоёв тайла z/x/y (y — XYZ).
pub fn tile_points(data: &[u8], z: u32, x: u32, y: u32) -> Vec<Place> {
    let mut out = Vec::new();
    let mut tile = Pb::new(data);
    while let Some((f, w)) = tile.key() {
        if f != 3 || w != 2 {
            if tile.skip(w).is_none() {
                break;
            }
            continue;
        }
        let Some(layer) = tile.bytes() else { break };
        parse_layer(layer, z, x, y, &mut out);
    }
    out
}

fn parse_layer(b: &[u8], z: u32, x: u32, y: u32, out: &mut Vec<Place>) {
    let mut p = Pb::new(b);
    let mut name = String::new();
    let mut keys: Vec<String> = Vec::new();
    let mut values: Vec<Option<String>> = Vec::new();
    let mut features: Vec<&[u8]> = Vec::new();
    let mut extent = 4096u32;
    while let Some((f, w)) = p.key() {
        match (f, w) {
            (1, 2) => name = p.bytes().and_then(|s| std::str::from_utf8(s).ok()).unwrap_or("").to_string(),
            (2, 2) => match p.bytes() {
                Some(s) => features.push(s),
                None => return,
            },
            (3, 2) => keys.push(p.bytes().and_then(|s| std::str::from_utf8(s).ok()).unwrap_or("").to_string()),
            (4, 2) => values.push(p.bytes().and_then(value_string)),
            (5, 0) => extent = p.varint().unwrap_or(4096) as u32,
            _ => {
                if p.skip(w).is_none() {
                    return;
                }
            }
        }
    }
    if !LAYERS.contains(&name.as_str()) {
        return;
    }
    let n = (1u64 << z) as f64;
    for fb in features {
        let mut fp = Pb::new(fb);
        let (mut tags, mut geom, mut gtype) = (Vec::new(), Vec::new(), 0u64);
        while let Some((f, w)) = fp.key() {
            match (f, w) {
                (2, 2) => tags = fp.bytes().map(packed).unwrap_or_default(),
                (3, 0) => gtype = fp.varint().unwrap_or(0),
                (4, 2) => geom = fp.bytes().map(packed).unwrap_or_default(),
                _ => {
                    if fp.skip(w).is_none() {
                        break;
                    }
                }
            }
        }
        if gtype != 1 || geom.len() < 3 || geom[0] & 7 != 1 {
            continue;
        }
        let tag = |k: &str| -> Option<String> {
            tags.chunks(2).find_map(|kv| {
                (kv.len() == 2 && keys.get(kv[0] as usize).map(String::as_str) == Some(k))
                    .then(|| values.get(kv[1] as usize).cloned().flatten())
                    .flatten()
            })
        };
        let Some(nm) = tag("name:ru").or_else(|| tag("name")).filter(|s| !s.trim().is_empty()) else { continue };
        let class = tag("class").unwrap_or_default();
        // у poi берём только заметное для навигации (вокзал, АЗС и т. п. ищут через онлайн-поиск)
        if name == "poi" && !matches!(class.as_str(), "railway" | "fuel" | "place_of_worship" | "attraction" | "campsite" | "shelter") {
            continue;
        }
        let (px, py) = (zigzag(geom[1]) as f64, zigzag(geom[2]) as f64);
        let fx = (x as f64 + px / extent as f64) / n;
        let fy = (y as f64 + py / extent as f64) / n;
        let lon = fx * 360.0 - 180.0;
        let lat = (std::f64::consts::PI * (1.0 - 2.0 * fy)).sinh().atan().to_degrees();
        out.push(Place { n: nm.trim().to_string(), l: name.clone(), c: class, lat, lon });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn varint(mut v: u64, out: &mut Vec<u8>) {
        loop {
            let b = (v & 0x7f) as u8;
            v >>= 7;
            if v == 0 {
                out.push(b);
                break;
            }
            out.push(b | 0x80);
        }
    }
    fn field_bytes(f: u32, data: &[u8], out: &mut Vec<u8>) {
        varint(((f << 3) | 2) as u64, out);
        varint(data.len() as u64, out);
        out.extend_from_slice(data);
    }
    fn packed_u32(v: &[u32]) -> Vec<u8> {
        let mut o = Vec::new();
        v.iter().for_each(|x| varint(*x as u64, &mut o));
        o
    }

    /// Тайл с одним слоем place и одной точкой «Солотча» (class=village) в центре тайла.
    fn sample_tile() -> Vec<u8> {
        let mut feat = Vec::new();
        field_bytes(2, &packed_u32(&[0, 0, 1, 1]), &mut feat); // name:ru=v0, class=v1
        varint((3 << 3) as u64, &mut feat);
        varint(1, &mut feat); // POINT
        field_bytes(4, &packed_u32(&[9, 4096, 4096]), &mut feat); // MoveTo(1) zigzag(2048,2048)
        let mut layer = Vec::new();
        field_bytes(1, b"place", &mut layer);
        field_bytes(2, &feat, &mut layer);
        field_bytes(3, "name:ru".as_bytes(), &mut layer);
        field_bytes(3, b"class", &mut layer);
        let mut v0 = Vec::new();
        field_bytes(1, "Солотча".as_bytes(), &mut v0);
        let mut v1 = Vec::new();
        field_bytes(1, b"village", &mut v1);
        field_bytes(4, &v0, &mut layer);
        field_bytes(4, &v1, &mut layer);
        varint((5 << 3) as u64, &mut layer);
        varint(4096, &mut layer);
        let mut tile = Vec::new();
        field_bytes(3, &layer, &mut tile);
        tile
    }

    #[test]
    fn parses_named_point_with_position() {
        // z11, тайл под Солотчей
        let (z, x, y) = (11u32, 1250u32, 652u32);
        let p = tile_points(&sample_tile(), z, x, y);
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].n, "Солотча");
        assert_eq!(p[0].c, "village");
        let n = 2048f64;
        let lon = (x as f64 + 0.5) / n * 360.0 - 180.0;
        assert!((p[0].lon - lon).abs() < 1e-9);
        assert!(p[0].lat > 54.0 && p[0].lat < 56.0, "{}", p[0].lat);
    }

    #[test]
    fn garbage_does_not_panic() {
        assert!(tile_points(&[0xff, 0xff, 0xff], 11, 0, 0).is_empty());
        assert!(tile_points(&[], 11, 0, 0).is_empty());
        let mut t = sample_tile();
        t.truncate(t.len() / 2);
        let _ = tile_points(&t, 11, 0, 0);
    }

    /// TND_PLACES_TEST_MBTILES=<карта области> cargo test places_real -- --nocapture
    #[test]
    fn places_real_map() {
        let Ok(path) = std::env::var("TND_PLACES_TEST_MBTILES") else { return };
        let t = std::time::Instant::now();
        let p = extract(Path::new(&path)).unwrap();
        let villages = p.iter().filter(|x| x.l == "place").count();
        println!("всего {} (place {}), {:.2} с", p.len(), villages, t.elapsed().as_secs_f32());
        for want in ["Солотча", "Касимов", "Спас-Клепики", "Ушмор", "Тума"] {
            let hit = p.iter().find(|x| x.n == want);
            println!("{want}: {hit:?}");
            assert!(hit.is_some(), "{want}");
        }
    }
}
