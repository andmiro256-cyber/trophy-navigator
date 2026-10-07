// Регрессии по ревью Тима #2433/#2452/#2503: гонка смены темы, обновление области без .sha256,
// двойное открытие 3D, клики по полосе виджетов и кнопкам на карте.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const tick = () => new Promise(r => setImmediate(r));

// ─── trophynav-maps.js в node:vm: внутренности открываются только в тесте ───
function loadMaps({ fetchHook } = {}) {
  const prefs = new Map();
  const template = JSON.stringify({ version: 8, sources: { openmaptiles: { type: 'vector', tiles: ['{{TILES}}'] } },
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': 'white' } }] });
  const ctx = {
    console, setTimeout,
    localStorage: { getItem: k => prefs.get(k) ?? null, setItem: (k, v) => prefs.set(k, String(v)) },
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null }, dispatchEvent() {},
      querySelector: () => ({}) },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    L: { Layer: { extend: p => { function C(id) { this.initialize(id); } C.prototype = p; return C; } } },
    map: { hasLayer: () => true },
    currentBaseLayerName: 'tnmap:test',
    fetch: async url => {
      const hooked = fetchHook?.(url);
      if (hooked) return hooked;
      return { ok: true, status: 200, text: async () => template };
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('../ui/trophynav-maps-core.js'), ctx);
  const src = read('../ui/trophynav-maps.js').replace('window.TrophyNavMaps = {',
    'window.__t = { TnVectorLayer, state, setTheme, setRelief, updateState, updateAvailable }; window.TrophyNavMaps = {');
  vm.runInContext(src, ctx);
  return { ctx, prefs, ...ctx.__t };
}

function deferredTopo() {
  let release, started;
  const startedP = new Promise(r => { started = r; });
  const hook = url => {
    if (!url.includes('theme-topo')) return null;
    started();
    return new Promise(r => { release = () => r({ ok: true, status: 200,
      text: async () => JSON.stringify({ layers: { background: { 'background-color': 'red' } } }) }); });
  };
  return { hook, startedP, release: () => release() };
}

test('#2433: поздний ответ темы «Топо» не перекрывает последний выбор «Обычная»', async () => {
  const topo = deferredTopo();
  const { prefs, state, TnVectorLayer, setTheme } = loadMaps({ fetchHook: topo.hook });
  const applied = [];
  state.local = [{ id: 'test', size: 100 }];
  const layer = new TnVectorLayer('test');
  const ml = { setStyle: s => applied.push(s.layers[0].paint['background-color']) };
  layer._gl = { getMaplibreMap: () => ml };
  state.activeLayer = layer;

  setTheme('topo');
  await topo.startedP;
  setTheme('normal');
  await tick();
  topo.release();
  await tick(); await tick();

  assert.equal(prefs.get('tnd-tnmaps-theme:test'), 'normal');
  assert.deepEqual(applied, ['white'], 'применён только последний выбор');
});

test('#2433: смена темы во время первой сборки слоя — слой строится по последнему выбору', async () => {
  const topo = deferredTopo();
  const { ctx, state, TnVectorLayer, setTheme, prefs } = loadMaps({ fetchHook: topo.hook });
  const applied = [];
  ctx.maplibregl = { addProtocol() {} };
  const ml = { on() {}, getCanvas: () => ({ addEventListener() {} }), setStyle() {} };
  ctx.L.maplibreGL = opts => ({
    addTo() { applied.push(opts.style.layers[0].paint['background-color']); return this; },
    getMaplibreMap: () => ml,
  });
  prefs.set('tnd-tnmaps-theme:test', 'topo');
  state.local = [{ id: 'test', size: 100 }];
  const layer = new TnVectorLayer('test');
  layer.onAdd({});
  await topo.startedP;
  // Слой ещё строится (WebGL нет) — выбор «Обычная» должен дойти до карты
  setTheme('normal');
  topo.release();
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(applied, ['white']);
});

test('#2433: тот же размер без .sha256 — «Проверить», а не «скачана»', () => {
  const { updateState, updateAvailable } = loadMaps();
  const sha = 'a'.repeat(64), other = 'b'.repeat(64);
  assert.equal(updateState({ size: 100, sha256: null }, { size: 100, sha256: sha }), 'verify');
  assert.equal(updateAvailable({ size: 100, sha256: null }, { size: 100, sha256: sha }), true);
  assert.equal(updateState({ size: 100, sha256: sha }, { size: 100, sha256: sha.toUpperCase() }), 'none');
  assert.equal(updateState({ size: 100, sha256: other }, { size: 100, sha256: sha }), 'update');
  assert.equal(updateState({ size: 99, sha256: null }, { size: 100, sha256: sha }), 'update');
  // рельеф: нет файла — обновить; нет .sha256 у рельефа — проверить
  const remote = { size: 100, sha256: sha, terrain: [{ kind: 'dem', size: 50, sha256: sha }] };
  assert.equal(updateState({ size: 100, sha256: sha }, remote), 'update');
  assert.equal(updateState({ size: 100, sha256: sha, dem: { size: 50, sha256: null } }, remote), 'verify');
  assert.equal(updateState({ size: 100, sha256: sha, dem: { size: 50, sha256: sha } }, remote), 'none');
  // «обновить» важнее «проверить»
  assert.equal(updateState({ size: 100, sha256: null, dem: { size: 49, sha256: sha } }, remote), 'update');
});

// ─── trophynav-3d.js: двойное открытие ───
function load3d() {
  const roots = [], maps = [];
  const node = () => ({ addEventListener() {}, focus() {} });
  const ctx = {
    node, console,
    localStorage: { getItem: () => null, setItem() {} },
    CustomEvent: function CustomEvent() {},
    cancelAnimationFrame() {},
    document: { readyState: 'loading', addEventListener() {}, dispatchEvent() {}, body: { appendChild: r => roots.push(r) } },
    addEventListener() {}, removeEventListener() {},
    map: { getCenter: () => ({ lat: 1, lng: 2 }), getZoom: () => 10, getMaxZoom: () => 18, setView() {} },
    maplibregl: { Map: function Map() {
      this.removed = false; this.on = () => {}; this.getCanvas = node; this.getCanvasContainer = node;
      this.remove = () => { this.removed = true; }; maps.push(this);
    } },
  };
  ctx.window = ctx;
  let releaseStyle = null;
  ctx.TrophyNavMaps = {
    hasWebGL: () => true, refreshLocal: async () => {}, regionAt: () => 'test', activeId: () => 'test',
    ensureLibs: async () => {}, localEntry: () => ({ id: 'test' }), STYLE_BASE: 'tnmap://localhost',
    buildStyleFor: () => (ctx.holdStyle ? new Promise(r => { releaseStyle = () => r({ sources: {}, layers: [] }); })
      : Promise.resolve({ sources: {}, layers: [] })),
  };
  vm.createContext(ctx);
  vm.runInContext(read('../ui/trophynav-maps-core.js'), ctx);
  const src = read('../ui/trophynav-3d.js').replace('window.TrophyNav3D = {',
    'injectCss=()=>{}; placeOverMap=()=>{}; collectOverlay=()=>({lines:[],points:[]}); addOverlay=()=>{};'
    + ' buildRoot=()=>({removed:false,querySelector:node,addEventListener(){},remove(){this.removed=true}}); window.TrophyNav3D = {');
  vm.runInContext(src, ctx);
  return { ctx, roots, maps, api: ctx.TrophyNav3D, release: () => releaseStyle() };
}

test('#2452: двойное нажатие «3D» — одна карта; после закрытия не остаётся ни оверлея, ни MapLibre', async () => {
  const { roots, maps, api } = load3d();
  await Promise.all([api.open(), api.open()]);
  assert.equal(maps.length, 1);
  assert.equal(roots.length, 1);
  assert.equal(api.isOpen(), true);
  await api.open(); // уже открыт — ничего нового
  assert.equal(maps.length, 1);
  api.close(true);
  assert.equal(api.isOpen(), false);
  assert.equal(roots.filter(r => !r.removed).length, 0);
  assert.equal(maps.filter(m => !m.removed).length, 0);
});

test('#2452: закрытие во время открытия отменяет его — ничего не создаётся', async () => {
  const { ctx, roots, maps, api, release } = load3d();
  ctx.holdStyle = true;
  const p = api.open();
  for (let i = 0; i < 3; i++) await tick();
  api.close(true);
  release();
  await p;
  assert.equal(maps.length, 0);
  assert.equal(roots.length, 0);
  assert.equal(api.isOpen(), false);
  // после отмены 3D снова открывается
  ctx.holdStyle = false;
  await api.open();
  assert.equal(maps.length, 1);
  assert.equal(api.isOpen(), true);
});

// ─── tn-widgets.js: клики по полосе не доходят до карты ───
test('#2503: полоса виджетов и кнопка скрытия — disableClickPropagation и disableScrollPropagation', () => {
  const src = read('../ui/tn-widgets.js');
  assert.match(src, /L\.DomEvent\.disableClickPropagation\(el\)/);
  assert.match(src, /L\.DomEvent\.disableScrollPropagation\(el\)/);
  assert.match(src, /for \(const el of \[bar, toggle\]\)/);
  // захват mousedown на контейнере карты (перетаскивание трека) не берёт клик по полосе
  assert.match(read('../ui/index.html'), /closest\?\.\('\.leaflet-control, \.leaflet-popup, \.modal, \.ctx-menu, #tn-widgets, #tn-widgets-toggle'\)/);
});

// Настоящий Leaflet 1.9.4 в jsdom — если jsdom доступен (NODE_PATH=…/node_modules); иначе пропуск
const require = createRequire(import.meta.url);
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }

