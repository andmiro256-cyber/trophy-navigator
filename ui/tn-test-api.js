/*
 * window.__tnTest — нейтральный тестовый API карты (план MapLibre v3, этап 0б, пакеты 0б.2 и 0б.6).
 *
 * VERSION 2 (10.10): методы G0–G8 из tools/harness/API-GAPS.md (Опус 2, #2729) — поля записей, geometry,
 * selection, style, layers/resetTileStats, popup/closePopup, controls, dispatchAt. Общее для движков
 * считается по модели и состоянию приложения; зависящее от движка — в мосте (Leaflet ниже, MapLibre — этап 1).
 *
 * Харнесс аудита (s1…s19.py, wd.py) и golden-генератор обращаются к карте только через него, а не к
 * Leaflet напрямую: одни и те же сценарии идут на 0.9.34, на Leaflet-адаптере и на MapLibre-адаптере.
 *
 * Зависимость от движка — только «мост» (bridge): getView/setView/project/unproject/onMap. Сейчас мост —
 * Leaflet (глобальная map); после 0б.5 — фасад TnMap. «Что под курсором» (pick) считается по геометрии
 * модели в пикселях экрана (TnGeo), а не по объектам движка, — поэтому одинаково на обоих движках.
 *
 * Глобальные переменные основного скрипта (map, waypoints, tracks, routes) читаются лениво: в общем
 * лексическом окружении скриптов страницы они видны, в тестах — подменяются через _setHost.
 */
