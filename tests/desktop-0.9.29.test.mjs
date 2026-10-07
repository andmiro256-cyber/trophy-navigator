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
  assert.match(mapsJs, /grid-template-columns:52px minmax\(0,1fr\)/);
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
    // идёт анимация: щелчки не выброшены, каждый — полуровень, применяются после zoomend
    calls.length = 0;
    map._animatingZoom = true;
    const wheel = () => map.getContainer().dispatchEvent(new w.WheelEvent('wheel', { deltaY: -125, deltaMode: 0, bubbles: true, cancelable: true }));
    wheel(); wheel(); wheel();
    // щелчки, собранные до начала анимации (таймер debounce сработал уже во время неё)
    h._delta = 62.5;
    h._performZoom();
    assert.deepEqual(calls, [], 'пока анимация — не применяется');
    map._animatingZoom = false;
    map.fire('zoomend');
    await new Promise(r => setTimeout(r, 5));
    assert.deepEqual(calls, [12], '4 щелчка во время анимации = +2 уровня, ни один не потерян и не сжат');
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

// ─── щипок тачпада: страница не масштабируется, карта зумится ───
function pinchBlock() {
  const start = html.indexOf('// ─── Щипок тачпада и Ctrl+колесо');
  const kd = html.indexOf("document.addEventListener('keydown'", start);
  const end = html.indexOf('}, true);', kd) + '}, true);'.length;
  assert.ok(start > 0 && kd > start);
  return html.slice(start, end);
}
async function domPinch() {
  const dom = new JSDOM(`<!doctype html><body><div id="map" style="width:800px;height:600px"></div>
    <div class="modal-overlay open" id="m"><input id="field"></div></body>`,
  { url: 'https://review.invalid/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(read('../ui/leaflet.js'));
  w.L.Browser.any3d = true;
  w.__opts = zoomOpts();
  w.eval('var map = L.map("map", Object.assign({}, window.__opts)).setView([60, 30], 10, { animate: false });');
  w.eval(pinchBlock());
  const zooms = [];
  w.map.setZoomAround = (p, z) => zooms.push([Math.round(p.x), Math.round(p.y), z]);
  return { dom, w, zooms };
}

test('щипок: Rust перехватывает GDK_TOUCHPAD_PINCH и зовёт tndPinch; zoomHotkeysEnabled false; viewport без масштаба', () => {
  const rs = read('../src-tauri/src/pinch.rs');
  assert.match(rs, /EventType::TouchpadPinch/);
  assert.match(rs, /gtk::glib::Propagation::Stop/);
  assert.match(rs, /window\.tndPinch && window\.tndPinch\(/);
  assert.match(read('../src-tauri/src/main.rs'), /pinch::install\(window\)/);
  assert.match(read('../src-tauri/tauri.conf.json'), /"zoomHotkeysEnabled": false/);
  assert.match(html, /<meta name="viewport" content="[^"]*maximum-scale=1\.0, user-scalable=no">/);
});

test('щипок над картой зумит карту вокруг точки между пальцами; над окном — ничего', needDom, async () => {
  const { dom, w, zooms } = await domPinch();
  try {
    const mapEl = w.document.getElementById('map');
    const modal = w.document.getElementById('m');
    w.document.elementFromPoint = (x, y) => (x < 800 ? mapEl : modal);
    w.tndPinch(0, 1, 400, 300);
    w.tndPinch(1, 2, 400, 300);   // развели вдвое — +1 уровень
    w.tndPinch(2, 2, 400, 300);
    await new Promise(r => setTimeout(r, 30));
    assert.deepEqual(zooms.at(-1), [400, 300, 11]);
    zooms.length = 0;
    w.tndPinch(0, 1, 900, 300);   // над окном
    w.tndPinch(1, 3, 900, 300);
    w.tndPinch(2, 3, 900, 300);
    await new Promise(r => setTimeout(r, 30));
    assert.deepEqual(zooms, []);
  } finally { dom.window.close(); }
});

test('GestureEvent (WebKit): preventDefault и зум карты; Ctrl+колесо: preventDefault, обычное колесо не тронуто', needDom, async () => {
  const { dom, w, zooms } = await domPinch();
  try {
    const mapEl = w.document.getElementById('map');
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
    await new Promise(r => setTimeout(r, 30));
    assert.deepEqual(zooms.at(-1), [100, 50, 9]);
    const wheel = (el, ctrlKey) => {
      const e = new w.WheelEvent('wheel', { deltaY: -100, ctrlKey, bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const field = w.document.getElementById('field');
    assert.equal(wheel(field, true), true, 'Ctrl+колесо над полем — страница не масштабируется');
    assert.equal(wheel(field, false), false, 'обычное колесо над полем не тронуто');
    const key = (k, target) => {
      const e = new w.KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true });
      (target || w.document.body).dispatchEvent(e);
      return e.defaultPrevented;
    };
    assert.equal(key('+'), true);
    assert.equal(key('0'), true);
    assert.equal(key('-', field), false, 'в поле ввода Ctrl+− не перехватывается');
  } finally { dom.window.close(); }
});

// ─── футер «Точки», «Треки», «Маршруты»: «Сохранить ▾» и «Загрузить» в одну строку ───
test('футеры трёх окон: две кнопки без подписей «Сохранить:/Загрузить:», nowrap, справа', () => {
  const footers = [...html.matchAll(/<div class="modal-footer file-footer">([\s\S]*?)\n {4}<\/div>/g)].map(m => m[1]);
  assert.equal(footers.length, 3);
  for (const [i, kind] of ['waypoints', 'tracks', 'routes'].entries()) {
    const f = footers[i];
    assert.equal((f.match(/<button /g) || []).length, 2, kind);
    assert.match(f, new RegExp(`class="save-btn" data-save-kind="${kind}" aria-haspopup="menu"[^>]*onclick="toggleSaveMenu\\(this, '${kind}'\\)"`));
    assert.match(f, new RegExp(`class="open-btn" data-open-kind="${kind}" onclick="openFileFor\\('${kind}'\\)"`));
    assert.match(f, /#tn-i-save[\s\S]*Сохранить[\s\S]*#tn-i-chevron-down/);
    assert.match(f, /#tn-i-open"\/><\/svg>Загрузить</);
  }
  assert.doesNotMatch(html, />(Сохранить|Загрузить):</);
  assert.match(html, /\.modal-footer\.file-footer \{ flex-wrap: nowrap; justify-content: flex-end;/);
  // Linux click-fallback по-прежнему ловит эти кнопки (button[onclick]) и пункты меню (.ctx-item[onclick])
  assert.match(html, /'button\[onclick\]',[\s\S]*'\.ctx-item\[onclick\]'/);
});

function fileFooterBlock() {
  const start = html.indexOf('// ─── Футер окон «Точки», «Треки», «Маршруты»');
  const end = html.indexOf('function openFileHtmlFallback(accept, callback) {');
  assert.ok(start > 0 && end > start);
  return html.slice(start, end);
}

test('«Загрузить» — нужный загрузчик по расширению без учёта регистра; «Сохранить ▾» — меню форматов, Esc закрывает', needDom, () => {
  const dom = new JSDOM('<!doctype html><body><button id="b">Сохранить</button></body>', { url: 'https://review.invalid/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  try {
    w.eval(`var calls = []; var opened = null; var toasts = [];
      function openFile(accept, cb) { opened = { accept, cb }; }
      function showToast(m) { toasts.push(m); }
      ${['loadWPT', 'loadGPXFile', 'loadPLT', 'loadGPXTracks', 'loadRTE', 'loadGPXRoutes', 'saveWaypointsGPX', 'saveWaypointsWPT',
        'saveTracksGPX', 'saveTracksPLT', 'saveRoutesGPX', 'saveRoutesRTE'].map(n => `function ${n}(t, f) { calls.push(['${n}', f]); }`).join('\n')}
      ${fileFooterBlock()}`);
    w.openFileFor('tracks');
    assert.equal(w.opened.accept, '.plt,.PLT,.gpx,.GPX', 'свой формат первым — по нему папка по умолчанию');
    w.opened.cb('x', 'Трек.PLT', {});
    w.opened.cb('x', 'b.gpx', {});
    w.opened.cb('x', 'c.kml', {});
    assert.deepEqual(Array.from(w.calls, c => c[0]), ['loadPLT', 'loadGPXTracks']);
    assert.equal(w.toasts.length, 1);
    w.calls.length = 0;
    w.openFileFor('waypoints'); assert.equal(w.opened.accept, '.wpt,.WPT,.gpx,.GPX');
    w.opened.cb('x', 'p.WPT'); w.opened.cb('x', 'p.Gpx');
    w.openFileFor('routes'); assert.equal(w.opened.accept, '.rte,.RTE,.gpx,.GPX');
    w.opened.cb('x', 'r.rte'); w.opened.cb('x', 'r.GPX');
    assert.deepEqual(Array.from(w.calls, c => c[0]), ['loadWPT', 'loadGPXFile', 'loadRTE', 'loadGPXRoutes']);

    w.calls.length = 0;
    const btn = w.document.getElementById('b');
    w.toggleSaveMenu(btn, 'tracks');
    const menu = w.document.getElementById('save-menu');
    assert.equal(menu.hidden, false);
    assert.equal(btn.getAttribute('aria-expanded'), 'true');
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    assert.deepEqual(Array.from(items, i => i.textContent), ['в .gpx', 'в .plt']);
    assert.equal(w.document.activeElement, items[0], 'фокус на первом пункте — меню доступно с клавиатуры');
    items[1].click();
    assert.deepEqual(Array.from(w.calls, c => c[0]), ['saveTracksPLT']);
    assert.equal(menu.hidden, true);
    // Esc и клик мимо закрывают
    w.toggleSaveMenu(btn, 'tracks');
    menu.querySelector('[role="menuitem"]').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(menu.hidden, true);
    assert.equal(w.document.activeElement, btn);
    w.toggleSaveMenu(btn, 'tracks');
    w.document.body.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
    assert.equal(menu.hidden, true);
    w.toggleSaveMenu(btn, 'tracks');
    menu.querySelector('[role="menuitem"]').click();
    assert.deepEqual(Array.from(w.calls, c => c[0]), ['saveTracksPLT', 'saveTracksGPX']);
  } finally { dom.window.close(); }
});

// ─── Live: время последней точки цветом — одна функция для попапа и списка ───
function liveFns() {
  const start = html.indexOf('function liveShowPopup(dev) {');
  const end = html.indexOf('function liveRenderSidebar(devices, now) {');
  const sideEnd = html.indexOf('function liveUpdateDot(');
  assert.ok(start > 0 && end > start && sideEnd > end);
  const ctx = {
    escapeHtml: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    tnIcon: n => `<svg class="tn-ico"><use href="#tn-i-${n}"></use></svg>`,
    liveDeviceUniqueId: () => '', liveStatusInfo: () => ({ emoji: '🙂', label: 'Без статуса' }),
    safeNum: n => Number(n) || 0, liveHasPos: v => v != null && Number.isFinite(Number(v)),
    liveGetActiveGroupId: () => 'all', LIVE_GROUP_SELF_ID: '__self__', liveZoomTo() {},
    document: { getElementById: id => (ctx.els[id] ||= { innerHTML: '', textContent: '' }) }, els: {},
  };
  vm.createContext(ctx);
  const T = html.match(/const LIVE_OFFLINE_TIMEOUT = (\d+);/)[1];
  vm.runInContext(`const LIVE_OFFLINE_TIMEOUT = ${T}; function liveEsc(s) { return escapeHtml(s); }
    ${html.slice(start, sideEnd)}
    this.out = { liveAgeClass, liveTimeLabel, liveIsOnline, livePopupHtml, liveRenderSidebar, LIVE_OFFLINE_TIMEOUT, LIVE_RECENT_MS };`, ctx);
  return { ...ctx.out, els: ctx.els };
}

test('Live: «в сети» = не старше 5 мин, жёлтое — до 1 ч, красное — дольше; одна граница везде', () => {
  const { liveAgeClass, liveIsOnline, LIVE_OFFLINE_TIMEOUT: T, LIVE_RECENT_MS: H } = liveFns();
  assert.equal(T, 300000);
  assert.equal(H, 3600000);
  const now = Date.parse('2026-10-08T12:00:00Z');
  const at = ms => ({ lastUpdate: new Date(now - ms).toISOString() });
  assert.equal(liveAgeClass(at(0), now), 'online');
  assert.equal(liveAgeClass(at(T), now), 'online', 'ровно 5 мин — ещё в сети');
  assert.equal(liveAgeClass(at(T + 1000), now), 'recent');
  assert.equal(liveAgeClass(at(H), now), 'recent', 'ровно час — ещё жёлтое');
  assert.equal(liveAgeClass(at(H + 1000), now), 'old');
  assert.equal(liveAgeClass({}, now), 'none');
  assert.equal(liveAgeClass({ lastUpdate: 'мусор' }, now), 'none');
  assert.equal(liveIsOnline(at(T), now), true);
  assert.equal(liveIsOnline(at(T + 1000), now), false);
  // сортировка, приглушение маркера, счётчик и строка списка — через общую функцию
  assert.doesNotMatch(html, /\) [<>] LIVE_OFFLINE_TIMEOUT/);
  assert.match(html, /liveUpdateMarker\(dev, !liveIsOnline\(dev, now\)\)/);
  assert.match(html, /const aOnline = liveIsOnline\(a, now\);/);
  assert.match(html, /const isOffline = !liveIsOnline\(dev, now\);/);
  assert.match(html, /devices\.filter\(d => liveIsOnline\(d, now\)\)/);
  assert.match(html, /setIcon\(icon\)\.setOpacity\(opacity\)/, 'маркер не в сети приглушён');
  for (const [cls, token] of [['online', 'success-text'], ['recent', 'warning-text'], ['old', 'error-text'], ['none', 'text-muted']]) {
    assert.match(html, new RegExp(`\\.live-time\\.${cls} \\{ color: var\\(--${token}\\);`));
  }
});

test('Live: время «21:40» сегодня / «06.10 21:40» раньше / «—»; тот же класс в попапе и списке; без 🏎📡🔋🕐; экранирование', () => {
  const { liveTimeLabel, livePopupHtml, liveRenderSidebar, els } = liveFns();
  const now = new Date(2026, 9, 8, 12, 0, 0).getTime();
  assert.equal(liveTimeLabel({ lastUpdate: new Date(2026, 9, 8, 9, 5).toISOString() }, now), '09:05');
  assert.equal(liveTimeLabel({ lastUpdate: new Date(2026, 9, 6, 21, 40).toISOString() }, now), '06.10 21:40');
  assert.equal(liveTimeLabel({}, now), '—');
  const dev = (ms, extra = {}) => ({ name: '<b>Вася</b>', lat: 60, lon: 30, battery: '<i>80</i>', speed: 42, altitude: 15,
    ...(ms == null ? {} : { lastUpdate: new Date(now - ms).toISOString() }), ...extra });
  const cases = [[60000, 'online'], [20 * 60000, 'recent'], [3 * 3600000, 'old'], [null, 'none']];
  for (const [ms, cls] of cases) {
    const pop = livePopupHtml(dev(ms), now);
    assert.match(pop, new RegExp(`<span class="live-time ${cls}" title="Последняя точка">`), `попап ${cls}`);
    liveRenderSidebar([dev(ms)], now);
    assert.match(els['live-devices-list'].innerHTML, new RegExp(`<span class="live-time ${cls}"`), `список ${cls}`);
  }
  const pop = livePopupHtml(dev(60000), now);
  assert.doesNotMatch(pop, /🏎|📡|🔋|🕐/u);
  for (const icon of ['gauge', 'terrain', 'battery']) assert.match(pop, new RegExp(`#tn-i-${icon}`));
  assert.match(pop, /&lt;b&gt;Вася&lt;\/b&gt;/);
  assert.match(pop, /&lt;i&gt;80&lt;\/i&gt;%/);
  assert.doesNotMatch(pop, /<b>Вася|<i>80/);
});

// ─── Live в 3D-виде ───
test('Live в 3D: после опроса при открытом 3D — setData с теми же участниками (фильтр группы) и классами свежести', () => {
  const grab = (startMark, endMark) => { const a = html.indexOf(startMark); const b = html.indexOf(endMark, a); assert.ok(a > 0 && b > a, startMark); return html.slice(a, b); };
  const now = Date.parse('2026-10-08T12:00:00Z');
  const devs = [
    { id: 'a', name: 'Онлайн', lat: 60, lon: 30, lastUpdate: new Date(now - 60000).toISOString(), group: 1 },
    { id: 'b', name: 'Час', lat: 61, lon: 31, lastUpdate: new Date(now - 30 * 60000).toISOString(), group: 1 },
    { id: 'c', name: 'Давно', lat: 62, lon: 32, lastUpdate: new Date(now - 5 * 3600000).toISOString(), group: 1 },
    { id: 'd', name: 'Чужая группа', lat: 63, lon: 33, lastUpdate: new Date(now).toISOString(), group: 2 },
    { id: 'e', name: 'Без позиции', lat: null, lon: null, group: 1 },
  ];
  const sets = [], sidebar = [];
  const ctx = {
    Date: { now: () => now, prototype: Date.prototype }, liveState: { devices: [], markers: {}, _firstFitDone: true },
    liveHasPos: v => v != null && Number.isFinite(Number(v)), liveDeviceMarkerId: d => d.id,
    liveGetFilteredDevices: list => list.filter(d => d.group === 1), liveUpdateMarker() {}, liveShowAll() {},
    liveRenderSidebar: (list, n) => sidebar.push(list.map(d => d.id)), renderLiveGroupsManager() {},
    map: { removeLayer() {} },
    window: { TrophyNav3D: { isOpen: () => true, setLive: f => sets.push(f) } },
  };
  ctx.Date = Date;
  vm.createContext(ctx);
  const T = html.match(/const LIVE_OFFLINE_TIMEOUT = (\d+);/)[1];
  vm.runInContext(`const LIVE_OFFLINE_TIMEOUT = ${T};
    ${grab('// Свежесть последней точки', '/** Содержимое попапа участника Live')}
    ${grab('/** Участники Live для 3D-вида', 'window.tndLive3d = {')}
    ${grab('function liveProcessDevices(devices) {', '\nfunction ')}
    Date.now = () => ${now};
    liveProcessDevices(this.devs);`, Object.assign(ctx, { devs }));
  assert.equal(sets.length, 1);
  const got = sets[0].map(f => [f.properties.id, f.properties.name, f.properties.age, f.geometry.coordinates.join(',')]);
  assert.deepEqual(JSON.parse(JSON.stringify(got)), [['a', 'Онлайн', 'online', '30,60'], ['b', 'Час', 'recent', '31,61'], ['c', 'Давно', 'old', '32,62']]);
  assert.deepEqual(JSON.parse(JSON.stringify(sidebar[0])), ['a', 'b', 'c', 'e'], 'в 3D — те же участники, что в списке (с позицией)');
  // 3D: точки Live не дублируются общим слоем точек; свой слой с цветом по свежести; клик — тот же попап
  const d3 = read('../ui/trophynav-3d.js');
  assert.match(d3, /if \(layer\._liveDev\) return;/);
  assert.match(d3, /'circle-color': LIVE_COLORS/);
  assert.match(d3, /\['match', \['get', 'age'\], 'online', '#2E7D32', 'recent', '#F9A825', 'old', '#C62828'/);
  assert.match(d3, /ml\.on\('click', 'tn-live'[\s\S]*window\.tndLive3d\?\.popupHtml\?\.\(f\.properties\.id\)[\s\S]*new window\.maplibregl\.Popup/);
  assert.match(html, /popupHtml: id => \{[\s\S]*livePopupHtml\(dev\)/);
});

test('Live в 3D: setLive обновляет источник tn-live, если 3D открыт; без 3D — ничего', () => {
  const ctx = { console, localStorage: { getItem: () => null, setItem() {} }, CustomEvent: function () {},
    document: { readyState: 'loading', addEventListener() {}, dispatchEvent() {} }, addEventListener() {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('../ui/trophynav-3d.js'), ctx);
  const api = ctx.TrophyNav3D;
  api.setLive([{ id: 1 }]);   // 3D закрыт — без ошибок
  const data = [];
  api._view.ml = { getSource: id => (id === 'tn-live' ? { setData: d => data.push(d) } : null) };
  api.setLive([{ type: 'Feature', properties: { id: 'a', age: 'online' } }]);
  assert.equal(data.length, 1);
  assert.equal(data[0].features[0].properties.age, 'online');
  api._view.ml = null;
});

// ─── 3D: «Зафиксировать наклон» ───
test('3D wheelGesture {locked}: тачпад и колесо — масштаб, Ctrl (щипок) — масштаб, Shift — наклон; без замка — orbit', () => {
  const Core = (() => { const c = { console }; c.window = c; vm.createContext(c); vm.runInContext(read('../ui/trophynav-maps-core.js'), c); return c.TrophyNavMapsCore; })();
  const wh = o => Object.assign({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, shiftKey: false }, o);
  const L = { locked: true };
  const tp = Core.wheelGesture(wh({ deltaY: 6 }), {}, 0, L);
  assert.equal(tp.kind, 'zoom'); assert.ok(tp.dZoom < 0); assert.equal(tp.dPitch, 0); assert.equal(tp.dBearing, 0);
  const side = Core.wheelGesture(wh({ deltaX: -8, deltaY: 1 }), {}, 0, L);
  assert.equal(side.kind, 'zoom'); assert.equal(side.dBearing, 0, 'горизонталь двумя пальцами не поворачивает');
  assert.equal(Core.wheelGesture(wh({ deltaY: 100 }), {}, 0, L).kind, 'zoom');
  const pinch = Core.wheelGesture(wh({ deltaY: -100 * Math.log(2), ctrlKey: true }), {}, 0, L);
  assert.equal(pinch.kind, 'zoom');
  assert.ok(Math.abs(pinch.dZoom - 1) < 1e-9, 'щипок вдвое — ровно +1 уровень (формула Chromium)');
  const tilt = Core.wheelGesture(wh({ deltaY: 10, shiftKey: true }), {}, 0, L);
  assert.equal(tilt.kind, 'tilt'); assert.ok(tilt.dPitch > 0);
  // жест не «залипает»: в замке всё, кроме Shift, — масштаб
  const st = {};
  Core.wheelGesture(wh({ deltaY: 4, shiftKey: true }), st, 0, L);
  assert.equal(Core.wheelGesture(wh({ deltaY: 4 }), st, 50, L).kind, 'zoom');
  // без замка — прежнее поведение
  assert.equal(Core.wheelGesture(wh({ deltaY: 6 }), {}, 0, { locked: false }).kind, 'orbit');
  assert.equal(Core.wheelGesture(wh({ deltaY: 6 }), {}, 0).kind, 'orbit');
});

test('3D: переключатель «Зафиксировать наклон» (по умолчанию вкл, tnd-3d-pitch-lock), «Вернуть», замок отключает поворот жестами', () => {
  const d3 = read('../ui/trophynav-3d.js');
  assert.match(d3, /const LS_LOCK = 'tnd-3d-pitch-lock';/);
  assert.match(d3, /view\.locked = lsGet\(LS_LOCK\) !== '0';/, 'по умолчанию — вкл');
  assert.match(d3, /data-tn3d-act="lock" aria-pressed="\$\{locked\}"[^>]*>\$\{ico\(locked \? 'lock' : 'lock-open', 'tn-ico-t'\)\}Зафиксировать наклон/);
  assert.match(d3, /data-tn3d-act="restore"[^>]*>\$\{ico\('undo', 'tn-ico-t'\)\}Вернуть/);
  assert.match(d3, /Core\.wheelGesture\(e, view\.wheel, performance\.now\(\), \{ locked: view\.locked \}\)/);
  assert.match(d3, /view\.root\.addEventListener\('wheel', onWheel, \{ passive: false \}\)/, 'колесо/щипок над всем оверлеем');
  // поведение замка на заглушке MapLibre
  const ctx = { console, localStorage: { getItem: () => null, setItem() {} }, CustomEvent: function () {},
    document: { readyState: 'loading', addEventListener() {}, dispatchEvent() {} }, addEventListener() {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('../ui/trophynav-maps-core.js'), ctx);
  vm.runInContext(read('../ui/trophynav-3d.js'), ctx);
  const st = { dragRotate: true, touchPitch: true, rot: true, kbRot: true };
  const eased = [];
  const ml = {
    dragRotate: { disable: () => { st.dragRotate = false; }, enable: () => { st.dragRotate = true; } },
    touchPitch: { disable: () => { st.touchPitch = false; }, enable: () => { st.touchPitch = true; } },
    touchZoomRotate: { disableRotation: () => { st.rot = false; }, enableRotation: () => { st.rot = true; } },
    keyboard: { disableRotation: () => { st.kbRot = false; }, enableRotation: () => { st.kbRot = true; } },
    getPitch: () => 45, getBearing: () => 30, easeTo: o => eased.push(o),
  };
  const api = ctx.TrophyNav3D;
  api._view.ml = ml;
  api._view.fixed = null;
  api._lock.setLocked(true);
  assert.deepEqual({ ...st }, { dragRotate: false, touchPitch: false, rot: false, kbRot: false });
  api._lock.restoreView();
  assert.equal(JSON.stringify(eased.at(-1)), JSON.stringify({ pitch: 45, bearing: 30, duration: 400 }), 'вернуть к запомненному при включении');
  api._lock.setLocked(false);
  assert.deepEqual({ ...st }, { dragRotate: true, touchPitch: true, rot: true, kbRot: true });
  api._view.fixed = null;
  api._view.ml = null;
});
