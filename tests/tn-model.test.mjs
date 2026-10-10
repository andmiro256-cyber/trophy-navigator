// tn-model.js (план MapLibre v3, R1, 0б.4): модель данных вне движка — простые объекты, стабильные id, события.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.TnGeo = require('../ui/tn-geo.js');
const TnModel = require('../ui/tn-model.js');

test('id: трек/маршрут приложения ↔ id модели; WP — как есть', () => {
  assert.equal(TnModel.entityId('track', 3), 'trk_3');
  assert.equal(TnModel.entityId('route', 12), 'rte_12');
  assert.equal(TnModel.entityId('wp', 'wp-abc'), 'wp-abc');
  assert.equal(TnModel.rawIdOf('track', 'trk_3'), 3);
  assert.equal(TnModel.rawIdOf('wp', 'wp-abc'), 'wp-abc');
});

test('точки в модели — простые {lat,lng}: L.LatLng-подобное очищается, ноль валиден, мусор — ошибка', () => {
  const M = TnModel.create();
  const ll = { lat: 0, lng: 30, distanceTo() {}, alt: 5 };
  M.add('track', { id: 'trk_1', name: 'T', points: [ll, { lat: 59.9, lng: 0 }], pointsData: [{ time: 't0' }, { seg: 1 }] });
  const t = M.get('track', 'trk_1');
  assert.deepEqual(t.points, [{ lat: 0, lng: 30 }, { lat: 59.9, lng: 0 }]);
  assert.deepEqual(t.pointsData, [{ time: 't0' }, { seg: 1 }]);
  assert.throws(() => M.add('track', { id: 'trk_2', points: [{ lat: null, lng: 0 }] }), /невалидная точка/);
  assert.throws(() => M.add('wp', { id: 'wp-x', lat: NaN, lng: 1 }), /невалидная/);
  assert.throws(() => M.add('wp', { lat: 1, lng: 1 }), /нет id/);
  assert.equal(M.has('track', 'trk_2'), false, 'запись с мусором не добавлена');
});

test('pointsData — как есть (длина не меняется, нет массива — нет и в записи) и не делит объекты с вызывающим', () => {
  const M = TnModel.create();
  const pd = [{ ele: 1 }];
  M.add('track', { id: 'trk_1', points: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], pointsData: pd });
  const t = M.get('track', 'trk_1');
  assert.equal(t.pointsData.length, 1, 'collectState пишет pointsData дословно — длину не выравниваем');
  pd[0].ele = 999;
  assert.equal(t.pointsData[0].ele, 1);
  M.add('track', { id: 'trk_2', points: [{ lat: 1, lng: 1 }] });
  assert.equal(M.get('track', 'trk_2').pointsData, undefined);
});

test('события: add/update/remove/reorder/reset с generation; повтор id — ошибка', () => {
  const M = TnModel.create(); const ev = [];
  const off = M.on(e => ev.push(`${e.type}:${e.kind}:${e.ids.join(',')}`));
  M.on(off ? () => {} : null);
  M.add('wp', [{ id: 'a', lat: 0, lng: 0 }, { id: 'b', lat: 1, lng: 1 }]);
  assert.throws(() => M.add('wp', { id: 'a', lat: 0, lng: 0 }), /уже есть/);
  M.update('wp', 'a', { name: 'A' });
  M.update('wp', 'b', r => ({ ...r, lat: 2 }));
  M.reorder('wp', ['b']);
  M.remove('wp', ['a', 'zzz']);
  M.reset('route', [{ id: 'rte_1', points: [{ lat: 0, lng: 0 }] }]);
  assert.deepEqual(ev, ['add:wp:a,b', 'update:wp:a', 'update:wp:b', 'reorder:wp:b,a', 'remove:wp:a', 'reset:route:rte_1']);
  assert.equal(M.generation, 6);
  assert.equal(M.get('wp', 'b').lat, 2);
  assert.throws(() => M.update('wp', 'b', { id: 'c' }), /id записи не меняется/);
  off();
  M.add('wp', { id: 'c', lat: 0, lng: 0 });
  assert.equal(ev.length, 6, 'после отписки событий нет');
});

