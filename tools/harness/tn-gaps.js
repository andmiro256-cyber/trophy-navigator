// Прокладка недостающих методов window.__tnTest — ВРЕМЕННАЯ, только для движка Leaflet (0.9.34 и Leaflet-адаптер).
//
// Каждый метод здесь — пункт tools/harness/API-GAPS.md (G1…G8). Харнесс зовёт только window.__tnTest; если в
// __tnTest метода нет, а движок Leaflet, wd.session() ставит его отсюда. Когда Opus добавит метод в ui/tn-test-api.js,
// прокладка для него сама отключается (ставится только отсутствующее). На другом движке вместо прокладки —
// заглушка, которая бросает «API-GAP Gn», чтобы шаг упал явно, а не молча прошёл по Leaflet.
//
// Это ЕДИНСТВЕННЫЙ файл харнесса, которому можно трогать Leaflet и маркеры напрямую
// (сторож: tests/harness-no-leaflet.test.mjs). Формат как у hooks.js: тело функции для WebDriver execute/sync.
const T = window.__tnTest;
if (!T) return { error: 'нет window.__tnTest' };
const installed = [], stubbed = [];
const leaflet = T.engine === 'leaflet' && typeof map !== 'undefined' && !!window.L;
const g = f => { try { return f(); } catch (e) { return undefined; } };
const put = (gap, name, impl) => {
  if (typeof T[name] === 'function') return;
  if (leaflet) { T[name] = impl; installed.push(`${gap}:${name}`); return; }
  T[name] = () => { throw new Error(`API-GAP ${gap}: __tnTest.${name} нет (engine=${T.engine})`); };
  stubbed.push(`${gap}:${name}`);
};
const markers = () => g(() => waypoints) || [];
const trackList = () => g(() => tracks) || [];
const routeList = () => g(() => routes) || [];
const lineById = id => {
  const m = /^(trk|rte)_(.+)$/.exec(String(id)); if (!m) return null;
  const list = m[1] === 'trk' ? trackList() : routeList();
  const t = list.find(x => String(x.id) === m[2]);
  return t ? { kind: m[1] === 'trk' ? 'track' : 'route', t } : null;
};
const markerById = id => markers().find(mk => mk.wpData && mk.wpData.id === id) || null;
const plain = p => ({ lat: p.lat, lng: p.lng });

// G1 — entities(): поля модели, нужные проверкам данных, и исправление setId (набор лежит в marker._setId,
// а не в wpData.setId — в 0.9.34 __tnTest всегда отдаёт setId: null). Признак готовности в __tnTest: VERSION ≥ 2.
if (!(T.VERSION >= 2) && !T.__tnhG1) {
  if (leaflet) {
    const orig = T.entities;
    T.entities = function () {
      const e = orig.apply(this, arguments);
      const ms = markers(), ts = trackList(), rs = routeList();
      e.wp.forEach((w, i) => {
        const mk = ms[i], d = (mk && mk.wpData) || {};
        Object.assign(w, { setId: mk && mk._setId != null ? mk._setId : null, desc: d.desc || '', icon: d.icon || '', color: d.color || '', num: d.num });
      });
      e.track.forEach((x, i) => Object.assign(x, { color: ts[i] && ts[i].color, width: ts[i] && ts[i].width }));
      e.route.forEach((x, i) => Object.assign(x, { color: rs[i] && rs[i].color, width: rs[i] && rs[i].width }));
      return e;
    };
    installed.push('G1:entities+');
  } else stubbed.push('G1:entities+');
  T.__tnhG1 = true;
}

// G2 — geometry(id): координаты линии трека/маршрута или точки WP — навести настоящую мышь на линию, вписать объекты.
put('G2', 'geometry', id => {
  const l = lineById(id);
  if (l) {
    const pd = l.kind === 'track' ? (l.t.pointsData || []) : [];
    return { kind: l.kind, id, points: (l.t.points || []).map(plain), breaks: pd.map((d, i) => (d && d.seg ? i : -1)).filter(i => i > 0) };
  }
  const mk = markerById(id);
  return mk ? { kind: 'wp', id, points: [plain(mk.wpData)], breaks: [] } : null;
});

// G3 — selection(): что выбрано сейчас (точка в «Свойствах»/меню, трек и маршрут в списках).
put('G3', 'selection', () => {
  const aw = g(() => activeWaypoint), st = g(() => selectedTrackId), sr = g(() => selectedRouteId);
  return { wp: aw && aw.wpData ? aw.wpData.id : null, track: st != null ? `trk_${st}` : null, route: sr != null ? `rte_${sr}` : null };
});

// G4 — style(id): как объект нарисован движком (а не что записано в модели): размер значка, заливка радиуса, толщина.
put('G4', 'style', id => {
  const l = lineById(id);
  if (l) { const o = (l.t.polyline && l.t.polyline.options) || {}; return { kind: l.kind, color: o.color, width: o.weight, opacity: o.opacity, dash: o.dashArray || '' }; }
  const mk = markerById(id); if (!mk) return null;
  const ic = mk._icon, c = mk.wpCircle && map.hasLayer(mk.wpCircle) ? mk.wpCircle.options : null;
  return { kind: 'wp', iconPx: ic ? ic.offsetWidth : null, iconCss: ic ? ic.style.width : null,
    radius: c ? { fill: c.fillColor, stroke: c.color, fillOpacity: c.fillOpacity } : null };
});