test('#2503: настоящий Leaflet — клик/ПКМ/колесо по виджетам, «3D» и «Обзор» не доходят до карты', { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' }, async () => {
  const dom = new JSDOM('<!doctype html><body><div id="map" style="width:800px;height:600px"></div>'
    + '<span id="sb-coords">0,0</span><span id="sb-zoom">10</span></body>',
  { url: 'https://review.invalid/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  try {
    w.eval(read('../ui/leaflet.js'));
    w.eval('var map = L.map("map", {zoomControl:true,attributionControl:false}).setView([60,30],10)');
    const hits = { click: 0, contextmenu: 0, dblclick: 0, zoom: 0 };
    for (const k of ['click', 'contextmenu', 'dblclick']) w.map.on(k, () => hits[k]++);
    w.map.on('zoomstart', () => hits.zoom++);
    // «Обзор» — тот же код, что в index.html
    const html = read('../ui/index.html');
    const s = html.indexOf('const HandModeControl = L.Control.extend(');
    const e = html.indexOf('new HandModeControl().addTo(map);', s);
    let handClicks = 0;
    w.requestHandMode = () => handClicks++;
    w.eval(html.slice(s, e) + 'new HandModeControl().addTo(map);');
    // «3D»
    w.TrophyNavMaps = { hasWebGL: () => false, activeId: () => 'test' };
    w.showToast = () => {};
    w.eval(read('../ui/trophynav-maps-core.js'));
    w.eval(read('../ui/trophynav-3d.js'));
    w.eval(read('../ui/tn-widgets.js'));
    await new Promise(r => setTimeout(r, 30));

    const press = (el, extra = {}) => {
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 100, clientY: 550, button: 0, ...extra }));
      }
    };
    const targets = [
      w.document.querySelector('.tn-widget-value'),
      w.document.querySelector('.tn-widget-caption'),
      w.document.querySelector('.tn-widget'),
      w.document.getElementById('tn-widgets'),
    ];
    for (const el of targets) {
      assert.ok(el);
      press(el);
      el.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, clientX: 100, clientY: 550 }));
      el.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 550, button: 2 }));
      el.dispatchEvent(new w.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: 100, clientY: 550 }));
    }
    w.document.getElementById('tn-widgets-toggle').click();
    press(w.document.getElementById('tn-widgets-toggle'));
    const btn3d = w.document.querySelector('.tn3d-control a');
    assert.ok(btn3d);
    press(btn3d);
    const hand = w.document.getElementById('btn-hand');
    press(hand);
    await new Promise(r => setTimeout(r, 60));
    assert.deepEqual(hits, { click: 0, contextmenu: 0, dblclick: 0, zoom: 0 });
    assert.equal(handClicks, 1);
    // Контроль: клик по самой карте доходит
    press(w.map.getContainer());
    assert.equal(hits.click, 1);
  } finally {
    w.close();
  }
});
