// 0.9.30: плавный зум колесом, тачпадом и щипком (ui/smooth-zoom.js) вместо ScrollWheelZoom Leaflet с debounce
// и анимацией — зум идёт за пальцами кадр за кадром, без ступенек и «догоняния» после конца жеста.
// DOM-проверки — jsdom с настоящим Leaflet (NODE_PATH=…/node_modules); без него пропускаются.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const html = read('../ui/index.html');
const smoothJs = read('../ui/smooth-zoom.js');
const require = createRequire(import.meta.url);
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }
const needDom = { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const zoomOpts = () => vm.runInNewContext(`(${html.match(/const TND_MAP_ZOOM_OPTIONS = (\{[^}]*\});/)[1]})`);
function pinchBlock() {
  const start = html.indexOf('// ─── Щипок тачпада и Ctrl+колесо');
  const kd = html.indexOf("document.addEventListener('keydown'", start);
  const end = html.indexOf('}, true);', kd) + '}, true);'.length;
  assert.ok(start > 0 && kd > start);
  return html.slice(start, end);
}

/**
 * Карта 800×600 с настоящим Leaflet и плавным зумом. Кадры requestAnimationFrame крутит тест сам (frames(n)),
 * конец жеста (150 мс тишины) — настоящий таймер.
 */
function setup({ withPinchBlock = false, bridge = false } = {}) {
  const dom = new JSDOM(`<!doctype html><body><div id="map"></div><div id="panel"><input id="field"></div>
    <div class="modal-overlay open" id="m"></div></body>`,
  { url: 'https://review.invalid/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  const mapEl = w.document.getElementById('map');
  Object.defineProperty(mapEl, 'clientWidth', { value: 800 });
  Object.defineProperty(mapEl, 'clientHeight', { value: 600 });
  const queue = [];
  let t = 1000;
  w.requestAnimationFrame = f => { queue.push(f); return queue.length; };
  w.cancelAnimationFrame = id => { queue[id - 1] = null; };
  const frames = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const batch = queue.splice(0);
      t += 1000 / 60;
      batch.forEach(f => f && f(t));
      if (!batch.length) break;
    }
  };
  w.eval(read('../ui/leaflet.js'));
  w.eval(read('../ui/trophynav-maps-core.js'));
  w.eval(smoothJs);
  // jsdom без CSS 3D: Leaflet тогда округляет зум до целого (_limitZoom); в WebKit/WebView2 any3d = true
  w.L.Browser.any3d = true;
  w.__opts = zoomOpts();
  w.eval('var map = L.map("map", Object.assign({ maxZoom: 22 }, window.__opts)).setView([60, 30], 10, { animate: false });');
  const map = w.map;
  const events = [];
  map.on('zoomstart zoomend movestart moveend', e => events.push(e.type));
  let jumps = null;
  if (bridge) {
    jumps = [];
    w.maplibregl = { Map: class {
      constructor() { this._canvas = w.document.createElement('canvas'); }
      on() {} once() {} remove() {} setTransformConstrain() {} getStyle() { return null; }
      jumpTo(o) { jumps.push(o); }
    } };
    w.eval(read('../ui/lib/maplibre/leaflet-maplibre-gl.js'));
    w.L.maplibreGL({ style: {}, padding: 0.05 }).addTo(map);
    jumps.length = 0;
  }
  let sz = null;
  if (withPinchBlock) w.eval(pinchBlock());
  else sz = w.TndSmoothZoom.attach(map);
  const wheel = (opts, el = mapEl) => {
    const e = new w.WheelEvent('wheel', { deltaMode: 0, clientX: 400, clientY: 300, bubbles: true, cancelable: true, ...opts });
    el.dispatchEvent(e);
    return e;
  };
  /** Докрутить кадры до цели и дождаться конца жеста. */
  const settle = async () => { frames(200); await sleep(200); frames(5); };
  return { dom, w, map, mapEl, events, frames, wheel, settle, sz, jumps };
}

test('0.9.30: колесо — свой плавный зум, ScrollWheelZoom Leaflet выключен, блока keepWheelClicks нет', () => {
  assert.deepEqual({ ...zoomOpts() }, { zoomSnap: 0, zoomDelta: 0.5, scrollWheelZoom: false });
  assert.doesNotMatch(html, /keepWheelClicksDuringZoomAnimation|wheelDebounceTime/);
  assert.match(html, /<script src="trophynav-maps-core\.js"><\/script>\n<script src="smooth-zoom\.js"><\/script>/);
  assert.match(html, /const tndSmoothZoom = window\.TndSmoothZoom \? window\.TndSmoothZoom\.attach\(map\) : \(map\.scrollWheelZoom\.enable\(\), null\);/);
  assert.match(smoothJs, /addEventListener\('wheel', onWheel, \{ passive: false \}\)/);
  assert.match(smoothJs, /map\._move\(center, z, \{ pinch: true, round: false \}\)/);
  assert.doesNotMatch(smoothJs, /#\d/, 'без «решётка+число» в коде');
});

test('wheelZoomDelta: тачпад линейно по пикселям, Ctrl (щипок) — по масштабу, щелчок мыши — полуровня', () => {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('../ui/trophynav-maps-core.js'), ctx);
  vm.runInContext(smoothJs, ctx);
  const d = (e, st, now = 0) => JSON.parse(JSON.stringify(ctx.TndSmoothZoom.wheelZoomDelta({ deltaMode: 0, deltaX: 0, ...e }, {}, st, now)));
  assert.deepEqual(d({ deltaY: 100 }), { kind: 'mouse', dz: -0.5 });
  assert.deepEqual(d({ deltaY: -3, deltaMode: 1 }), { kind: 'mouse', dz: 0.5 });
  assert.deepEqual(d({ deltaY: 1, deltaMode: 2 }), { kind: 'mouse', dz: -0.5 });
  assert.equal(d({ deltaY: -12 }).kind, 'touchpad');
  assert.ok(Math.abs(d({ deltaY: -12 }).dz - 0.1) < 1e-9);
  const p = d({ deltaY: -100 * Math.log(2) + 0.0001, ctrlKey: true });
  assert.equal(p.kind, 'pinch');
  assert.ok(Math.abs(p.dz - 1) < 1e-3, 'щипок вдвое — +1 уровень');
  assert.equal(d({ deltaY: -100, ctrlKey: true }).kind, 'mouse', 'Ctrl + щелчок колеса — шаг колеса');
  // крупный целый шаг посреди жеста тачпада — тачпад, после паузы — снова колесо
  const st = {};
  d({ deltaY: 5.5 }, st, 0);
  assert.equal(d({ deltaY: 60 }, st, 20).kind, 'touchpad');
  assert.equal(d({ deltaY: 100 }, st, 1000).kind, 'mouse');
});

test('тачпад: зум идёт сразу, кадр за кадром, без ожидания zoomend; zoomstart/zoomend по разу на жест', needDom, async () => {
  const { dom, map, events, frames, wheel, settle } = setup();
  try {
    const zs = [];
    for (let i = 0; i < 10; i++) {
      wheel({ deltaY: -6.5 });
      frames(1);
      zs.push(map.getZoom());
    }
    assert.ok(zs[0] > 10, `первый кадр уже сдвинул зум (${zs[0]})`);
    for (let i = 1; i < zs.length; i++) assert.ok(zs[i] > zs[i - 1], `каждый кадр ближе к цели: ${zs.join(', ')}`);
    assert.deepEqual(events, ['zoomstart', 'movestart'], 'zoomend до конца жеста не было');
    await settle();
    assert.ok(Math.abs(map.getZoom() - (10 + 65 / 120)) < 1e-6, `итог = сумма событий (${map.getZoom()})`);
    assert.deepEqual(events, ['zoomstart', 'movestart', 'zoomend', 'moveend'], 'zoomend и moveend — один раз');
  } finally { dom.window.close(); }
});

test('20 мелких событий тачпада = одно той же суммы (±0,01); щелчок мыши = полуровня; щелчки копятся без ожидания', needDom, async () => {
  const { dom, map, frames, wheel, settle } = setup();
  try {
    const reset = () => map.setView([60, 30], 10, { animate: false });
    wheel({ deltaY: -50.5 });
    await settle();
    const one = map.getZoom();
    reset();
    for (let i = 0; i < 20; i++) { wheel({ deltaY: -50.5 / 20 }); frames(1); }
    await settle();
    const twenty = map.getZoom();
    assert.ok(Math.abs(one - twenty) < 0.01, `20 мелких (${twenty}) = одно (${one})`);
    assert.ok(Math.abs(one - (10 + 50.5 / 120)) < 1e-6);

    reset();
    await sleep(300);   // жест тачпада держит свой тип 250 мс — дальше колесо мыши
    wheel({ deltaY: -100 });
    await settle();
    assert.equal(map.getZoom(), 10.5, 'щелчок колеса — полуровня');
    reset();
    wheel({ deltaY: 3, deltaMode: 1 });
    await settle();
    assert.equal(map.getZoom(), 9.5, 'щелчок строками (deltaMode 1) — полуровня');

    // три быстрых щелчка во время движения: цель +1,5, зум идёт к ней сразу, не ступеньками после zoomend
    reset();
    wheel({ deltaY: -100 }); frames(2);
    wheel({ deltaY: -100 }); frames(2);
    wheel({ deltaY: -100 }); frames(1);
    const mid = map.getZoom();
    assert.ok(mid > 10.5 && mid < 11.5, `в движении: ${mid}`);
    await settle();
    assert.equal(map.getZoom(), 11.5);
  } finally { dom.window.close(); }
});

test('точка под курсором остаётся на месте (±1 px) в каждом кадре и в конце', needDom, async () => {
  const { dom, w, map, frames, wheel, settle } = setup();
  try {
    const at = w.L.point(200, 150);
    const ll = map.containerPointToLatLng(at);
    const check = label => {
      const p = map.latLngToContainerPoint(ll);
      assert.ok(Math.abs(p.x - at.x) <= 1 && Math.abs(p.y - at.y) <= 1, `${label}: ${p.x}, ${p.y}`);
    };
    // 40 событий одного жеста: точка карты под курсором не пересчитывается с округлённого вида — ошибка не копится
    for (let i = 0; i < 40; i++) { wheel({ deltaY: -2.31, ctrlKey: true, clientX: 200, clientY: 150 }); frames(1); check(`кадр ${i}`); }
    await settle();
    check('конец');
    assert.ok(map.getZoom() > 11.2, `${map.getZoom()}`);
    // отдаление колесом — тоже вокруг курсора
    wheel({ deltaY: 100, clientX: 200, clientY: 150 });
    frames(3); check('отдаление');
    await settle(); check('конец отдаления');
  } finally { dom.window.close(); }
});

test('min/maxZoom соблюдаются; упор в предел не начинает жест', needDom, async () => {
  const { dom, map, events, frames, wheel, settle } = setup();
  try {
    map.setMaxZoom(11);
    for (let i = 0; i < 10; i++) { wheel({ deltaY: -100 }); frames(1); }
    await settle();
    assert.equal(map.getZoom(), 11);
    events.length = 0;
    wheel({ deltaY: -100 });
    await settle();
    assert.deepEqual(events, [], 'на максимуме колесо внутрь ничего не делает');
    map.setMinZoom(9);
    for (let i = 0; i < 10; i++) { wheel({ deltaY: 100 }); frames(1); }
    await settle();
    assert.equal(map.getZoom(), 9);
  } finally { dom.window.close(); }
});

test('Ctrl+колесо (щипок WebView2) зумит карту и не масштабирует страницу; колесо над панелями карту не трогает', needDom, async () => {
  const { dom, w, map, mapEl, wheel, settle, events } = setup({ withPinchBlock: true });
  try {
    w.document.elementFromPoint = () => mapEl;
    const e = wheel({ deltaY: -100 * Math.log(2) + 0.0001, ctrlKey: true });
    assert.equal(e.defaultPrevented, true);
    await settle();
    assert.ok(Math.abs(map.getZoom() - 11) < 1e-3, `щипок вдвое = +1 (${map.getZoom()})`);
    events.length = 0;
    const field = w.document.getElementById('field');
    assert.equal(wheel({ deltaY: -100 }, field).defaultPrevented, false, 'обычное колесо над полем не тронуто');
    assert.equal(wheel({ deltaY: -50.5, ctrlKey: true }, field).defaultPrevented, true, 'Ctrl+колесо над полем — страница не масштабируется');
    const ctrl = w.L.DomUtil.create('div', 'leaflet-control', mapEl);
    wheel({ deltaY: -100 }, ctrl);
    await settle();
    assert.deepEqual(events, [], 'над панелями и элементами управления карта не зумится');
    assert.ok(Math.abs(map.getZoom() - 11) < 1e-3);
  } finally { dom.window.close(); }
});

test('щипок Linux (tndPinch) — тот же плавный зум вокруг точки между пальцами; над окном — ничего', needDom, async () => {
  const { dom, w, map, mapEl, frames, settle, events } = setup({ withPinchBlock: true });
  try {
    const modal = w.document.getElementById('m');
    w.document.elementFromPoint = (x) => (x < 800 ? mapEl : modal);
    const ll = map.containerPointToLatLng(w.L.point(400, 300));
    w.tndPinch(0, 1, 400, 300);
    w.tndPinch(1, 1.5, 400, 300);
    frames(1);
    const z1 = map.getZoom();
    assert.ok(z1 > 10 && z1 < 10 + Math.log2(1.5), `щипок двигает зум сразу (${z1})`);
    w.tndPinch(1, 2, 400, 300);   // развели вдвое — +1 уровень
    frames(200);
    await sleep(200);
    assert.deepEqual(events, ['zoomstart', 'movestart'], 'пока пальцы на тачпаде — жест не кончился');
    w.tndPinch(2, 2, 400, 300);
    await settle();
    assert.ok(Math.abs(map.getZoom() - 11) < 1e-9, `${map.getZoom()}`);
    const p = map.latLngToContainerPoint(ll);
    assert.ok(Math.abs(p.x - 400) <= 1 && Math.abs(p.y - 300) <= 1);
    assert.deepEqual(events, ['zoomstart', 'movestart', 'zoomend', 'moveend']);
    events.length = 0;
    w.tndPinch(0, 1, 900, 300);   // над окном
    w.tndPinch(1, 3, 900, 300);
    w.tndPinch(2, 3, 900, 300);
    await settle();
    assert.deepEqual(events, []);
    assert.ok(Math.abs(map.getZoom() - 11) < 1e-9);
  } finally { dom.window.close(); }
});

test('GestureEvent (WebKit): preventDefault и тот же плавный зум', needDom, async () => {
  const { dom, w, map, mapEl, settle } = setup({ withPinchBlock: true });
  try {
    w.document.elementFromPoint = () => mapEl;
    const g = (type, scale) => {
      const e = new w.Event(type, { bubbles: true, cancelable: true });
      Object.assign(e, { scale, clientX: 100, clientY: 50 });
      mapEl.dispatchEvent(e);
      return e.defaultPrevented;
    };
    assert.equal(g('gesturestart', 1), true);
    assert.equal(g('gesturechange', 0.5), true);
    assert.equal(g('gestureend', 0.5), true);
    await settle();
    assert.ok(Math.abs(map.getZoom() - 9) < 1e-9);
  } finally { dom.window.close(); }
});

test('мост MapLibre: камера векторной карты идёт за каждым кадром жеста, а не прыгает на zoomend', needDom, async () => {
  const { dom, map, frames, wheel, settle, jumps } = setup({ bridge: true });
  try {
    wheel({ deltaY: -30.5 });
    frames(1);
    assert.ok(jumps.length >= 1, 'jumpTo в первом же кадре');
    assert.ok(Math.abs(jumps.at(-1).zoom - (map.getZoom() - 1)) < 1e-9, 'камера на зуме Leaflet (MapLibre на уровень меньше)');
    const before = jumps.length;
    frames(3);
    assert.ok(jumps.length >= before + 3, 'по jumpTo на кадр');
    await settle();
    assert.ok(Math.abs(jumps.at(-1).zoom - (map.getZoom() - 1)) < 1e-9);
  } finally { dom.window.close(); }
});

test('перетаскивание или setView посреди жеста — жест уступает, zoomstart/zoomend парные', needDom, async () => {
  const { dom, map, events, frames, wheel, settle, sz } = setup();
  try {
    wheel({ deltaY: -100 }); frames(2);
    assert.equal(sz.isActive(), true);
    map.setView([61, 31], 8, { animate: false });
    assert.equal(sz.isActive(), false);
    frames(20);
    await settle();
    assert.equal(map.getZoom(), 8, 'чужой setView не перебит');
    const starts = events.filter(e => e === 'zoomstart').length, ends = events.filter(e => e === 'zoomend').length;
    assert.equal(starts, ends, events.join(','));
  } finally { dom.window.close(); }
});

test('версия 0.9.30 везде одна', () => {
  assert.match(read('../src-tauri/tauri.conf.json'), /"version": "0\.9\.30"/);
  assert.match(read('../src-tauri/Cargo.toml'), /^version = "0\.9\.30"$/m);
  assert.match(read('../src-tauri/Cargo.lock'), /name = "trophy-navigator-desktop"\nversion = "0\.9\.30"/);
  assert.match(html, /<title>🧭 Trophy Navigator Desktop v0\.9\.30<\/title>/);
  assert.match(html, /id="app-version-label" class="app-version">Trophy Navigator · v0\.9\.30</);
  assert.match(html, /let appDisplayVersion = '0\.9\.30';/);
  assert.match(html, /id="about-version"[^>]*>0\.9\.30</);
  assert.doesNotMatch(html, /0\.9\.29/);
});

test('ревью 2582 P3: удержание щипка без движения не крутит нулевые таймеры', needDom, async () => {
  const { dom, w, frames, sz } = setup();
  try {
    let count = 0;
    const orig = w.setTimeout;
    w.setTimeout = (f, ms, ...a) => { count++; return orig(f, ms, ...a); };
    sz.pinch(0, 1, 400, 300);
    sz.pinch(1, 1.2, 400, 300);
    frames(100);
    await new Promise(r => setTimeout(r, 600));
    assert.ok(count < 10, `таймеров за 600 мс удержания: ${count}`);
    sz.pinch(2, 1.2, 400, 300);
    frames(50);
    w.setTimeout = orig;
  } finally { dom.window.close(); }
});

test('ревью 2582 P1: первая перестройка списка карт — после инициализации скрипта (TRIAL_DAYS)', () => {
  const at = html.indexOf('setTimeout(buildLayerUI, 0);\nloadTileCatalog();');
  assert.ok(at > 0, 'первый buildLayerUI отложен');
  const trial = html.indexOf('const TRIAL_DAYS = ');
  assert.ok(trial > at, 'TRIAL_DAYS объявлен ниже — синхронный вызов упал бы');
  assert.doesNotMatch(html, /\nbuildLayerUI\(\);\nloadTileCatalog\(\);/);
});
