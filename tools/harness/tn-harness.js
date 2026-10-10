// window.__tnh — помощники сценариев аудита поверх window.__tnTest (план MapLibre v3, 0б.6).
// Только __tnTest и DOM приложения, без Leaflet: одни и те же сценарии идут на 0.9.34, Leaflet-адаптере и MapLibre.
// Формат как у hooks.js: тело функции для WebDriver execute/sync (ставит wd.session()).
//
// Контракт __tnTest, на который опираемся: project/unproject — пиксели относительно контейнера #map; setView без
// анимации; entities() — в порядке списков приложения (точки, треки, маршруты), индекс i = i-й объект списка.
const T = () => window.__tnTest;
const at = (list, i) => list[i < 0 ? list.length + i : i];
window.__tnh = {
  /** i-я точка WP (i < 0 — с конца) в нейтральном виде entities().wp. */
  wp: i => at(T().entities().wp, i),
  /** первая точка WP, для которой f(wp) истинно. */
  wpWhere: f => T().entities().wp.find(f),
  track: i => at(T().entities().track, i),
  route: i => at(T().entities().route, i),
  /** точка WP, выбранная сейчас (открыты «Свойства» или меню точки) — API-GAPS G3. */
  selWp: () => { const id = T().selection().wp; return id == null ? null : T().entities().wp.find(w => w.id === id) || null; },
  /** первый трек, у которого больше n точек (иначе первый). */
  longTrack: (n = 100) => { const e = T().entities().track; return e.find(t => t.points > n) || e[0]; },
  /** точки линии / WP по id сущности: [{lat, lng}] (API-GAPS G2). */
  pts: id => T().geometry(id).points,
  /** точка в координатах окна (viewport) — для настоящей мыши через xdotool. */
  xy: ll => { const p = T().project(ll), r = document.getElementById('map').getBoundingClientRect(); return [p.x + r.left, p.y + r.top]; },
  mid: (a, b) => ({ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }),
  /** центрировать на точке; zoom по умолчанию — текущий. */
  go: (ll, zoom) => T().setView({ center: { lat: ll.lat, lng: ll.lng }, zoom: zoom == null ? T().getView().zoom : zoom }),
  /** вписать точки в окно с полями pad с каждой стороны (как Leaflet fitBounds(bounds.pad(pad))) — через project/size. */
  fit: (pts, pad = 0.2) => {
    if (!pts || !pts.length) return null;
    for (let pass = 0; pass < 2; pass++) {
      const px = pts.map(p => T().project(p)), xs = px.map(p => p.x), ys = px.map(p => p.y);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const c = T().unproject({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }), sz = T().size(), z0 = T().getView().zoom;
      const k = Math.min(sz.x / (Math.max(x1 - x0, 1) * (1 + 2 * pad)), sz.y / (Math.max(y1 - y0, 1) * (1 + 2 * pad)));
      T().setView({ center: c, zoom: Math.max(1, Math.min(18, Math.floor(z0 + Math.log2(k)))) });
    }
    return T().getView();
  },
  /** сумма счётчиков тайлов по всем слоям с последнего resetTileStats (как window.__tiles аудита 07.10). */
  tiles: () => {
    const o = { ok: 0, err: 0, req: 0, errs: [] };
    for (const l of T().layers()) { o.ok += l.tiles.loaded; o.err += l.tiles.errors; o.req += l.tiles.requested; o.errs.push(...l.tiles.errorSamples); }
    o.errs = o.errs.slice(0, 3);
    return o;
  },
  /** офлайн-карты приложения с флагом «слой на карте»: [[имя, на карте]]. */
  offline: () => {
    const on = new Set(T().layers().filter(l => l.kind === 'offline').map(l => l.name));
    return Object.values(typeof offlineMaps !== 'undefined' ? offlineMaps : {}).map(e => [e.name, on.has(e.name)]);
  },
};
return Object.keys(window.__tnh).length;
