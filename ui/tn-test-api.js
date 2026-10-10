/*
 * window.__tnTest — нейтральный тестовый API карты (план MapLibre v3, этап 0б, пакет 0б.2).
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
  const VERSION = 1;
  const G = () => root.TnGeo || (typeof require === 'function' ? require('./tn-geo.js') : null);

  /* eslint-disable no-undef */
  let host = {
    map: () => (typeof map !== 'undefined' ? map : null),
    waypoints: () => (typeof waypoints !== 'undefined' ? waypoints : []),
    tracks: () => (typeof tracks !== 'undefined' ? tracks : []),
    routes: () => (typeof routes !== 'undefined' ? routes : []),
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
  };
  let bridge = leafletBridge;

  // ─── модель в нейтральном виде ───
  const wpRec = w => {
    const d = w.wpData || {};
    return { id: d.id, name: d.name, lat: d.lat, lng: d.lng, radius: Number(d.radius) || 0, setId: d.setId ?? null,
      visible: bridge.onMap(w), radiusVisible: bridge.onMap(w.wpCircle) };
  };
  const lineRec = (kind, t) => ({
    id: `${kind === 'track' ? 'trk' : 'rte'}_${t.id}`, rawId: t.id, name: t.name, points: t.points?.length || 0,
    segments: kind === 'track' ? (G().trackSegments(t.points || [], t.pointsData).length) : 1,
    visible: bridge.onMap(t.polyline),
  });
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
    const px = points.map(p => bridge.project(p));
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
    const ll = bridge.unproject(pt);
    for (const w of host.waypoints()) {
      if (!bridge.onMap(w)) continue;
      const d = w.wpData; const c = bridge.project(d);
      const distPx = G().screenDistance(pt, c);
      if (want('wp') && distPx <= Math.max(tol, 12)) out.push({ kind: 'wp', id: d.id, distPx });
      else if (want('wpRadius') && Number(d.radius) > 0 && bridge.onMap(w.wpCircle) && G().distance(d, ll) <= Number(d.radius)) {
        out.push({ kind: 'wpRadius', id: d.id, distPx });
      }
    }
    for (const [kind, list] of [['route', host.routes()], ['track', host.tracks()]]) {
      if (!want(kind)) continue;
      for (const t of list) {
        if (!bridge.onMap(t.polyline) || !(t.points?.length)) continue;
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
      engine: bridge.engine, zoom: bridge.getView().zoom,
      wp: e.wp.length, wpOnMap: cnt(e.wp, x => x.visible), wpRadiusOnMap: cnt(e.wp, x => x.radiusVisible),
      tracks: e.track.length, tracksOnMap: cnt(e.track, x => x.visible), trackSegments: e.track.reduce((s, t) => s + t.segments, 0),
      routes: e.route.length, routesOnMap: cnt(e.route, x => x.visible),
    };
  }

  const api = {
    VERSION,
    get engine() { return bridge.engine; },
    getView: () => bridge.getView(),
    setView: v => bridge.setView(v),
    project: p => bridge.project(p),
    unproject: pt => bridge.unproject(pt),
    size: () => bridge.size(),
    entities, pick, stats,
    _setHost: h => { host = { ...host, ...h }; },
    _setBridge: b => { bridge = b || leafletBridge; },
    _leafletBridge: leafletBridge,
  };
  root.__tnTest = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
