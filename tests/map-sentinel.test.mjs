// Сторож перехода на MapLibre (план v3, R1): камера/проекция — только через фасад tnMap. Прямые вызовы Leaflet
// остаются лишь в переходном allow-list; он может только уменьшаться (пустой к концу этапа 4).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
const CAMERA = /\bmap\.(getZoom|getCenter|setView|fitBounds|panTo|flyTo|getBounds|invalidateSize|latLngToContainerPoint|containerPointToLatLng|mouseEventToLatLng|mouseEventToContainerPoint|setZoomAround)\(/g;

// Переходный allow-list: [фрагмент строки, причина, когда уходит]
const ALLOW = [
  ['map.setZoomAround(L.point(tndPinchState.x', 'запасной путь щипка без smooth-zoom.js', 'этап 1: жесты в адаптере'],
  ["(window.TrophyNav3D?._view?.ml?.getZoom() ?? 0) : map.getZoom()", 'начало щипка', 'этап 1: жесты в адаптере'],
  ['const center = map.getCenter();', 'switchCRS — проекция Leaflet под Яндекс 3395', 'этап 1: R4/R7 в адаптере'],
  ['const zoom = map.getZoom();', 'switchCRS', 'этап 1'],
  ['const latlng = map.mouseEventToLatLng(ev.originalEvent || ev);', 'перетаскивание вершины трека', 'этап 3: машина жестов'],
  ['const bounds = renderViewportOnly ? map.getBounds().pad(TRACK_MARKER_BOUNDS_PAD) : null;', 'точки трека в видимой области (рендер Leaflet)', 'этап 2: рендер в адаптере'],
  ['const latlng = map.mouseEventToLatLng(nativeEvent);', 'перетаскивание вершины трека', 'этап 3'],
  ['const startPoint = map.mouseEventToContainerPoint(nativeEvent);', 'порог начала перетаскивания', 'этап 3'],
  ['TnGeo.screenDistance(map.mouseEventToContainerPoint(moveEvent), startPoint)', 'порог начала перетаскивания', 'этап 3'],
  ['const bounds = map.getBounds().pad(TRACK_MARKER_BOUNDS_PAD);', 'точки трека в видимой области', 'этап 2'],
  ['const viewBounds = map.getBounds().pad(0.1);', 'точки трека в видимой области', 'этап 2'],
];

test('камера и проекция: прямые вызовы map.* только из allow-list', () => {
  const lines = html.split('\n');
  const found = [];
  lines.forEach((l, i) => { if (CAMERA.test(l)) found.push({ n: i + 1, l: l.trim() }); CAMERA.lastIndex = 0; });
  const extra = found.filter(f => !ALLOW.some(([frag]) => f.l.includes(frag)));
  assert.deepEqual(extra, [], 'новый прямой вызов камеры — через tnMap');
  assert.ok(found.length <= ALLOW.length, `allow-list только уменьшается: найдено ${found.length}`);
  for (const [frag] of ALLOW) assert.ok(html.includes(frag), `устаревшая строка allow-list — удалить: ${frag}`);
});

test('модули вне index.html: tn-widgets/tn-track-analysis/tn-voice не трогают камеру Leaflet напрямую', () => {
  for (const f of ['tn-widgets.js', 'tn-voice.js']) {
    const src = fs.readFileSync(new URL(`../ui/${f}`, import.meta.url), 'utf8');
    const n = (src.match(CAMERA) || []).length;
    assert.equal(n, 0, `${f}: ${n}`);
  }
});

test('события карты и контейнер: только через tnMap; прямые map.on/off — лишь перетаскивание вершины (этап 3)', () => {
  const lines = html.split('\n');
  const ev = [];
  lines.forEach((l, i) => { if (/\bmap\.(on|off|once)\(/.test(l)) ev.push(l.trim()); });
  const ALLOW_EV = ["map.off('mousemove', onMove);", "map.off('mouseup', onUp);", "map.on('mousemove', onMove);", "map.on('mouseup', onUp);"];
  assert.deepEqual(ev.filter(l => !ALLOW_EV.includes(l)), []);
  assert.ok(ev.length <= 8, `перетаскивание: ${ev.length}`);
  assert.doesNotMatch(html, /\bmap\.getContainer\(\)/);
  assert.match(html, /tnMap\.on\('dblclick', e => \{\n  e\.stop\(\);/);
  assert.match(html, /dlPolygonClickOff = tnMap\.on\('click', onPolygonClick\);/);
});

test('WP: круг радиуса и иконка — только внутри wpRender; маркер WP создаётся в одном месте', () => {
  const a = html.indexOf('const wpRender = {');
  const b = html.indexOf('\n};\n', a) + 4;
  assert.ok(a > 0 && b > a);
  const outside = html.slice(0, a) + html.slice(b);
  assert.doesNotMatch(outside, /wpCircle/, 'круг радиуса WP — деталь отрисовки, снаружи wpRender его нет');
  assert.doesNotMatch(outside, /\.setIcon\(makeDivIcon\(/, 'иконка WP — wpRender.updateIcon');
  assert.match(html, /function wpRadiusStyle\(d\)/);
  assert.ok((html.match(/wpRender\.(show|hide|showMarker|hideMarker|showCircle|hideCircle|isShown|isCircleShown|hasCircle|updateCircle|moveCircle|updateIcon)\(/g) || []).length >= 20);
  assert.match(html, /function createWaypointMarker\(wpData, o = \{\}\)/);
  assert.match(html, /function onWaypointMarkerEvent\(type, marker, originalEvent = null, latlng = null\)/);
  assert.equal((html.match(/makeWaypointMarkerOptions\(/g) || []).length, 2, 'определение + один вызов');
});

test('треки: линия трека — только внутри trackRender; события линии — в onTrackLineEvent', () => {
  const a = html.indexOf('const trackRender = {');
  const b = html.indexOf('\n};\n', a) + 4;
  assert.ok(a > 0 && b > a);
  const outside = html.slice(0, a) + html.slice(b);
  assert.doesNotMatch(outside, /\b(track|t|originalTrack|currentTrackDraw)\.polyline\b|item\.track\.polyline/,
    'линия трека — деталь отрисовки: снаружи только trackRender.*');
  assert.doesNotMatch(outside, /createTrackPolylineLayer\((?!points, options)/, 'линия трека создаётся только trackRender.create');
  assert.doesNotMatch(html, /function bindTrackPolyline/);
  assert.match(html, /function onTrackLineEvent\(type, track, latlng = null, originalEvent = null\)/);
  assert.ok((html.match(/trackRender\.(has|isShown|create|show|hide|sync|setStyle|bringToFront|remove|bounds)\(/g) || []).length >= 30);
});