test('batch: изменения уходят одним событием на (тип, вид); подписка не умножается', () => {
  const M = TnModel.create(); const ev = [];
  const fn = e => ev.push(`${e.type}:${e.kind}:${e.ids.join(',')}`);
  M.on(fn); M.on(fn);
  M.batch(() => {
    M.add('wp', { id: 'a', lat: 0, lng: 0 });
    M.add('wp', { id: 'b', lat: 0, lng: 0 });
    M.update('wp', 'a', { name: 'x' });
    M.update('wp', 'a', { name: 'y' });
    M.batch(() => M.add('track', { id: 'trk_1', points: [] }));
    assert.equal(ev.length, 0, 'внутри batch — тишина');
  });
  assert.deepEqual(ev, ['add:wp:a,b', 'update:wp:a', 'add:track:trk_1']);
});

test('ошибка подписчика не ломает модель и остальных подписчиков', () => {
  const M = TnModel.create(); let got = 0;
  const warn = console.warn; console.warn = () => {};
  try {
    M.on(() => { throw new Error('boom'); });
    M.on(() => got++);
    M.add('wp', { id: 'a', lat: 0, lng: 0 });
  } finally { console.warn = warn; }
  assert.equal(got, 1);
  assert.equal(M.list('wp').length, 1);
});

test('index.html, шаг 1 (чтение): выгрузки WP и collectState читают записи модели, со страховкой старым путём', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
  assert.match(html, /const tnModel = window\.TnModel\.create\(\);/);
  assert.match(html, /function tnWaypointRecs\(markers = waypoints\)/);
  assert.equal((html.match(/tnWaypointRecs\(list\)\.forEach\(d => \{/g) || []).length, 2, 'WPT и GPX активного набора');
  assert.match(html, /tnWaypointRecs\(selWaypoints\)\.forEach\(d => \{/);
  assert.match(html, /waypoints: \(waypoints\.forEach\(m => ensureWaypointMeta\(m, \{ touch: false \}\)\), tnWaypointRecs\(\)\)\.map\(d => \(\{/);
});

test('index.html, шаг 1 (чтение): треки и маршруты — записи модели без слоёв Leaflet во всех выгрузках и collectState', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
  assert.match(html, /function tnTrackRec\(t\) \{\n  const \{ polyline, markers, markerMap, \.\.\.rest \} = t;/);
  assert.match(html, /tracks: \(tracks\.forEach\(t => \{ if \(!t\.isNew\) ensureTrackMeta\(t, \{ touch: false \}\); \}\), tnTrackRecs\(tracks\.filter\(t => !t\.isNew\)\)\)\.map\(t => \{\n      return \{\n        id: t\.rawId,/);
  assert.match(html, /const exportTracks = tnTrackRecs\(\)\.map\(track => \(\{/);
  assert.match(html, /tnTrackRecs\(selTracks\)\.forEach\(t => \{/);
  assert.match(html, /function tnRouteRec\(r\)/);
  assert.match(html, /tnRouteRecs\(\)\.forEach\(\(r, idx\) => \{/);
  assert.match(html, /tnRouteRecs\(selRoutes\)\.forEach\(r => \{/);
  assert.match(html, /tnRouteRecs\(routes\.filter\(r => !r\.isNew && r\.points\?\.length >= 2\)\)\)\.map\(r => \{\n      return \{\n        id: r\.rawId,/);
});

test('index.html, шаг 1 (чтение): Race Report берёт трек и маршрут записями модели', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
  assert.match(html, /const track = trackObj \? tnTrackRecs\(\[trackObj\]\)\[0\] : null;\n  const route = routeObj \? tnRouteRecs\(\[routeObj\]\)\[0\] : null;/);
});
