// __tnTest (план MapLibre v3, 0б.2): нейтральный тестовый API — pick по геометрии модели, одинаковый на обоих движках.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.TnGeo = require('../ui/tn-geo.js');
const T = require('../ui/tn-test-api.js');
const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');

// мост-заглушка: экран = линейная проекция (1° = 1000 px), всё «на карте», кроме помеченного hidden
const bridge = {
  engine: 'stub',
  getView: () => ({ center: { lat: 0, lng: 0 }, zoom: 10, bearing: 0, pitch: 0 }),
  setView() {},
  project: p => ({ x: p.lng * 1000, y: -p.lat * 1000 }),
  unproject: pt => ({ lat: -pt.y / 1000, lng: pt.x / 1000 }),
  onMap: l => !!l && !l.hidden,
  size: () => ({ x: 1000, y: 800 }),
};
const wp = (id, lat, lng, radius = 0, hidden = false) => ({ wpData: { id, name: id, lat, lng, radius }, wpCircle: radius ? {} : null, hidden });
T._setBridge(bridge);
T._setHost({
  waypoints: () => [wp('wp_a', 0, 0.1, 0), wp('wp_b', 0.05, 0.05, 2000), wp('wp_h', 0, 0.3, 0, true)],
  tracks: () => [{ id: 1, name: 'T', polyline: {}, points: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.2 }, { lat: 0.1, lng: 0.2 }, { lat: 0.1, lng: 0.3 }], pointsData: [{}, {}, { seg: 1 }, {}] }],
  routes: () => [{ id: 7, name: 'R', polyline: {}, points: [{ lat: 0, lng: 0.1 }, { lat: 0.1, lng: 0.1 }] }],
});

test('pick: точка WP над линиями, маршрут над треком; спрятанное не ловится', () => {
  const r = T.pick({ x: 100, y: 0 });                       // WP a, начало маршрута, середина трека
  assert.deepEqual(r.map(x => x.kind), ['wp', 'route', 'track']);
  assert.equal(r[0].id, 'wp_a');
  assert.equal(r[1].id, 'rte_7');
  assert.equal(r[2].id, 'trk_1');
  assert.deepEqual(T.pick({ x: 300, y: 0 }), [], 'спрятанный WP и пустое место');
});

test('pick: разрыв куска трека (0.9.34) не ловится, сам кусок ловится', () => {
  assert.deepEqual(T.pick({ x: 200, y: -50 }, { kinds: ['track'] }), [], 'между кусками линии нет');
  const r = T.pick({ x: 250, y: -100 }, { kinds: ['track'] });
  assert.equal(r.length, 1); assert.equal(r[0].index, 2);
});

test('pick: радиус WP — по метрам на земле, ниже линий; допуск в пикселях', () => {
  const inR = T.pick({ x: 60, y: -45 }, { kinds: ['wpRadius'] });
  assert.equal(inR[0]?.id, 'wp_b');
  assert.equal(T.pick({ x: 103, y: 4 }, { tolerancePx: 2, kinds: ['track'] }).length, 0);
  assert.equal(T.pick({ x: 103, y: 4 }, { tolerancePx: 8, kinds: ['track'] }).length, 1);
});

test('stats и entities — нейтральные числа и id, без объектов движка', () => {
  const s = T.stats();
  assert.deepEqual({ wp: s.wp, wpOnMap: s.wpOnMap, wpRadiusOnMap: s.wpRadiusOnMap, tracks: s.tracks, trackSegments: s.trackSegments, routes: s.routes },
    { wp: 3, wpOnMap: 2, wpRadiusOnMap: 1, tracks: 1, trackSegments: 2, routes: 1 });
  const e = T.entities();
  assert.deepEqual(Object.keys(e), ['wp', 'track', 'route']);
  assert.ok(!JSON.stringify(e).includes('wpData'));
});

test('подключено в странице: tn-geo.js → tn-model.js → tn-map.js → tn-map-leaflet.js → tn-test-api.js', () => {
  assert.match(html, /<script src="tn-geo\.js"><\/script>\n<script src="tn-model\.js"><\/script>\n<script src="tn-map\.js"><\/script>\n<script src="tn-map-leaflet\.js"><\/script>\n<script src="tn-test-api\.js"><\/script>/);
});

test('VERSION 2: G0 набор точки из marker._setId, G1 поля записей', () => {
  assert.equal(T.VERSION, 2);
  T._setHost({
    waypoints: () => [{ wpData: { id: 'wp_s', name: 'S', lat: 0, lng: 0, radius: 0, desc: 'd', icon: '⬤', color: '#f00', num: 3 }, _setId: 7 }],
  });
  const w = T.entities().wp[0];
  assert.equal(w.setId, 7, 'G0: набор не теряется');
  assert.equal(JSON.stringify([w.desc, w.icon, w.color, w.num]), JSON.stringify(['d', '⬤', '#f00', 3]));
  const t = T.entities().track[0];
  assert.ok('color' in t && 'width' in t);
});

test('G2 геометрия с разрывами, G3 выбор, G8 событие уходит объекту, выбранному pick', () => {
  const fired = [];
  const poly = {};
  T._setHost({
    waypoints: () => [],
    tracks: () => [{ id: 1, name: 'T', polyline: poly, points: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.2 }, { lat: 0.1, lng: 0.2 }], pointsData: [{}, {}, { seg: 1 }] }],
    routes: () => [],
    selection: () => ({ wp: null, track: 'trk_1', route: null }),
  });
  const g = T.geometry('trk_1');
  assert.equal(g.kind, 'track'); assert.equal(g.points.length, 3); assert.equal(JSON.stringify(g.breaks), '[2]');
  assert.equal(T.geometry('nope'), null);
  assert.equal(T.selection().track, 'trk_1');
  T._setBridge({ ...bridge, dispatchAt: (target, pt, type) => { fired.push([target === poly, type]); return true; } });
  const r = T.dispatchAt({ x: 100, y: 0 }, 'contextmenu', { kinds: ['track'] });
  assert.equal(r.dispatched, true); assert.equal(r.id, 'trk_1');
  assert.equal(JSON.stringify(fired), JSON.stringify([[true, 'contextmenu']]));
  assert.equal(T.dispatchAt({ x: 900, y: 900 }), null, 'мимо — ничего');
  T._setBridge(bridge);
});
