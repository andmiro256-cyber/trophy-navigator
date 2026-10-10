// Харнесс аудита (план MapLibre v3, 0б.6): сценарии ходят к карте только через window.__tnTest — без Leaflet.
// Исключение — tools/harness/tn-gaps.js (временная прокладка недостающих методов, см. API-GAPS.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dir = new URL('../tools/harness/', import.meta.url);
const files = fs.readdirSync(dir).filter(f => /\.(py|js)$/.test(f) && f !== 'tn-gaps.js');
const FORBIDDEN = [
  [/(?<![\w-])map\.[A-Za-z_]/, 'map.* (Leaflet)'],
  [/(?<![\w$])L\.[A-Za-z_]/, 'L.* (Leaflet)'],
  [/\.wpData\b/, '.wpData (маркер)'],
  [/\.polyline\b/, '.polyline (слой Leaflet)'],
  [/\bwpCircle\b/, 'wpCircle (слой Leaflet)'],
  [/\._icon\b/, '._icon (DOM маркера)'],
  [/\b_layers\b|\beachLayer\b|\bhasLayer\b/, 'обход слоёв Leaflet'],
  [/getLatLng|latLngTo/, 'координаты Leaflet'],
  [/leaflet-/, 'классы .leaflet-*'],
  [/(?<![\w.'"-])waypoints\b(?!\s*:)/, 'waypoints[] (маркеры Leaflet)'],
  [/\bactiveWaypoint\b/, 'activeWaypoint (маркер)'],
  [/window\.map\b|!!map\b/, 'window.map'],
];

test('харнесс: ни один сценарий не трогает Leaflet напрямую', () => {
  assert.ok(files.length >= 30, `сценариев: ${files.length}`);
  const hits = [];
  for (const f of files) {
    fs.readFileSync(new URL(f, dir), 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(#|\/\/)/.test(line)) return;                     // комментарии
      for (const [re, what] of FORBIDDEN) if (re.test(line)) hits.push(`${f}:${i + 1} ${what}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('харнесс: каждый метод прокладки tn-gaps.js описан в API-GAPS.md', () => {
  const gaps = fs.readFileSync(new URL('tn-gaps.js', dir), 'utf8');
  const doc = fs.readFileSync(new URL('API-GAPS.md', dir), 'utf8');
  const put = [...gaps.matchAll(/put\('(G\d)', '(\w+)'/g)].map(m => [m[1], m[2]]);
  assert.ok(put.length >= 9);
  for (const [g, name] of put) assert.match(doc, new RegExp(`## ${g} — [^\\n]*\`${name}`), `${g} ${name}`);
});

// помощники __tnh поверх моста-заглушки: экран = линейная проекция (1° = 1000 px), окно 1000×800
function loadTnh(view = { center: { lat: 0, lng: 0 }, zoom: 10 }) {
  let v = structuredClone(view);
  const k = () => 1000 * 2 ** (v.zoom - 10);
  const window = {
    __tnTest: {
      getView: () => structuredClone(v),
      setView: nv => { v = structuredClone(nv); },
      size: () => ({ x: 1000, y: 800 }),
      project: p => ({ x: 500 + (p.lng - v.center.lng) * k(), y: 400 - (p.lat - v.center.lat) * k() }),
      unproject: pt => ({ lat: v.center.lat - (pt.y - 400) / k(), lng: v.center.lng + (pt.x - 500) / k() }),
      entities: () => ({ wp: [{ id: 'a', lat: 1, lng: 1 }, { id: 'b', lat: 2, lng: 3 }], track: [], route: [] }),
      selection: () => ({ wp: 'b', track: null, route: null }),
      layers: () => [
        { kind: 'base', name: 'OSM', tiles: { loaded: 5, errors: 1, requested: 6, errorSamples: ['x'] } },
        { kind: 'offline', name: 'm1', tiles: { loaded: 2, errors: 0, requested: 2, errorSamples: [] } },
      ],
    },
  };
  const document = { getElementById: () => ({ getBoundingClientRect: () => ({ left: 10, top: 20 }) }) };
  const src = fs.readFileSync(new URL('tn-harness.js', dir), 'utf8');
  new Function('window', 'document', 'offlineMaps', src)(window, document, { p1: { name: 'm1' }, p2: { name: 'm2' } });
  return window;
}

test('__tnh: xy в координатах окна, wp(-1), selWp, mid', () => {
  const w = loadTnh();
  assert.deepEqual(w.__tnh.xy({ lat: 0, lng: 0 }), [510, 420]);
  assert.equal(w.__tnh.wp(-1).id, 'b');
  assert.equal(w.__tnh.selWp().id, 'b');
  assert.deepEqual(w.__tnh.mid({ lat: 0, lng: 0 }, { lat: 2, lng: 4 }), { lat: 1, lng: 2 });
});

test('__tnh.fit: все точки в окне с полями, зум — наибольший целый, при котором влезают', () => {
  const w = loadTnh({ center: { lat: 50, lng: 50 }, zoom: 3 });
  const pts = [{ lat: 1, lng: 1 }, { lat: 1.2, lng: 1.5 }, { lat: 0.9, lng: 1.1 }];
  const v = w.__tnh.fit(pts, 0.2);
  const T = w.__tnTest;
  for (const p of pts) {
    const q = T.project(p);
    assert.ok(q.x >= 0 && q.x <= 1000 && q.y >= 0 && q.y <= 800, JSON.stringify(q));
  }
  // ширина 0.5° → 500 px на z10; с полями 0.2 ×1.4 = 700 px ≤ 1000 → z10, а z11 уже 1400 px
  assert.equal(v.zoom, 10);
  assert.ok(Math.abs(v.center.lng - 1.25) < 1e-9 && Math.abs(v.center.lat - 1.05) < 1e-9);
});

test('__tnh: tiles суммирует счётчики слоёв, offline отмечает слои на карте', () => {
  const w = loadTnh();
  assert.deepEqual(w.__tnh.tiles(), { ok: 7, err: 1, req: 8, errs: ['x'] });
  assert.deepEqual(w.__tnh.offline(), [['m1', true], ['m2', false]]);
});
