// tn-geo.js (план MapLibre v3, R1): геофункции без Leaflet. Расстояние — побайтно как L.CRS.Earth.distance,
// чтобы длины, радиусы WP и Race Report не сдвинулись при смене движка.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('../ui/tn-geo.js');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }
const needDom = { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' };

function leaflet() {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  const ctx = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, console };
  ctx.self = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../ui/leaflet.js', import.meta.url), 'utf8'), ctx);
  return { L: ctx.window.L || ctx.L, dom };
}

// детерминированный ГПСЧ — тест воспроизводим
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

test('расстояние побайтно совпадает с L.LatLng.distanceTo на 5000 парах и на краевых точках', needDom, () => {
  const { L, dom } = leaflet();
  try {
    const r = rng(42);
    const pts = [[0, 0], [0, 30], [59.9, 0], [0, 180], [0, -180], [90, 0], [-90, 0], [89.999, 179.999], [-0.0001, 0.0001]];
    for (let i = 0; i < 5000; i++) pts.push([r() * 180 - 90, r() * 360 - 180]);
    let n = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i * 7 + 3) % pts.length];
      const ours = G.distance({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });
      const theirs = L.latLng(a[0], a[1]).distanceTo(L.latLng(b[0], b[1]));
      assert.equal(ours, theirs, `пара ${a} → ${b}`);
      n++;
    }
    assert.equal(n, pts.length);
    // близкие точки трека (метры) — тот же результат
    for (let i = 0; i < 500; i++) {
      const a = { lat: 55 + r() * 0.01, lng: 37 + r() * 0.01 }, b = { lat: a.lat + r() * 1e-4, lng: a.lng + r() * 1e-4 };
      assert.equal(G.distance(a, b), L.latLng(a.lat, a.lng).distanceTo(L.latLng(b.lat, b.lng)));
    }
  } finally { dom.window.close(); }
});

test('валидность точек: ноль валиден, null/NaN/вне диапазона — нет; toLngLat не превращает мусор в 0', () => {
  assert.equal(G.isValidLatLng({ lat: 0, lng: 0 }), true);
  assert.equal(G.isValidLatLng({ lat: 90, lng: -180 }), true);
  for (const bad of [null, {}, { lat: null, lng: 0 }, { lat: NaN, lng: 1 }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: '1', lng: 2 }]) {
    assert.equal(G.isValidLatLng(bad), false, JSON.stringify(bad));
  }
  assert.deepEqual(G.toLngLat({ lat: 59.9, lng: 0 }), [0, 59.9]);
  assert.throws(() => G.toLngLat({ lat: null, lng: 0 }));
  assert.deepEqual(G.fromLngLat([30.5, 0]), { lat: 0, lng: 30.5 });
  assert.throws(() => G.fromLngLat([NaN, 0]));
});

test('±180° без полосы через мир; полюс зажат только для отображения', () => {
  const line = G.unwrapLine([{ lat: 10, lng: 179.95 }, { lat: 10, lng: -179.95 }, { lat: 10, lng: -179.9 }]);
  assert.deepEqual(line.map(p => Math.round(p[0] * 100) / 100), [179.95, 180.05, 180.1]);
  const polar = G.unwrapLine([{ lat: 86, lng: 0 }, { lat: -86, lng: 1 }]);
  assert.ok(Math.abs(polar[0][1] - 85.0511287798) < 1e-9 && Math.abs(polar[1][1] + 85.0511287798) < 1e-9);
});

test('азимут и точка по азимуту — та же сфера: distance(p, destination(p, θ, d)) = d', () => {
  const p = { lat: 59.93, lng: 30.31 };
  for (const θ of [0, 45, 90, 135, 180, 270, 359]) {
    for (const d of [1, 150, 2500, 100000]) {
      const q = G.destination(p, θ, d);
      assert.ok(Math.abs(G.distance(p, q) - d) < 1e-6 * Math.max(1, d), `${θ}° ${d} м`);
      if (d >= 150) assert.ok(Math.abs(((G.bearing(p, q) - θ + 540) % 360) - 180) < 1e-6, `азимут ${θ}`);
    }
  }
  assert.equal(Math.round(G.bearing({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })), 0);
  assert.equal(Math.round(G.bearing({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })), 90);
  assert.equal(G.screenDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('круг радиуса WP — геодезический: каждая точка кольца на радиусе, кольцо замкнуто, 64..128 точек', () => {
  for (const lat of [0, 60, 75]) {
    const c = { lat, lng: 30 };
    const ring = G.circlePolygon(c, 150);
    assert.equal(ring.length, 97);
    assert.deepEqual(ring[0], ring[ring.length - 1]);
    for (const q of ring) assert.ok(Math.abs(G.distance(c, q) - 150) < 1e-6);
  }
  assert.equal(G.circlePolygon({ lat: 0, lng: 0 }, 10, 10).length, 65);
  assert.equal(G.circlePolygon({ lat: 0, lng: 0 }, 10, 500).length, 129);
});

test('куски трека и длина — как trackLatLngs/trackLen приложения 0.9.34 (разрывы GPX trkseg)', () => {
  const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
  const h0 = html.indexOf('function isTrackSegStart(t, i)');
  const { trackLatLngs } = new Function(html.slice(h0, html.indexOf('function createTrackPolylineLayer(', h0)) + '\nreturn { trackLatLngs };')();
  const a = html.indexOf('function trackLen(t) {');
  const appLen = new Function('isTrackSegStart', html.slice(a, html.indexOf('\n}\n', a) + 3) + '\nreturn trackLen;');
  const pts = [{ lat: 54, lng: 40 }, { lat: 54, lng: 40.01 }, { lat: 54.1, lng: 40.5 }, { lat: 54.1, lng: 40.51 }, { lat: 54.2, lng: 40.6 }];
  const withDist = pts.map(p => ({ ...p, distanceTo: q => G.distance(p, q) }));
  for (const pd of [pts.map(() => ({})), [{}, {}, { seg: 1 }, {}, { seg: 1 }]]) {
    const segs = G.trackSegments(pts, pd);
    const app = trackLatLngs({ points: pts, pointsData: pd });
    assert.deepEqual(segs, Array.isArray(app[0]) ? app : [app]);
    const isSeg = (t, i) => i > 0 && !!t?.pointsData?.[i]?.seg;
    assert.ok(Math.abs(G.trackLength(pts, pd) - appLen(isSeg)({ points: withDist, pointsData: pd }) * 1000) < 1e-6);
  }
  assert.deepEqual(G.trackSegments([], []), []);
});

test('index.html: геодезия только через TnGeo (нет .distanceTo), пиксели — screenDistance (снятие дубля при двойном щелчке, перетаскивание)', () => {
  const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /\.distanceTo\(/);
  assert.equal((html.match(/if \(TnGeo\.screenDistance\(previous, last\) > 6\) return false;/g) || []).length, 2);
  assert.match(html, /TnGeo\.screenDistance\(map\.mouseEventToContainerPoint\(moveEvent\), startPoint\)/);
  assert.match(html, /const dist = TnGeo\.screenDistance\(target, map\.latLngToLayerPoint\(point\)\);/);
});
