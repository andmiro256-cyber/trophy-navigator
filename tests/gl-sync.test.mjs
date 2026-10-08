// 09.10: точки и маршруты «плясали» при зуме — векторная основа (мост MapLibre) рисовалась кадром позже
// и с throttle 32 мс на сдвиге; холст точек/маршрутов (padding 10%) пустел по краям при плавном отдалении.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../ui/trophynav-maps.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');

test('syncGl: сдвиг без throttle, перерисовка MapLibre в том же кадре; в анимации зума — только pinch', () => {
  const ctx = { console, setTimeout, clearTimeout, document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
    localStorage: { getItem: () => null, setItem() {} }, L: { Layer: { extend: p => p } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const calls = [];
  const gl = {
    _glMap: { redraw: () => calls.push('redraw') },
    _update() { calls.push('update'); }, _pinchZoom() { calls.push('pinch'); },
    _throttledUpdate: () => calls.push('throttled'),
  };
  ctx.TrophyNavMaps._syncGl(gl);
  gl._throttledUpdate({});
  assert.deepEqual(calls, ['update', 'redraw']);
  calls.length = 0; gl._zooming = true; gl._update({});
  assert.deepEqual(calls, ['update'], 'во время zoom-анимации Leaflet холст двигает _animateZoom');
  calls.length = 0; gl._pinchZoom({});
  assert.deepEqual(calls, ['pinch', 'redraw']);
  delete gl._glMap; assert.doesNotThrow(() => gl._pinchZoom({}));
  assert.equal((src.match(/syncGl\(gl\);\n\s+gl\.addTo\(this\._map\);/g) || []).length, 2, 'оба места создания моста');
});

test('холст точек и маршрутов карты — с запасом в пол-экрана', () => {
  assert.match(html, /const map = L\.map\('map', \{[^}]*preferCanvas: true, renderer: L\.canvas\(\{ padding: TND_CANVAS_PADDING \}\)/);
  // запас по бюджету ~8 Мп: ноутбук 1920×1080 — 0.5 не влезает, HP 3440×1440 — ~0.15, мелкое окно — 0.5
  const f = vm.runInNewContext(`(w, h, d) => { const window = { innerWidth: w, innerHeight: h, devicePixelRatio: d }; return ${html.match(/const TND_CANVAS_PADDING = (\(\(\) => \{[\s\S]*?\}\)\(\));/)[1]}; }`);
  assert.equal(f(1000, 700, 1), 0.5);
  assert.ok(Math.abs(f(3440, 1360, 1) - 0.153) < 0.01, String(f(3440, 1360, 1)));
  assert.equal(f(3840, 2160, 2), 0.1);
});

test('холсты отдельных pane (радиусы точек) — тоже с запасом в пол-экрана', () => {
  assert.match(html, /map\._createRenderer = options => L\.canvas\(\{ padding: TND_CANVAS_PADDING, \.\.\.options \}\);/);
  assert.match(html, /const trackCanvasRenderer = L\.canvas\(\{ padding: TND_CANVAS_PADDING \}\);/);
});

test('холсты Leaflet создаются без ускорения на видеокарте (willReadFrequently)', () => {
  const block = html.match(/\(function tndCpuLeafletCanvas\(\) \{[\s\S]*?\}\)\(\);/)[0];
  const seen = [];
  function Canvas() {}
  Canvas.prototype._initContainer = function () { this._ctx = this.c.getContext('2d'); };
  class HTMLCanvasElement { getContext(type, opts) { seen.push([type, opts]); return { type }; } }
  vm.runInNewContext(block, { L: { Canvas }, HTMLCanvasElement });
  const r = new Canvas(); r.c = new HTMLCanvasElement();
  r._initContainer();
  assert.equal(JSON.stringify(seen), JSON.stringify([['2d', { willReadFrequently: true }]]));
  r.c.getContext('webgl');
  assert.equal(JSON.stringify(seen[1]), JSON.stringify(['webgl', null]), 'вне _initContainer getContext не тронут');
});
