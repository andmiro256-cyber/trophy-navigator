// 0.9.29: тема TrophyNav Maps держится в памяти и передаётся явно, смена темы — setStyle diff:true с
// индикатором, выбор карты TrophyNav Maps не закрывает «Карту и слои», тема в окне областей, ровный
// блок под картой, крутизна без файла не отмечена, мягкий зум без потери щелчков колеса.
// DOM-проверки — jsdom (NODE_PATH=…/node_modules); без него пропускаются.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const html = read('../ui/index.html');
const mapsJs = read('../ui/trophynav-maps.js');
const tick = () => new Promise(r => setImmediate(r));
const require = createRequire(import.meta.url);
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }
const needDom = { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' };

const EXPORTS = 'window.__t = { TnVectorLayer, state, setTheme, setRelief, themeFor, renderLayerSection, ensureWindow, itemHtml, onWindowClick }; window.TrophyNavMaps = {';
const THEME_COLOR = { topo: 'red', contrast: 'blue' };

// ─── trophynav-maps.js в node:vm ───
function loadMaps({ hold = [] } = {}) {
  const prefs = new Map();
  const template = JSON.stringify({ version: 8, sources: { openmaptiles: { type: 'vector', tiles: ['{{TILES}}'] } },
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': 'white' } }] });
  const gates = {};
  const ctx = {
    console, setTimeout,
    localStorage: { getItem: k => prefs.get(k) ?? null, setItem: (k, v) => prefs.set(k, String(v)) },
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, dispatchEvent() {},
      querySelector: () => ({}) },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    L: { Layer: { extend: p => { function C(id) { this.initialize(id); } C.prototype = p; return C; } } },
    map: { hasLayer: () => true },
    currentBaseLayerName: 'tnmap:test',
    fetch: async url => {
      const m = /theme-([a-z]+)\.json/.exec(url);
      if (!m) return { ok: true, status: 200, text: async () => template };
      const body = { ok: true, status: 200,
        text: async () => JSON.stringify({ layers: { background: { 'background-color': THEME_COLOR[m[1]] } } }) };
      if (!hold.includes(m[1])) return body;
      return new Promise(r => { gates[m[1]] = () => r(body); });
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('../ui/trophynav-maps-core.js'), ctx);
  vm.runInContext(mapsJs.replace('window.TrophyNavMaps = {', EXPORTS), ctx);
  return { ctx, prefs, gates, ...ctx.__t };
}

/** Слой с «картой MapLibre»: запоминает цвет фона и опции каждого setStyle. */
function activeLayer(t) {
  const applied = [], options = [], idle = [];
  t.state.local = [{ id: 'test', size: 100 }];
  const layer = new t.TnVectorLayer('test');
  const ml = {
    setStyle: (s, o) => { applied.push(s.layers[0].paint['background-color']); options.push(o); },
    once: (ev, fn) => { if (ev === 'idle') idle.push(fn); },
  };
  layer._gl = { getMaplibreMap: () => ml };
  t.state.activeLayer = layer;
  return { layer, applied, options, idle };
}
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

test('п.2: тема не перечитывается из localStorage после await — потерянная запись не возвращает старую', async () => {
  const t = loadMaps({ hold: ['topo'] });
  const { applied } = activeLayer(t);
  t.prefs.set('tnd-tnmaps-theme:test', 'normal');
  t.setTheme('topo');
  while (!t.gates.topo) await tick();
  // запись в localStorage «откатилась» (другой процесс, общий профиль) — пока тема грузится
  t.prefs.set('tnd-tnmaps-theme:test', 'normal');
  t.prefs.set('tnd-tnmaps-theme', 'normal');
  t.gates.topo();
  await settle();
  assert.deepEqual(applied, ['red'], 'применена выбранная «Топо»');
  assert.equal(t.themeFor('test'), 'topo', 'выбор в памяти');
  // следующая пересборка (рельеф) тоже по выбору из памяти, не по localStorage
  t.setRelief({ on: false });
  await settle();
  assert.deepEqual(applied, ['red', 'red']);
});

test('п.2: две быстрые смены темы — применяется последняя, поздний ответ первой отброшен', async () => {
  const t = loadMaps({ hold: ['topo'] });
  const { applied } = activeLayer(t);
  t.setTheme('topo');
  await tick();
  t.setTheme('contrast');
  await settle();
  t.gates.topo();
  await settle();
  assert.deepEqual(applied, ['blue']);
  assert.equal(t.prefs.get('tnd-tnmaps-theme:test'), 'contrast');
  assert.equal(t.themeFor('test'), 'contrast');
});

test('п.2: reloadStyle получает тему аргументом; setStyle с diff:true; индикатор держится до idle', async () => {
  assert.match(mapsJs, /async reloadStyle\(theme = themeFor\(this\.mapId\)\)/);
  assert.match(mapsJs, /buildStyleFor\(this\.mapId, \{ theme \}\)/);
  assert.match(mapsJs, /mlMap\.setStyle\(style, \{ diff: true \}\)/);
  assert.doesNotMatch(mapsJs, /diff: false/);
  const t = loadMaps();
  const { options, idle } = activeLayer(t);
  t.setTheme('contrast');
  assert.equal(t.state.applyingTheme, 'test', '«Применяю тему…» сразу после клика');
  await settle();
  assert.equal(JSON.stringify(options), JSON.stringify([{ diff: true }]));
  assert.equal(t.state.applyingTheme, 'test', 'до idle индикатор остаётся');
  idle.forEach(fn => fn());
  assert.equal(t.state.applyingTheme, null);
});

test('п.3: выбор карты TrophyNav Maps не закрывает «Карту и слои», остальные слои — закрывают', () => {
  const body = html.slice(html.indexOf('function setLayer(name, el) {'));
  const fn = body.slice(0, body.indexOf('\n}\n'));
  assert.match(fn, /if \(!window\.TrophyNavMaps\?\.isLayerName\(name\)\) closeModal\('modal-layers'\);/);
  assert.doesNotMatch(fn.replace(/if \(!window\.TrophyNavMaps\?\.isLayerName\(name\)\) closeModal\('modal-layers'\);/, ''),
    /closeModal\('modal-layers'\)/, 'безусловного закрытия нет');
  // поведение условия: TN — не закрывать, растровые — закрывать
  const closed = [];
  const run = name => vm.runInNewContext(`if (!window.TrophyNavMaps?.isLayerName(name)) closeModal('modal-layers');`,
    { name, window: { TrophyNavMaps: { isLayerName: n => n.startsWith('tnmap:') } }, closeModal: id => closed.push([name, id]) });
  run('tnmap:leningrad'); run('OpenStreetMap');
  assert.deepEqual(closed, [['OpenStreetMap', 'modal-layers']]);
});

function domMaps() {
  const dom = new JSDOM('<!doctype html><body><div id="map"></div><div id="tnmaps-layers"></div></body>',
    { url: 'https://review.invalid/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(read('../ui/leaflet.js'));
  w.eval('var map = L.map("map"); var currentBaseLayerName = "tnmap:lo";');
  w.eval(read('../ui/tn-icons.js'));
  w.eval(read('../ui/trophynav-maps-core.js'));
  w.eval(mapsJs.replace('window.TrophyNavMaps = {', EXPORTS));
  const t = w.__t;
  const layer = new t.TnVectorLayer('lo');
  t.state.activeLayer = layer;
  w.map.hasLayer = l => l === layer;
  return { dom, w, t, layer };
}

test('п.3: в окне «TrophyNav Maps по областям» у активной карты — переключатель темы', needDom, () => {
  const { dom, w, t } = domMaps();
  try {
    t.state.local = [{ id: 'lo', size: 10 }, { id: 'kar', size: 10 }];
    const box = w.document.createElement('div');
    box.innerHTML = t.itemHtml('lo') + t.itemHtml('kar');
    const rows = box.querySelectorAll('[data-tnmaps-item-theme]');
    assert.equal(rows.length, 1, 'только у карты на экране');
    assert.deepEqual([...rows[0].querySelectorAll('[data-tnmaps-theme]')].map(b => b.textContent), ['Обычная', 'Контраст', 'Топо']);
    let chosen = null;
    t.state.activeLayer.reloadStyle = th => { chosen = th; };
    t.onWindowClick({ target: rows[0].querySelector('[data-tnmaps-theme="topo"]') });
    assert.equal(chosen, 'topo');
    assert.equal(t.themeFor('lo'), 'topo');
  } finally { dom.window.close(); }
});

test('п.4: блок под картой — две колонки, тема одной строкой, крутизна без файла не отмечена и неактивна', needDom, () => {
  const { dom, w, t } = domMaps();
  try {
    w.localStorage.setItem('tnd-tnmaps-relief', JSON.stringify({ on: true, contours: true, slope: true, strength: 5 }));
    w.localStorage.setItem('tnd-tnmaps-theme:lo', 'topo');
    t.state.local = [{ id: 'lo', size: 10, dem: { size: 5 } }];
    t.renderLayerSection();
    const c = w.document.querySelector('[data-tnmaps-controls]');
    assert.ok(c, 'блок есть');
    assert.deepEqual([...c.querySelectorAll(':scope > .tnmaps-label')].map(e => e.textContent), ['Тема', 'Рельеф', 'Отмывка', 'Значки', '3D']);
    const seg = c.querySelectorAll('.tnmaps-seg > [data-tnmaps-theme]');
    assert.equal(seg.length, 3);
    assert.equal(c.querySelector('.tnmaps-seg-btn.active').dataset.tnmapsTheme, 'topo');
    const slope = c.querySelector('[data-tnmaps-relief="slope"]');
    assert.equal(slope.checked, false, 'нет файла крутизны — не отмечена');
    assert.equal(slope.disabled, true);
    assert.equal(c.querySelector('[data-tnmaps-relief="contours"]').checked, true);
    // значки и 3D — кнопки во всю колонку со значками набора, без эмодзи и ▾
    for (const sel of ['[data-tnmaps-poi-toggle]', '[data-tnmaps-3d]']) {
      const b = c.querySelector(sel);
      assert.ok(b.classList.contains('tnmaps-wide'));
      assert.ok(b.querySelector('svg.tn-ico'));
      assert.doesNotMatch(b.textContent, /▾|\p{Extended_Pictographic}/u);
    }
    // с файлом крутизны галка отражает сохранённый выбор
    t.state.local = [{ id: 'lo', size: 10, dem: { size: 5 }, slope: { size: 5 } }];
    t.renderLayerSection();
    const slope2 = w.document.querySelector('[data-tnmaps-relief="slope"]');
    assert.equal(slope2.checked, true);
    assert.equal(slope2.disabled, false);
  } finally { dom.window.close(); }
  assert.match(mapsJs, /grid-template-columns:56px minmax\(0,1fr\)/);
  assert.match(mapsJs, /\.tnmaps-seg \{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(mapsJs, /\.tnmaps-seg-btn\.active \{ background:var\(--primary\)/);
});

test('п.4: «Применяю тему…» видно в блоке, пока тема перерисовывается', needDom, () => {
  const { dom, w, t } = domMaps();
  try {
    t.state.local = [{ id: 'lo', size: 10 }];
    t.state.applyingTheme = 'lo';
    t.renderLayerSection();
    assert.equal(w.document.querySelector('[data-tnmaps-applying]')?.textContent, 'Применяю тему…');
    t.state.applyingTheme = null;
    t.renderLayerSection();
    assert.equal(w.document.querySelector('[data-tnmaps-applying]'), null);
  } finally { dom.window.close(); }
});

// ─── п.5: зум ───
const zoomOpts = () => {
  const m = html.match(/const TND_MAP_ZOOM_OPTIONS = (\{[^}]*\});/);
  assert.ok(m, 'опции зума вынесены в TND_MAP_ZOOM_OPTIONS');
  return vm.runInNewContext(`(${m[1]})`);
};
const wheelPatch = () => {
  const start = html.indexOf('(function keepWheelClicksDuringZoomAnimation() {');
  const end = html.indexOf('})();', start) + 5;
  assert.ok(start > 0);
  return html.slice(start, end);
};

test('п.5: опции карты — дробный зум, полуровень на кнопку, мягкое колесо; MapLibre-холст с padding 0.05', () => {
  assert.deepEqual({ ...zoomOpts() }, { zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 120, wheelDebounceTime: 30 });
  assert.match(html, /L\.map\('map', \{[^}]*\.\.\.TND_MAP_ZOOM_OPTIONS \}\)/);
  assert.match(mapsJs, /L\.maplibreGL\(\{[^}]*padding: 0\.05 \}\)/);
  // подписи зума — целые
  assert.match(html, /div\.textContent = formatZoomLevel\(map\.getZoom\(\)\)/);
  assert.match(html, /getElementById\('sb-zoom'\)\.textContent = formatZoomLevel\(map\.getZoom\(\)\)\);/);
  assert.doesNotMatch(html, /textContent = map\.getZoom\(\)/);
  const formatZoomLevel = vm.runInNewContext(`${html.match(/const formatZoomLevel = [^;]*;/)[0]} formatZoomLevel`);
  assert.equal(formatZoomLevel(12.25), '12');
  assert.equal(formatZoomLevel(12.75), '13');
});

test('п.5: настоящий Leaflet — щелчок колеса = полуровня, щелчки во время анимации не теряются', needDom, async () => {
  const dom = new JSDOM('<!doctype html><body><div id="map" style="width:800px;height:600px"></div></body>',
    { url: 'https://review.invalid/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  try {
    w.eval(read('../ui/leaflet.js'));
    w.eval(wheelPatch());
    // jsdom без CSS 3D: Leaflet тогда округляет зум до целого (_limitZoom); в WebKit any3d = true
    w.L.Browser.any3d = true;
    w.__opts = zoomOpts();
    w.eval('var map = L.map("map", Object.assign({}, window.__opts)).setView([60, 30], 10, { animate: false });');
    const map = w.map;
    const calls = [];
    map.setZoomAround = (p, z) => calls.push(z);
    const h = map.scrollWheelZoom;
    h._lastMousePos = w.L.point(10, 10);
    // WebKitGTK: deltaY 125 на щелчок, Leaflet на Linux не-Chrome делит на 2·devicePixelRatio
    h._delta = 62.5;
    h._performZoom();
    assert.deepEqual(calls, [10.5], 'один щелчок — полуровень');
    // идёт анимация — щелчок не выброшен, а отложен до zoomend
    calls.length = 0;
    map._animatingZoom = true;
    h._delta = 62.5;
    h._performZoom();
    h._delta += 62.5;
    h._performZoom();
    assert.deepEqual(calls, [], 'пока анимация — не применяется');
    assert.equal(h._delta, 125, 'щелчки накоплены');
    map._animatingZoom = false;
    map.fire('zoomend');
    await new Promise(r => setTimeout(r, 5));
    assert.equal(calls.length, 1);
    assert.ok(calls[0] > 10.5, `накопленные щелчки дают больше одного шага: ${calls[0]}`);
    assert.equal(calls[0] % 0.25, 0, 'шаг кратен zoomSnap');
  } finally { dom.window.close(); }
});

// ─── главный баг с v0.9.27: клик по строке TrophyNav Maps и кнопкам темы в «Карте и слоях» терялся ───
async function domLayersWindow() {
  const dom = new JSDOM(`<!doctype html><body><div id="map"></div>
    <div class="modal-overlay open" id="modal-layers"><div class="modal" id="modal-layers-win"><div id="tnmaps-layers"></div></div></div></body>`,
  { url: 'https://review.invalid/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  if (w.document.readyState !== 'complete') await new Promise(r => w.addEventListener('load', r));
  w.eval(read('../ui/leaflet.js'));
  w.eval('var map = L.map("map"); var currentBaseLayerName = "OpenStreetMap";');
  const calls = { invoke: 0, setLayer: [] };
  w.__TAURI_INTERNALS__ = { invoke: async cmd => {
    if (cmd === 'tnmaps_local') { calls.invoke++; return { maps: [{ id: 'lo', size: 10 }], partial: {}, dir: '/d' }; }
    if (cmd === 'tnmaps_catalog') return { catalog: { maps: [] } };
    throw new Error(cmd);
  } };
  w.setLayer = name => calls.setLayer.push(name);
  w.eval(read('../ui/tn-icons.js'));
  w.eval(read('../ui/trophynav-maps-core.js'));
  w.eval(mapsJs.replace('window.TrophyNavMaps = {', EXPORTS));
  for (let i = 0; i < 5; i++) await tick();
  return { dom, w, t: w.__t, calls };
}
const fire = (w, el, type) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
// то, что делает bringModalToFront на каждый mousedown в окне
const bringToFront = (w, overlay) => { overlay.classList.remove('active'); overlay.classList.add('active'); };

test('баг v0.9.27: нажатие в окне (bringModalToFront → class active) не пересоздаёт строку; выбор TrophyNav Maps срабатывает', needDom, async () => {
  const { dom, w, calls } = await domLayersWindow();
  try {
    const overlay = w.document.getElementById('modal-layers');
    const row = w.document.querySelector('[data-tnmaps-show="lo"]');
    assert.ok(row, 'строка ЛО есть');
    const before = calls.invoke;
    fire(w, row, 'pointerdown');
    bringToFront(w, overlay);
    for (let i = 0; i < 5; i++) await tick();   // человек держит кнопку 60–150 мс
    assert.equal(calls.invoke, before, 'смена active не перечитывает список');
    assert.ok(row.isConnected, 'строка под нажатой кнопкой не пересоздана');
    fire(w, row, 'pointerup');
    fire(w, row, 'click');
    assert.deepEqual(calls.setLayer, ['tnmap:lo'], 'выбор выполнен один раз (pointerup, click не дублирует)');
    // переход закрыто → открыто по-прежнему обновляет список
    overlay.classList.remove('open');
    await tick();
    overlay.classList.add('open');
    for (let i = 0; i < 5; i++) await tick();
    assert.equal(calls.invoke, before + 1);
  } finally { dom.window.close(); }
});

test('баг v0.9.27: даже если строку пересоздали между pointerdown и pointerup — выбор по тому же действию срабатывает', needDom, async () => {
  const { dom, w, t, calls } = await domLayersWindow();
  try {
    fire(w, w.document.querySelector('[data-tnmaps-show="lo"]'), 'pointerdown');
    w.document.getElementById('tnmaps-layers').__tnmapsHtml = '';   // заставить перерисовку
    t.renderLayerSection();
    fire(w, w.document.querySelector('[data-tnmaps-show="lo"]'), 'pointerup');
    assert.deepEqual(calls.setLayer, ['tnmap:lo']);
    // pointerdown на одной строке, pointerup на другой кнопке — ничего
    calls.setLayer.length = 0;
    fire(w, w.document.querySelector('[data-tnmaps-show="lo"]'), 'pointerdown');
    fire(w, w.document.getElementById('tnmaps-layers'), 'pointerup');
    assert.deepEqual(calls.setLayer, []);
  } finally { dom.window.close(); }
});

test('баг v0.9.27: кнопка темы — pointerdown, смена active, pointerup → тема применена', needDom, async () => {
  const { dom, w, t } = await domLayersWindow();
  try {
    const layer = new t.TnVectorLayer('lo');
    t.state.activeLayer = layer;
    w.map.hasLayer = l => l === layer;
    const themes = [];
    layer.reloadStyle = th => themes.push(th);
    t.renderLayerSection();
    const btn = w.document.querySelector('#tnmaps-layers [data-tnmaps-theme="topo"]');
    fire(w, btn, 'pointerdown');
    bringToFront(w, w.document.getElementById('modal-layers'));
    for (let i = 0; i < 5; i++) await tick();
    assert.ok(btn.isConnected);
    fire(w, btn, 'pointerup');
    fire(w, btn, 'click');
    assert.deepEqual(themes, ['topo']);
    // клавиатура (только click) тоже работает
    fire(w, w.document.querySelector('#tnmaps-layers [data-tnmaps-theme="contrast"]'), 'click');
    assert.deepEqual(themes, ['topo', 'contrast']);
  } finally { dom.window.close(); }
});

test('renderLayerSection с той же разметкой не заменяет узлы', needDom, async () => {
  const { dom, w, t } = await domLayersWindow();
  try {
    const row = w.document.querySelector('[data-tnmaps-show="lo"]');
    t.renderLayerSection();
    t.renderLayerSection();
    assert.equal(w.document.querySelector('[data-tnmaps-show="lo"]'), row);
  } finally { dom.window.close(); }
});
