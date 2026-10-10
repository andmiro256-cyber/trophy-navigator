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