(function (root) {
  'use strict';
  const VERSION = 2;
  const G = () => root.TnGeo || (typeof require === 'function' ? require('./tn-geo.js') : null);

  /* eslint-disable no-undef */
  let host = {
    map: () => (typeof map !== 'undefined' ? map : null),
    waypoints: () => (typeof waypoints !== 'undefined' ? waypoints : []),
    tracks: () => (typeof tracks !== 'undefined' ? tracks : []),
    routes: () => (typeof routes !== 'undefined' ? routes : []),
    selection: () => ({
      wp: typeof activeWaypoint !== 'undefined' && activeWaypoint?.wpData ? activeWaypoint.wpData.id : null,
      track: typeof selectedTrackId !== 'undefined' && selectedTrackId != null ? `trk_${selectedTrackId}` : null,
      route: typeof selectedRouteId !== 'undefined' && selectedRouteId != null ? `rte_${selectedRouteId}` : null,
    }),
    layerNames: () => ({
      base: typeof currentBaseLayer !== 'undefined' ? currentBaseLayer : null,
      baseName: typeof currentBaseLayerName !== 'undefined' ? currentBaseLayerName : '',
      overlays: typeof overlayLayers !== 'undefined' ? overlayLayers : {},
      offline: typeof offlineMaps !== 'undefined' ? offlineMaps : {},
    }),
  };
  /* eslint-enable no-undef */

  // ─── мост к движку (Leaflet 0.9.34) ───
  const leafletBridge = {
    engine: 'leaflet',
    getView() {
      const m = host.map(); const c = m.getCenter();
      return { center: { lat: c.lat, lng: c.lng }, zoom: m.getZoom(), bearing: 0, pitch: 0 };
    },
    setView(v) { host.map().setView([v.center.lat, v.center.lng], v.zoom, { animate: false }); },
    // без округления до целого пикселя (latLngToContainerPoint Leaflet округляет): MapLibre отдаёт дробные px,
    // и сравнение движков не должно терять ~0.5 px на каждом пересчёте
    project(p) {
      const m = host.map(), L = root.L;
      const pt = m.project(L.latLng(p.lat, p.lng)).subtract(m.getPixelOrigin()).add(m._getMapPanePos());
      return { x: pt.x, y: pt.y };
    },
    unproject(pt) {
      const m = host.map(), L = root.L;
      const ll = m.unproject(L.point(pt.x, pt.y).add(m.getPixelOrigin()).subtract(m._getMapPanePos()));
      return { lat: ll.lat, lng: ll.lng };
    },
    onMap(layer) { const m = host.map(); return !!(layer && m && m.hasLayer(layer)); },
    size() { const s = host.map().getSize(); return { x: s.x, y: s.y }; },
    /** G4: как нарисовано движком — у слоя, не из модели. obj — { kind, layer, marker? }. */
    style(obj) {
      if (obj.kind === 'track' || obj.kind === 'route') {
        const o = obj.layer?.options || {};
        return { kind: obj.kind, color: o.color, width: o.weight, opacity: o.opacity, dash: o.dashArray || '' };
      }
      const mk = obj.marker, ic = mk?._icon, m = host.map();
      const c = mk?.wpCircle && m.hasLayer(mk.wpCircle) ? mk.wpCircle.options : null;
      return { kind: 'wp', iconPx: ic ? ic.offsetWidth : null, iconCss: ic ? ic.style.width : null,
        radius: c ? { fill: c.fillColor, stroke: c.color, fillOpacity: c.fillOpacity } : null };
    },
    /** G5: слои подложки снизу вверх со счётчиками тайлов с последнего resetTileStats. */
    layers() {
      const m = host.map(), L = root.L; hookTiles();
      const n = host.layerNames(); const out = [];
      m.eachLayer(l => {
        const gl = typeof l.getMaplibreMap === 'function';
        if (!(l instanceof L.GridLayer) && !gl) return;
        let kind = 'other', name = '';
        const ovName = Object.keys(n.overlays).find(k => n.overlays[k] === l);
        const offEntry = Object.values(n.offline).find(e => e && e.layer === l);
        if (l === n.base) { kind = /^tnmap:/.test(n.baseName) || gl ? 'tnmaps' : 'base'; name = n.baseName; }
        else if (ovName) { kind = 'overlay'; name = ovName; }
        else if (offEntry) { kind = 'offline'; name = offEntry.name || ''; }
        else if (gl) kind = 'tnmaps';
        const tiles = Object.values(l._tiles || {}).filter(t => t.current);
        const c = l.__tnCnt || { requested: 0, loaded: 0, errors: 0, errorSamples: [] };
        const cont = l.getContainer ? l.getContainer() : l._container;
        out.push({ key: L.stamp(l), kind, name, visible: !!cont && root.getComputedStyle(cont).display !== 'none',
          opacity: l.options?.opacity != null ? Number(l.options.opacity) : 1, zIndex: l.options?.zIndex,
          tiles: { requested: c.requested, loaded: c.loaded, errors: c.errors, errorSamples: c.errorSamples.slice() },
          view: { loaded: tiles.filter(t => t.loaded).length, total: tiles.length } });
      });
      return out;
    },
    resetTileStats() { hookTiles(); host.map().eachLayer(l => { if (l.__tnCnt) Object.assign(l.__tnCnt, { requested: 0, loaded: 0, errors: 0, errorSamples: [] }); }); return true; },
    /** G6: всплывающее окно карты. */
    popup() { const p = root.document.querySelector('.leaflet-popup'); return { open: !!p, text: p ? p.innerText : '', selector: '.leaflet-popup' }; },
    closePopup() { host.map().closePopup(); return true; },
    /** G7: CSS-селекторы кнопок карты, которые рисует движок. */
    controls() {
      return { zoomIn: '.leaflet-control-zoom-in', zoomOut: '.leaflet-control-zoom-out', zoomLevel: '.zoom-display-ctrl',
        hand: '#btn-hand', threeD: '[title^="3D-вид"]', container: '.leaflet-control-container' };
    },
    /** G8: отдать событие мыши объекту, выбранному pick, его же обработчиком (как будто мышь до него дошла). */
    dispatchAt(target, pt, type, latlng) {
      const m = host.map(), L = root.L;
      const r = m.getContainer().getBoundingClientRect();
      const ll = L.latLng(latlng.lat, latlng.lng);
      const originalEvent = new root.MouseEvent(type, { clientX: r.left + pt.x, clientY: r.top + pt.y, button: type === 'contextmenu' ? 2 : 0, bubbles: true, cancelable: true });
      target.fire(type, { latlng: ll, layerPoint: m.latLngToLayerPoint(ll), containerPoint: L.point(pt.x, pt.y), originalEvent });
      return true;
    },
  };
  /** Счётчики тайлов на каждом GridLayer (один раз на слой; новые слои — по layeradd). */
  function hookTiles() {
    const m = host.map(), L = root.L;
    if (!m || !L) return;
    const hook = l => {
      if (!(l instanceof L.GridLayer) || l.__tnCnt) return;
      l.__tnCnt = { requested: 0, loaded: 0, errors: 0, errorSamples: [] };
      l.on('tileloadstart', () => l.__tnCnt.requested++);
      l.on('tileload', () => l.__tnCnt.loaded++);
      l.on('tileerror', ev => { const c = l.__tnCnt; c.errors++; if (c.errorSamples.length < 3) c.errorSamples.push(String(ev.tile && ev.tile.src).slice(0, 120)); });
    };
    if (!m.__tnTilesHooked) { m.eachLayer(hook); m.on('layeradd', e => hook(e.layer)); m.__tnTilesHooked = true; }
  }
  // мост через фасад TnMap (0б.5): тот же путь, что у приложения; без фасада — Leaflet напрямую
  /* eslint-disable no-undef */
  const facade = () => (typeof tnMap !== 'undefined' ? tnMap : null);
  /* eslint-enable no-undef */
  const facadeBridge = {
    get engine() { return facade().engine; },
    getView: () => facade().getView(),
    setView: v => facade().setView(v, { animate: false }),
    project: p => facade().project(p),
    unproject: pt => facade().unproject(pt),
    onMap: l => leafletBridge.onMap(l),          // слои — пока Leaflet (отрисовка переходит в адаптер позже)
    size: () => facade().getSize(),
    style: o => leafletBridge.style(o), layers: () => leafletBridge.layers(), resetTileStats: () => leafletBridge.resetTileStats(),
    popup: () => leafletBridge.popup(), closePopup: () => leafletBridge.closePopup(), controls: () => leafletBridge.controls(),
    dispatchAt: (t, pt, type, ll) => leafletBridge.dispatchAt(t, pt, type, ll),
  };
  let bridge = null;
  const activeBridge = () => bridge || (facade() ? facadeBridge : leafletBridge);

  // ─── модель в нейтральном виде ───
  const B = () => activeBridge();
  // G0: набор точки в 0.9.34 — marker._setId (в wpData его нет); G1: поля модели для проверок данных
  const wpRec = w => {
    const d = w.wpData || {};
    return { id: d.id, name: d.name, lat: d.lat, lng: d.lng, radius: Number(d.radius) || 0,
      setId: w._setId ?? d.setId ?? null, desc: d.desc || '', icon: d.icon || '', color: d.color || '', num: d.num,
      visible: B().onMap(w), radiusVisible: B().onMap(w.wpCircle) };
  };
  const lineRec = (kind, t) => ({
    id: `${kind === 'track' ? 'trk' : 'rte'}_${t.id}`, rawId: t.id, name: t.name, points: t.points?.length || 0,
    segments: kind === 'track' ? (G().trackSegments(t.points || [], t.pointsData).length) : 1,
    color: t.color, width: t.width,
    visible: B().onMap(t.polyline),
  });
  const lineById = id => {
    const m = /^(trk|rte)_(.+)$/.exec(String(id)); if (!m) return null;
    const t = (m[1] === 'trk' ? host.tracks() : host.routes()).find(x => String(x.id) === m[2]);
    return t ? { kind: m[1] === 'trk' ? 'track' : 'route', t } : null;
  };
  const markerById = id => host.waypoints().find(mk => mk.wpData && mk.wpData.id === id) || null;
  const plainLL = p => ({ lat: p.lat, lng: p.lng });
  /** G2: координаты линии трека/маршрута или точки WP; breaks — индексы начала кусков трека (0.9.34). */
  function geometry(id) {
    const l = lineById(id);
    if (l) {
      const pd = l.kind === 'track' ? (l.t.pointsData || []) : [];
      return { kind: l.kind, id, points: (l.t.points || []).map(plainLL), breaks: pd.map((d, i) => (d && d.seg ? i : -1)).filter(i => i > 0) };
    }
    const mk = markerById(id);
    return mk ? { kind: 'wp', id, points: [plainLL(mk.wpData)], breaks: [] } : null;
  }
  /** G4: как объект нарисован движком. */
  function style(id) {
    const l = lineById(id);
    if (l) return B().style({ kind: l.kind, layer: l.t.polyline });
    const mk = markerById(id);
    return mk ? B().style({ kind: 'wp', marker: mk }) : null;
  }
  /** G8: событие мыши объекту, которого pick выбрал первым в точке. */
  function dispatchAt(pt, type = 'contextmenu', o = {}) {
    const hit = pick(pt, o)[0];
    if (!hit) return null;
    let target = null;
    if (hit.kind === 'track' || hit.kind === 'route') target = lineById(hit.id)?.t.polyline || null;
    else { const mk = markerById(hit.id); target = hit.kind === 'wp' ? mk : mk && mk.wpCircle; }
    if (!target) return { ...hit, dispatched: false };
    B().dispatchAt(target, pt, type, B().unproject(pt));
    return { ...hit, dispatched: true };
  }
  function entities() {
    return {
      wp: host.waypoints().map(wpRec),
      track: host.tracks().map(t => lineRec('track', t)),
      route: host.routes().map(r => lineRec('route', r)),
    };
  }

  // ─── «что под курсором»: геометрия модели в пикселях ───
  function segDistPx(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }
  function nearestOnLine(pt, points, pointsData) {
    let best = null;
    const px = points.map(p => B().project(p));
    for (let i = 1; i < px.length; i++) {
      if (pointsData?.[i]?.seg) continue;                       // разрыв куска трека — линии нет
      const d = segDistPx(pt, px[i - 1], px[i]);
      if (!best || d < best.distPx) best = { distPx: d, index: i - 1 };
    }
    if (px.length === 1) best = { distPx: G().screenDistance(pt, px[0]), index: 0 };
    return best;
  }
  /** Порядок как у пользователя сегодня: точка WP над линиями, маршрут над треком, радиус — последним. */
  const PRIORITY = { wp: 0, route: 1, track: 2, wpRadius: 3 };
  function pick(pt, o = {}) {
    const tol = Number.isFinite(o.tolerancePx) ? o.tolerancePx : 8;
    const kinds = o.kinds ? new Set(o.kinds) : null;
    const want = k => !kinds || kinds.has(k);
    const out = [];
    const ll = B().unproject(pt);
    for (const w of host.waypoints()) {
      if (!B().onMap(w)) continue;
      const d = w.wpData; const c = B().project(d);
      const distPx = G().screenDistance(pt, c);
      if (want('wp') && distPx <= Math.max(tol, 12)) out.push({ kind: 'wp', id: d.id, distPx });
      else if (want('wpRadius') && Number(d.radius) > 0 && B().onMap(w.wpCircle) && G().distance(d, ll) <= Number(d.radius)) {
        out.push({ kind: 'wpRadius', id: d.id, distPx });
      }
    }
    for (const [kind, list] of [['route', host.routes()], ['track', host.tracks()]]) {
      if (!want(kind)) continue;
      for (const t of list) {
        if (!B().onMap(t.polyline) || !(t.points?.length)) continue;
        const n = nearestOnLine(pt, t.points, kind === 'track' ? t.pointsData : null);
        if (n && n.distPx <= tol) out.push({ kind, id: `${kind === 'track' ? 'trk' : 'rte'}_${t.id}`, rawId: t.id, distPx: n.distPx, index: n.index });
      }
    }
    return out.sort((a, b) => (PRIORITY[a.kind] - PRIORITY[b.kind]) || (a.distPx - b.distPx));
  }

  function stats() {
    const e = entities();
    const cnt = (list, f) => list.filter(f).length;
    return {
      engine: B().engine, zoom: B().getView().zoom,
      wp: e.wp.length, wpOnMap: cnt(e.wp, x => x.visible), wpRadiusOnMap: cnt(e.wp, x => x.radiusVisible),
      tracks: e.track.length, tracksOnMap: cnt(e.track, x => x.visible), trackSegments: e.track.reduce((s, t) => s + t.segments, 0),
      routes: e.route.length, routesOnMap: cnt(e.route, x => x.visible),
    };
  }

  const api = {
    VERSION,
    get engine() { return B().engine; },
    getView: () => B().getView(),
    setView: v => B().setView(v),
    project: p => B().project(p),
    unproject: pt => B().unproject(pt),
    size: () => B().size(),
    entities, pick, stats, geometry, style, dispatchAt,
    selection: () => host.selection(),
    layers: () => B().layers(),
    resetTileStats: () => B().resetTileStats(),
    popup: () => B().popup(),
    closePopup: () => B().closePopup(),
    controls: () => B().controls(),
    _setHost: h => { host = { ...host, ...h }; },
    _setBridge: b => { bridge = b || null; },
    _leafletBridge: leafletBridge,
  };
  root.__tnTest = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