// G5 — layers() и resetTileStats(): слои подложки на карте снизу вверх, с видом, прозрачностью и счётчиками тайлов
// (запрошено/загружено/ошибки с момента сброса) и тайлами в кадре сейчас.
if (leaflet && !T.__tnhTiles) {
  const hook = l => {
    if (!(l instanceof L.GridLayer) || l.__tnhCnt) return;
    l.__tnhCnt = { requested: 0, loaded: 0, errors: 0, errorSamples: [] };
    l.on('tileloadstart', () => l.__tnhCnt.requested++);
    l.on('tileload', () => l.__tnhCnt.loaded++);
    l.on('tileerror', ev => { const c = l.__tnhCnt; c.errors++; if (c.errorSamples.length < 3) c.errorSamples.push(String(ev.tile && ev.tile.src).slice(0, 120)); });
  };
  map.eachLayer(hook);
  map.on('layeradd', e => hook(e.layer));
  T.__tnhTiles = true;
}
put('G5', 'layers', () => {
  const base = g(() => currentBaseLayer), baseName = g(() => currentBaseLayerName) || '';
  const ov = g(() => overlayLayers) || {}, off = g(() => offlineMaps) || {};
  const out = [];
  map.eachLayer(l => {
    const gl = typeof l.getMaplibreMap === 'function';
    if (!(l instanceof L.GridLayer) && !gl) return;
    let kind = 'other', name = '';
    const ovName = Object.keys(ov).find(k => ov[k] === l);
    const offEntry = Object.values(off).find(e => e && e.layer === l);
    if (l === base) { kind = /^tnmap:/.test(baseName) || gl ? 'tnmaps' : 'base'; name = baseName; }
    else if (ovName) { kind = 'overlay'; name = ovName; }
    else if (offEntry) { kind = 'offline'; name = offEntry.name || ''; }
    else if (gl) kind = 'tnmaps';
    const tiles = Object.values(l._tiles || {}).filter(t => t.current);
    const c = l.__tnhCnt || { requested: 0, loaded: 0, errors: 0, errorSamples: [] };
    const cont = l.getContainer ? l.getContainer() : l._container;
    out.push({ key: L.stamp(l), kind, name, visible: !!cont && getComputedStyle(cont).display !== 'none',
      opacity: l.options && l.options.opacity != null ? Number(l.options.opacity) : 1, zIndex: l.options && l.options.zIndex,
      tiles: { requested: c.requested, loaded: c.loaded, errors: c.errors, errorSamples: c.errorSamples.slice() },
      view: { loaded: tiles.filter(t => t.loaded).length, total: tiles.length } });
  });
  return out;
});
put('G5', 'resetTileStats', () => {
  map.eachLayer(l => { if (l.__tnhCnt) Object.assign(l.__tnhCnt, { requested: 0, loaded: 0, errors: 0, errorSamples: [] }); });
  return true;
});

// G6 — popup() и closePopup(): всплывающее окно на карте (быстрое переименование WP, точка трека) — текст и
// CSS-селектор корня, чтобы ввести имя и нажать кнопку настоящей мышью.
put('G6', 'popup', () => {
  const p = document.querySelector('.leaflet-popup');
  return { open: !!p, text: p ? p.innerText : '', selector: '.leaflet-popup' };
});
put('G6', 'closePopup', () => { map.closePopup(); return true; });

// G7 — controls(): CSS-селекторы кнопок карты (+, −, индикатор Z, «Обзор», 3D) и их контейнера — движок рисует их сам.
put('G7', 'controls', () => ({
  zoomIn: '.leaflet-control-zoom-in', zoomOut: '.leaflet-control-zoom-out', zoomLevel: '.zoom-display-ctrl',
  hand: '#btn-hand', threeD: '[title^="3D-вид"]', container: '.leaflet-control-container',
}));

// G8 — dispatchAt(pt, type, opts): отдать событие мыши объекту, которого pick выбрал в точке (как будто мышь до него
// дошла). Для пунктов меню трека при открытом дефекте P1 №3 (холсты перекрывают трек) — замена «обхода холстов» s8b.
put('G8', 'dispatchAt', (pt, type = 'contextmenu', o = {}) => {
  const hit = T.pick(pt, o)[0];
  if (!hit) return null;
  let target = null;
  if (hit.kind === 'track' || hit.kind === 'route') { const l = lineById(hit.id); target = l && l.t.polyline; }
  else { const mk = markerById(hit.id); target = hit.kind === 'wp' ? mk : mk && mk.wpCircle; }
  if (!target) return Object.assign({ dispatched: false }, hit);
  const r = map.getContainer().getBoundingClientRect();
  const latlng = L.latLng(T.unproject(pt));
  const originalEvent = new MouseEvent(type, { clientX: r.left + pt.x, clientY: r.top + pt.y, button: type === 'contextmenu' ? 2 : 0, bubbles: true, cancelable: true });
  target.fire(type, { latlng, layerPoint: map.latLngToLayerPoint(latlng), containerPoint: L.point(pt.x, pt.y), originalEvent });
  return Object.assign({ dispatched: true }, hit);
});

// повторный вызов (после перезагрузки страницы или второй session()) ничего не ставит заново — копим список
const prev = T.__tnhGaps || { installed: [], stubbed: [] };
T.__tnhGaps = { engine: T.engine, version: T.VERSION,
  installed: [...new Set([...prev.installed, ...installed])], stubbed: [...new Set([...prev.stubbed, ...stubbed])] };
return T.__tnhGaps;
