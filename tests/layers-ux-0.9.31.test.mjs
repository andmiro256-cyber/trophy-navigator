// 0.9.31, решение Андрея 08.10 — «Карта и слои»:
// 1) «Слои поверх»: «нет покрытия» (сервер ответил 404 — ГГЦ 500м над Рязанью) отличается от «сеть/ошибка»,
//    для ГГЦ/Генштаб — подсказка с картами, у которых тайл под центром есть;
// 2) растровая карта поверх по умолчанию — 50 %, сохранённые слои не меняются;
// 3) «Мои карты» без карт — одна строка; свой порядок карт перетаскиванием (ui/tn-layer-order.js).
// DOM-проверки — jsdom (NODE_PATH=…/node_modules) на кусках настоящего ui/index.html.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const html = read('../ui/index.html');
const layersJs = read('../ui/tn-layers.js');
const orderJs = read('../ui/tn-layer-order.js');
const M = require('../ui/tn-layers.js').Model;
const Order = require('../ui/tn-layer-order.js');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }
const needDom = { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' };
const between = (from, to) => {
  const a = html.indexOf(from);
  const b = html.indexOf(to, a + from.length);
  assert.ok(a > 0 && b > a, `кусок ${from.slice(0, 40)}`);
  return html.slice(a, b);
};
const tick = () => new Promise(r => setTimeout(r, 0));

// ═══ 2. Прозрачность по умолчанию ═══
test('прозрачность нового слоя: растровая карта поверх 50 %, TrophyNav Maps 100 %, оверлей — своя', () => {
  let s = M.emptyStack();
  for (const src of ['map:ГГЦ 500м', 'custom:Моя', 'offline:/maps/a.sqlitedb']) {
    const r = M.addItem(M.emptyStack(), { source: src });
    assert.equal(r.item.opacity, 0.5, src);
  }
  assert.equal(M.addItem(s, { source: 'tnmap:lo' }).item.opacity, 1);
  assert.equal(M.addItem(s, { source: 'overlay:Яндекс Подписи', opacity: 0.8 }).item.opacity, 0.8, 'оверлей каталога — его прозрачность');
  assert.equal(M.addItem(s, { source: 'map:OpenTopoMap', opacity: 0.35 }).item.opacity, 0.35, 'явное значение не меняется');
  // уже сохранённые слои — как были
  s = M.normalizeStack({ items: [{ iid: 'st_old1', source: 'map:OpenTopoMap', opacity: 1 }, { iid: 'st_old2', source: 'custom:X' }] });
  assert.deepEqual(s.items.map(i => i.opacity), [1, 1]);
  assert.match(layersJs, /defaultOpacity\(source\);\n\s*const res = addItem\(stack, \{ source, label, opacity \}\)/, 'кнопка «Добавить» берёт значение по виду источника');
});

// ═══ 1. Нет покрытия ═══
test('tileerror: признак 404 и url тайла для проверки; CachedTileLayer передаёт url в ошибке', () => {
  assert.deepEqual(M.tileErrorInfo({ error: { status: 404, url: 'https://t.invalid/a' } }), { status: 'missing', url: 'https://t.invalid/a' });
  assert.deepEqual(M.tileErrorInfo({ error: { status: 'missing' } }), { status: 'missing', url: '' });
  assert.deepEqual(M.tileErrorInfo({ error: { status: 503 }, tile: { src: 'https://t.invalid/b' } }), { status: null, url: 'https://t.invalid/b' });
  assert.equal(M.tileErrorInfo({ tile: { src: 'blob:https://x/1' } }).url, '', 'blob: из кэша не проверяется');
  assert.equal(M.tileErrorInfo(null).status, null);
  assert.match(between('const CachedTileLayer = L.TileLayer.extend({', 'function cachedTileLayer('),
    /tile\.onerror = \(\) => \{ const err = new Error\('tile'\); err\.url = url; finish\(err\); \};/);
});

test('текст «нет покрытия»: проверенные альтернативы, общая подсказка для ГГЦ, без подсказки для чужих карт', () => {
  assert.equal(M.coverageNote('ГГЦ 500м', ['ГГЦ 250м', 'ГГЦ 1000м', 'ГГЦ 2км']), 'У «ГГЦ 500м» нет карты на это место — попробуйте ГГЦ 250м, ГГЦ 1000м или ГГЦ 2км.');
  assert.equal(M.coverageNote('ГГЦ 500м', ['ГГЦ 1км']), 'У «ГГЦ 500м» нет карты на это место — попробуйте ГГЦ 1км.');
  assert.equal(M.coverageNote('ГГЦ 500м', []), 'У «ГГЦ 500м» нет карты на это место.');
  assert.equal(M.coverageNote('ГГЦ 500м', null), 'У «ГГЦ 500м» нет карты на это место — попробуйте ГГЦ 250м или ГГЦ 1км.');
  assert.equal(M.coverageNote('ГГЦ 250м', null), 'У «ГГЦ 250м» нет карты на это место — попробуйте ГГЦ 1км.', 'себя не предлагает');
  assert.equal(M.coverageNote('Michelin', null), 'У «Michelin» нет карты на это место.');
  assert.equal(M.coverageNote('ГГЦ 500м', undefined), 'У «ГГЦ 500м» нет карты на это место.', 'пока проверка идёт');
});

test('probeTileStatus (index.html): 404/410/204 и пустой ответ — нет покрытия, сеть и 5xx — ошибка', async () => {
  const src = between('async function probeTileStatus(', '\n}\n') + '\n}\n';
  const make = fetchImpl => new Function('fetch', 'isTauriRuntime', 'tauriInvoke', `${src}; return probeTileStatus;`)(fetchImpl, () => false, null);
  const resp = (status, bytes) => async () => new Response(status === 204 ? null : new Uint8Array(bytes), { status });
  assert.equal(await make(resp(404, 10))('https://t.invalid/1'), 'missing');
  assert.equal(await make(resp(410, 10))('https://t.invalid/1'), 'missing');
  assert.equal(await make(resp(204, 0))('https://t.invalid/1'), 'missing');
  assert.equal(await make(resp(200, 0))('https://t.invalid/1'), 'missing', 'пустой тайл');
  assert.equal(await make(resp(200, 100))('https://t.invalid/1'), 'ok');
  assert.equal(await make(resp(503, 10))('https://t.invalid/1'), 'error');
  assert.equal(await make(async () => { throw new TypeError('Failed to fetch'); })('https://t.invalid/1'), 'error');
  assert.equal(await make(resp(200, 100))('blob:https://x/1'), 'error', 'не http — не проверяется');
  // в приложении — тот же запрос через Rust: ureq пишет «status code 404»
  const viaTauri = new Function('fetch', 'isTauriRuntime', 'tauriInvoke', `${src}; return probeTileStatus;`)(
    async () => { throw new TypeError('cors'); }, () => true, async () => { throw new Error('https://t.invalid/1: status code 404'); });
  assert.equal(await viaTauri('https://t.invalid/1'), 'missing');
});

/** «Слои поверх» на Leaflet (как tests/layer-mixing.test.mjs) + подменяемые проверки тайлов. */
function bootStack() {
  const dom = new JSDOM('<!doctype html><head></head><body><div id="map" style="width:800px;height:600px"></div><div id="tn-stack-section"></div></body>',
    { url: 'https://review.invalid/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(read('../ui/leaflet.js'));
  w.eval('var map = L.map("map").setView([54.63, 39.74], 12);');
  w.eval(`
    var currentBaseLayerName = 'OpenStreetMap', currentCRS = 'EPSG3857';
    var yandexLayers = new Set(), FREE_LAYER_KEYS = new Set(['osm_standard']), overlayLayers = {}, offlineMaps = {}, customLayers = [];
    var tileCatalog = { base: [
      { key: 'osm_standard', label: 'OpenStreetMap', url: 'https://t.invalid/osm/{z}/{x}/{y}', maxZoom: 19 },
      { key: 'ggc_500', label: 'ГГЦ 500м', url: 'https://t.invalid/ggc500/{z}/{x}/{y}', maxZoom: 14 },
      { key: 'opentopomap', label: 'OpenTopoMap', url: 'https://t.invalid/otm/{z}/{x}/{y}', maxZoom: 17 } ],
      overlays: [{ key: 'yl', label: 'Яндекс Подписи', url: 'https://t.invalid/yl/{z}/{x}/{y}', maxZoom: 19, opacity: 0.8 }] };
    function isPremiumAvailable() { return true; }
    function saveState() {}
    function makeBaseLayer(name) {
      const e = tileCatalog.base.find(x => x.label === name);
      return e ? L.tileLayer(e.url, { maxNativeZoom: e.maxZoom, maxZoom: 22 }) : null;
    }
    var probes = [], altCalls = [], probeResult = 'missing', alts = ['ГГЦ 250м', 'ГГЦ 1000м'];
    async function probeTileStatus(url) { probes.push(url); return probeResult; }
    async function coverageAlternatives(name, lat, lng, z) { altCalls.push([name, Math.round(lat * 100) / 100, z]); return alts; }
  `);
  w.eval(read('../ui/tn-icons.js'));
  w.eval(layersJs);
  w.TnLayers.init();
  const note = iid => w.document.querySelector(`.tnst-row[data-iid="${iid}"] [data-note]`);
  const fail = (layer, n, extra = {}) => {
    for (let i = 0; i < n; i++) {
      const tile = w.document.createElement('img');
      tile.src = `https://t.invalid/ggc500/12/${2500 + i}/2793`;
      layer.fire('tileerror', { tile, coords: { x: 0, y: 0, z: 12 }, ...extra });
    }
  };
  return { dom, w, T: w.TnLayers, note, fail };
}

test('слой без покрытия: один запрос тайла → «нет карты на это место» + проверенные ГГЦ; сдвиг карты сбрасывает', needDom, async () => {
  const { dom, w, T, note, fail } = bootStack();
  try {
    T.addSource('map:ГГЦ 500м', 'ГГЦ 500м');
    const item = T.getStack().items[0];
    assert.equal(item.opacity, 0.5, 'растровая карта поверх — 50 %');
    const rt = T._runtime.get(item.iid);
    fail(rt.layer, 6);
    await tick(); await tick();
    assert.equal(w.probes.length, 1, 'проверка — один запрос на цикл загрузки');
    assert.match(w.probes[0], /^https:\/\/t\.invalid\/ggc500\//);
    assert.equal(rt.health, 'nocover');
    assert.deepEqual(JSON.parse(JSON.stringify(w.altCalls)), [['ГГЦ 500м', 54.63, 12]], 'альтернативы — под центром карты');
    assert.equal(note(item.iid).textContent, 'У «ГГЦ 500м» нет карты на это место — попробуйте ГГЦ 250м или ГГЦ 1000м.');
    assert.equal(note(item.iid).hidden, false);
    // сдвиг карты: новый цикл, тайл загрузился — подсказка уходит
    rt.layer.fire('loading');
    rt.layer.fire('tileload', { tile: w.document.createElement('img') });
    assert.equal(rt.health, 'ok');
    assert.equal(note(item.iid).hidden, true);
    // снова пусто, но сервер не ответил (сеть) — прежний текст
    w.probeResult = 'error';
    rt.layer.fire('loading');
    fail(rt.layer, 4);
    await tick(); await tick();
    assert.equal(rt.health, 'error');
    assert.match(note(item.iid).textContent, /Нет тайлов \(сеть или источник\)/);
    assert.equal(w.probes.length, 2);
  } finally { dom.window.close(); }
});

test('статус 404 уже в событии — без лишнего запроса; не ГГЦ — без подсказки; проверка не удалась — общая подсказка', needDom, async () => {
  const { dom, w, T, note, fail } = bootStack();
  try {
    T.addSource('map:OpenTopoMap', 'OpenTopoMap');
    const topo = T.getStack().items[0];
    fail(T._runtime.get(topo.iid).layer, 4, { error: { status: 404 } });
    await tick();
    assert.equal(w.probes.length, 0);
    assert.equal(w.altCalls.length, 0, 'альтернативы ищутся только для ГГЦ/Генштаб');
    assert.equal(note(topo.iid).textContent, 'У «OpenTopoMap» нет карты на это место.');
    w.alts = null;
    T.addSource('map:ГГЦ 500м', 'ГГЦ 500м');
    const ggc = T.getStack().items[1];
    fail(T._runtime.get(ggc.iid).layer, 4);
    await tick(); await tick();
    assert.equal(note(ggc.iid).textContent, 'У «ГГЦ 500м» нет карты на это место — попробуйте ГГЦ 250м или ГГЦ 1км.');
    // оверлей каталога — по-прежнему своя прозрачность
    T.addSource('overlay:Яндекс Подписи', 'Яндекс Подписи');
    assert.equal(T.getStack().items[2].opacity, 0.8);
  } finally { dom.window.close(); }
});

// ═══ 3б. Порядок карт: модель ═══
test('порядок: сортировка внутри групп, подзаголовки на месте, новые карты — в конце группы, синонимы зашитых', () => {
  const rows = [
    { id: 'esri_topo' }, { id: 'new_cat' },
    { title: 'Яндекс' }, { id: 'yandex_map' }, { id: 'Яндекс Спутник' },
    { title: 'ГГЦ / Генштаб (nakarte.me)' }, { id: 'ggc_250' }, { id: 'ggc_500' }, { id: 'ggc_1000' }, { id: 'ГГЦ 2км' },
  ];
  const aliases = id => ({ ggc_500: ['ГГЦ 500м'], ggc_1000: ['ГГЦ 1км'], ggc_250: ['ГГЦ 250м'] }[id] || []);
  // порядок сохранён ещё без каталога (имена зашитых) — работает и на ключах каталога
  const order = ['ГГЦ 2км', 'ГГЦ 500м', 'Яндекс Спутник', 'esri_topo_missing', 'new_cat'];
  const out = Order.applyOrder(rows, order, aliases);
  assert.deepEqual(out.map(r => r.title ? `# ${r.title}` : r.id), [
    'new_cat', 'esri_topo',
    '# Яндекс', 'Яндекс Спутник', 'yandex_map',
    '# ГГЦ / Генштаб (nakarte.me)', 'ГГЦ 2км', 'ggc_500', 'ggc_250', 'ggc_1000',
  ]);
  assert.deepEqual(Order.applyOrder(rows, []).map(r => r.id), rows.map(r => r.id), 'без порядка — как было');
  assert.deepEqual(Order.moveKey(['a', 'b', 'c', 'd'], 'd', 'b', false), ['a', 'd', 'b', 'c']);
  assert.deepEqual(Order.moveKey(['a', 'b', 'c', 'd'], 'a', 'c', true), ['b', 'c', 'a', 'd']);
  assert.deepEqual(Order.moveKey(['a', 'b'], 'a', 'zz', true), ['a', 'b'], 'неизвестная цель — без изменений');
  assert.deepEqual(Order.normalizeOrders({ free: ['a', 'a', '', 'b'], bogus: ['x'], premium: 'x' }), { free: ['a', 'b'] });
  assert.doesNotMatch(orderJs, /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/, 'цвета — только токены');
  const theme = read('../ui/theme.css');
  const missing = [...orderJs.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]).filter(t => !new RegExp(`${t}\\s*:`).test(theme));
  assert.deepEqual(missing, []);
  assert.match(html, /<script src="tn-layers\.js"><\/script>\n<script src="tn-layer-order\.js"><\/script>/);
});

// ═══ 3. «Карта и слои» на кусках index.html ═══
const CATALOG = {
  base: [['osm_standard', 'OpenStreetMap'], ['opentopomap', 'OpenTopoMap'], ['ggc_250', 'ГГЦ 250м'], ['ggc_500', 'ГГЦ 500м'],
    ['ggc_1000', 'ГГЦ 1000м'], ['esri_topo', 'ESRI Topo']]
    .map(([id, name]) => ({ id, name, url: `https://example.invalid/${id}/{z}/{x}/{y}`, proxy: `/tiles/${id}/{z}/{x}/{y}`, maxzoom: 19 })),
  overlays: [],
};
function setupWindow({ order = null, custom = [] } = {}) {
  const body = between('<div class="layer-section-title" id="custom-layers-title"', '<div class="layer-section-title" style="margin-top:8px">Оверлейные слои</div>');
  const dom = new JSDOM(`<!doctype html><head></head><body><div class="modal-body">${body}</div></body>`, { url: 'https://review.invalid/', runScripts: 'dangerously' });
  const w = dom.window;
  if (order) w.localStorage.setItem('tnd-layer-order', JSON.stringify(order));
  w.eval(orderJs);
  w.eval([
    between('function escapeHtml(text) {', '\n}\n') + '\n}\n',
    between('function safeNum(value, fallback = 0) {', '\n}\n') + '\n}\n',
    `const API_BASE = 'https://trophynav.ru';
     let tileCatalog = null, currentBaseLayer = { name: 'OpenStreetMap' }, currentBaseLayerName = 'OpenStreetMap';
     let offlineBaseModeActive = false, currentCRS = 'EPSG3857';
     let customLayers = ${JSON.stringify(custom)};
     const toasts = [], picked = [], dlLayerList = [], dlOverlayList = [];
     const yandexLayers = new Set(['Яндекс Схема', 'Яндекс Гибрид', 'Яндекс Спутник']);
     const tnIcon = (n, c) => '<svg class="tn-ico ' + (c || '') + '" data-icon="' + n + '"></svg>';
     const showToast = t => toasts.push(t);
     const closeModal = () => {};
     const hasActiveOfflineMaps = () => false;
     const deactivateActiveOfflineMapsForOnlineBase = () => false;
     const removeActiveOverlaysForCRSChange = () => {};
     const switchCRS = () => {};
     const updateBaseLayerStatusText = () => {};
     const map = { removeLayer() {}, hasLayer: () => true };
     function makeBaseLayer(name) { return { name, addTo() { picked.push(name); } }; }
     function setCustomLayer(id) { picked.push('custom:' + id); }
     function deleteCustomLayer() {}`,
    between('// Пользовательские предпочтения: скрытые карты', "let currentBaseLayer = makeBaseLayer('OpenStreetMap');"),
    between('// Free layer keys (not premium)', 'function fallbackLayerMaxZoom(name) {'),
    between('/** Строка карты в «Карта и слои»', 'function catalogMaxZoom('),
    between('function setLayer(name, el, opts = {}) {', '// ─────'),
    between('function renderCustomLayers() {', 'function setCustomLayer('),
    `window.__t = { buildLayerUI, renderCustomLayers, picked, get name() { return currentBaseLayerName; },
       loadCatalog(data) { tileCatalog = normalizeCatalog(JSON.parse(JSON.stringify(data))); buildLayerUI(); } };`,
  ].join('\n'));
  const doc = w.document;
  const keys = sel => [...doc.querySelectorAll(`${sel} > .base-layer`)].map(d => d.dataset.orderKey);
  const premium = () => [...doc.getElementById('catalog-base-layers').children]
    .filter(n => !n.classList.contains('lo-reset')).map(n => n.classList.contains('base-layer') ? n.dataset.layer : `# ${n.textContent.trim()}`);
  return { dom, w, doc, t: w.__t, keys, premium };
}
/** Высота строки 30 px — у jsdom нет раскладки. */
function layout(container) {
  [...container.querySelectorAll(':scope > *')].forEach((n, i) => {
    n.getBoundingClientRect = () => ({ top: i * 30, bottom: i * 30 + 30, height: 30, left: 0, right: 300, width: 300 });
  });
}
const ev = (w, type, x, y) => new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });

test('«Мои карты» без карт — одна строка без пояснения; со своими картами — список с порядком', needDom, () => {
  const { dom, doc, t } = setupWindow();
  try {
    t.renderCustomLayers();
    const title = doc.getElementById('custom-layers-title');
    assert.ok(title.classList.contains('custom-layers-empty'));
    assert.equal(doc.getElementById('custom-layers-list').innerHTML, '');
    assert.doesNotMatch(html, /Нет добавленных карт/);
    assert.match(title.textContent.replace(/\s+/g, ' '), /Мои карты \+ Добавить/);
  } finally { dom.window.close(); }
  const c = setupWindow({ custom: [{ id: 1, name: 'A', url: 'u', maxZoom: 18 }, { id: 2, name: 'B', url: 'u', maxZoom: 18 }], order: { custom: ['2', '1'] } });
  try {
    c.t.renderCustomLayers();
    assert.ok(!c.doc.getElementById('custom-layers-title').classList.contains('custom-layers-empty'));
    assert.deepEqual(c.keys('#custom-layers-list'), ['2', '1']);
    assert.ok(c.doc.querySelector('#custom-layers-list > .lo-reset'), '«Сбросить порядок»');
  } finally { c.dom.window.close(); }
});

test('свой порядок: внутри раздела, подзаголовки на месте, переживает загрузку каталога; «Сбросить порядок»', needDom, () => {
  const { dom, w, doc, t, keys, premium } = setupWindow({ order: { premium: ['ГГЦ 2км', 'ГГЦ 500м', 'Michelin'], free: ['CyclOSM'] } });
  try {
    t.buildLayerUI();
    const p = premium();
    const g = p.indexOf('# ГГЦ / Генштаб (nakarte.me)');
    assert.deepEqual(p.slice(g, g + 6), ['# ГГЦ / Генштаб (nakarte.me)', 'ГГЦ 2км', 'ГГЦ 500м', 'ГГЦ 250м', 'ГГЦ 1км', 'Генштаб 250м']);
    const tf = p.indexOf('# Thunderforest / Прочие');
    assert.equal(p[tf + 1], 'Michelin', 'Michelin — первым в своей группе, не выше подзаголовка');
    assert.equal(keys('#catalog-free-layers')[0], 'CyclOSM');
    // каталог загрузился: ГГЦ 500м теперь ggc_500 — порядок тот же
    t.loadCatalog(CATALOG);
    const p2 = premium();
    const g2 = p2.indexOf('# ГГЦ / Генштаб (nakarte.me)');
    // с каталогом «ГГЦ 2км» (нет в каталоге) убрана — как в Android; порядок остальных сохранён
    assert.deepEqual(p2.slice(g2, g2 + 2), ['# ГГЦ / Генштаб (nakarte.me)', 'ГГЦ 500м']);
    assert.equal(doc.querySelector('#catalog-base-layers .base-layer[data-layer="ГГЦ 500м"]').dataset.orderKey, 'ggc_500');
    // сброс
    const reset = doc.querySelector('#catalog-base-layers > .lo-reset');
    assert.ok(reset);
    assert.ok(doc.querySelector('#catalog-free-layers > .lo-reset'), 'у «Бесплатных» тоже свой порядок');
    reset.click();
    const p3 = premium();
    const g3 = p3.indexOf('# ГГЦ / Генштаб (nakarte.me)');
    assert.deepEqual(p3.slice(g3 + 1, g3 + 4), ['ГГЦ 250м', 'ГГЦ 500м', 'ГГЦ 1000м']);
    assert.equal(doc.querySelector('#catalog-base-layers > .lo-reset'), null);
    assert.deepEqual(JSON.parse(w.localStorage.getItem('tnd-layer-order')), { free: ['CyclOSM'] }, 'сброшен только этот раздел');
  } finally { dom.window.close(); }
});

test('перетаскивание: сдвиг > 5 px переносит строку и гасит click; короткий клик выбирает карту; строка не пересоздаётся под нажатой мышью', needDom, async () => {
  const { dom, w, doc, t, keys } = setupWindow();
  try {
    t.buildLayerUI();
    const free = doc.getElementById('catalog-free-layers');
    assert.deepEqual(keys('#catalog-free-layers'), ['OpenStreetMap', 'OpenTopoMap', 'CyclOSM', 'OSM Humanitarian']);
    layout(free);
    // короткий клик: нажал-отпустил на месте → выбор карты, порядок не тронут
    const topoSpan = free.querySelector('.base-layer[data-layer="OpenTopoMap"] > span');
    topoSpan.dispatchEvent(ev(w, 'pointerdown', 50, 45));
    // каталог перерисовывает список, пока кнопка нажата — откладывается
    t.buildLayerUI();
    assert.equal(free.querySelector('.base-layer[data-layer="OpenTopoMap"] > span'), topoSpan, 'узел под мышью не пересоздан');
    topoSpan.dispatchEvent(ev(w, 'pointerup', 50, 45));
    topoSpan.click();
    assert.equal(t.name, 'OpenTopoMap', 'клик выбрал карту');
    await tick();
    assert.equal(w.localStorage.getItem('tnd-layer-order'), null);
    // перенос «OSM Humanitarian» (4-я) наверх: выше середины первой строки
    layout(free);
    const hum = free.querySelector('.base-layer[data-layer="OSM Humanitarian"]');
    const humSpan = hum.querySelector('span');
    humSpan.dispatchEvent(ev(w, 'pointerdown', 50, 105));
    humSpan.dispatchEvent(ev(w, 'pointermove', 50, 60));
    assert.ok(hum.classList.contains('lo-dragging'));
    humSpan.dispatchEvent(ev(w, 'pointermove', 50, 5));
    assert.ok(free.querySelector('.base-layer[data-layer="OpenStreetMap"]').classList.contains('lo-drop-before'), 'индикатор места вставки');
    humSpan.dispatchEvent(ev(w, 'pointerup', 50, 5));
    humSpan.click();
    assert.equal(t.name, 'OpenTopoMap', 'click после перетаскивания не выбирает карту');
    await tick();
    assert.deepEqual(keys('#catalog-free-layers'), ['OSM Humanitarian', 'OpenStreetMap', 'OpenTopoMap', 'CyclOSM']);
    assert.deepEqual(JSON.parse(w.localStorage.getItem('tnd-layer-order')).free, ['OSM Humanitarian', 'OpenStreetMap', 'OpenTopoMap', 'CyclOSM']);
    assert.equal(free.querySelector('.lo-drop-before, .lo-drop-after, .lo-dragging'), null);
    // удержание 250 мс тоже начинает перетаскивание; кнопка «Скрыть» в строке — нет
    layout(free);
    const eye = free.querySelector('.base-layer[data-layer="CyclOSM"] button');
    eye.dispatchEvent(ev(w, 'pointerdown', 290, 105));
    await new Promise(r => setTimeout(r, Order.HOLD_MS + 50));
    assert.equal(doc.querySelector('.lo-dragging'), null);
    eye.dispatchEvent(ev(w, 'pointerup', 290, 105));
    const cyc = free.querySelector('.base-layer[data-layer="CyclOSM"]');
    cyc.querySelector('span').dispatchEvent(ev(w, 'pointerdown', 50, 105));
    await new Promise(r => setTimeout(r, Order.HOLD_MS + 50));
    assert.ok(cyc.classList.contains('lo-dragging'), 'удержание');
    doc.dispatchEvent(ev(w, 'pointerup', 50, 105));
    assert.ok(!cyc.classList.contains('lo-dragging'));
  } finally { dom.window.close(); }
});

test('перетаскивание не уводит карту за подзаголовок: цель — только своя группа', needDom, async () => {
  const { dom, w, doc, t, premium } = setupWindow();
  try {
    t.buildLayerUI();
    const box = doc.getElementById('catalog-base-layers');
    layout(box);
    const before = premium();
    const row = box.querySelector('.base-layer[data-layer="ГГЦ 2км"]');
    const idx = [...box.children].indexOf(row);
    row.querySelector('span').dispatchEvent(ev(w, 'pointerdown', 50, idx * 30 + 15));
    row.querySelector('span').dispatchEvent(ev(w, 'pointermove', 50, 0)); // к самому верху списка («Яндекс»)
    row.querySelector('span').dispatchEvent(ev(w, 'pointerup', 50, 0));
    await tick();
    const after = premium();
    const g = after.indexOf('# ГГЦ / Генштаб (nakarte.me)');
    assert.equal(after[g + 1], 'ГГЦ 2км', 'первой в своей группе');
    assert.deepEqual(after.filter(x => x.startsWith('# ')), before.filter(x => x.startsWith('# ')), 'подзаголовки не тронуты');
    assert.equal(after.length, before.length);
  } finally { dom.window.close(); }
});
