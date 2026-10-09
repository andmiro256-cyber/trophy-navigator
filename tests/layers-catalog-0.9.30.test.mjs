// 0.9.30: «Карта и слои» — без повторов зашитых карт и карт серверного каталога (зашитая с эквивалентом
// в каталоге не показывается, сохранённый выбор переводится на карту каталога), «Яндекс Гибрид (точный)»
// показывается как «Яндекс Гибрид»; скрытые карты — режим глаза в заголовке, возврат по одной.
// DOM-проверки — jsdom (NODE_PATH=…/node_modules) на кусках настоящего ui/index.html.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }
const needDom = { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' };

const between = (from, to) => {
  const a = html.indexOf(from);
  const b = html.indexOf(to, a + from.length);
  assert.ok(a > 0 && b > a, `кусок ${from.slice(0, 40)}`);
  return html.slice(a, b);
};

// Фактический каталог trophynav.ru/api/tiles-catalog.json (08.10.2026), без лишних полей
const CATALOG = {
  base: [
    ['esri_sat', 'ESRI Спутник'], ['google_hybrid', 'Google Гибрид'], ['google_map', 'Google Карты'],
    ['google_sat', 'Google Спутник'], ['osm_standard', 'OpenStreetMap'], ['opentopomap', 'OpenTopoMap'],
    ['ggc_1000', 'ГГЦ 1000м'], ['ggc_250', 'ГГЦ 250м'], ['ggc_500', 'ГГЦ 500м'],
    ['yandex_hybrid_wgs', 'Яндекс Гибрид (точный)'], ['yandex_map', 'Яндекс Карты'], ['bing_sat', 'Bing Спутник'],
    ['esri_topo', 'ESRI Topo'],
  ].map(([id, name]) => ({ id, name, url: `https://example.invalid/${id}/{z}/{x}/{y}`, proxy: `/tiles/${id}/{z}/{x}/{y}`, maxzoom: 19 })),
  overlays: [],
};

function setup({ session = 'OpenStreetMap', hidden = [] } = {}) {
  const body = between('<div id="catalog-free-layers">', '<div class="layer-section-title" style="margin-top:8px">Оверлейные слои</div>');
  const header = html.match(/<button type="button" class="tn-icon-btn" id="btn-show-hidden-layers"[^>]*>/)[0] + '</button>';
  const dom = new JSDOM(`<!doctype html><body>${header}<div class="modal-body">${body}</div></body>`,
    { url: 'https://review.invalid/', runScripts: 'dangerously' });
  const w = dom.window;
  w.localStorage.setItem('tnd-hidden-layers', JSON.stringify(hidden));
  const code = [
    between('function escapeHtml(text) {', '\n}\n') + '\n}\n',
    `const API_BASE = 'https://trophynav.ru';
     let tileCatalog = null, currentBaseLayer = { name: ${JSON.stringify(session)} }, currentBaseLayerName = ${JSON.stringify(session)};
     let offlineBaseModeActive = false, currentCRS = 'EPSG3857';
     const toasts = [], added = [], dlLayerList = [], dlOverlayList = [];
     const yandexLayers = new Set(['Яндекс Схема', 'Яндекс Гибрид', 'Яндекс Спутник']);
     const tnIcon = (n, c) => '<svg class="tn-ico ' + (c || '') + '" data-icon="' + n + '"></svg>';
     const showToast = t => toasts.push(t);
     const closeModal = () => {};
     const hasActiveOfflineMaps = () => false;
     const deactivateActiveOfflineMapsForOnlineBase = () => false;
     const removeActiveOverlaysForCRSChange = () => {};
     const switchCRS = y => { currentCRS = y ? 'EPSG3395' : 'EPSG3857'; };
     const updateBaseLayerStatusText = () => {};
     const map = { removeLayer() {}, hasLayer: () => true };
     function makeBaseLayer(name) { return { name, addTo() { added.push(name); } }; }`,
    between('// Пользовательские предпочтения: скрытые карты', "let currentBaseLayer = makeBaseLayer('OpenStreetMap');"),
    between('// Free layer keys (not premium)', 'function fallbackLayerMaxZoom(name) {'),
    between('/** Строка карты в «Карта и слои»', 'function catalogMaxZoom('),
    between('function setLayer(name, el, opts = {}) {', '// ─────'),
    `window.__t = {
       get name() { return currentBaseLayerName; }, get crs() { return currentCRS; }, toasts, added,
       loadCatalog(data) { tileCatalog = normalizeCatalog(JSON.parse(JSON.stringify(data))); buildLayerUI(); migrateBaseLayerToCatalog(); },
       buildLayerUI, setLayer, toggleLayerHidden, showHiddenLayersManager, layerDisplayName, getHiddenLayers,
       get mode() { return showHiddenLayersMode; } };`,
  ].join('\n');
  w.eval(code);
  const rows = () => [...w.document.querySelectorAll('#catalog-free-layers .base-layer, #catalog-base-layers .base-layer')]
    .map(d => ({ layer: d.dataset.layer, text: d.textContent.trim(), hidden: d.classList.contains('layer-hidden'),
      btn: d.querySelector('button')?.getAttribute('title') || null, key: d.querySelector('button')?.dataset.layerKey }));
  return { dom, w, t: w.__t, rows };
}

const PAIRS = [
  ['Яндекс Схема', 'Яндекс Карты'], ['Яндекс Гибрид', 'Яндекс Гибрид (точный)'], ['Спутник Bing', 'Bing Спутник'],
  ['Спутник Google', 'Google Спутник'], ['Карты Google', 'Google Карты'], ['Гибрид Google', 'Google Гибрид'],
  ['Спутник ESRI', 'ESRI Спутник'], ['ГГЦ 1км', 'ГГЦ 1000м'],
];

test('без каталога — зашитые карты видны (запас), с кнопкой «Скрыть»', needDom, () => {
  const { dom, t, rows } = setup();
  try {
    t.buildLayerUI();
    const names = rows().map(r => r.layer);
    for (const [builtin] of PAIRS) assert.ok(names.includes(builtin), builtin);
    assert.ok(names.includes('Гибрид Bing') && names.includes('Рельеф Google') && names.includes('CyclOSM'));
    assert.ok(rows().every(r => r.btn === 'Скрыть из списка'));
  } finally { dom.window.close(); }
});

test('каталог загружен — в списке нет пар-эквивалентов; зашитые без эквивалента убраны (как в Android); «точный» показан как «Яндекс Гибрид»', needDom, () => {
  const { dom, t, rows } = setup();
  try {
    t.loadCatalog(CATALOG);
    const list = rows();
    const names = list.map(r => r.layer);
    for (const [builtin, cat] of PAIRS) {
      assert.ok(!names.includes(builtin), `зашитая «${builtin}» скрыта`);
      assert.ok(names.includes(cat), `карта каталога «${cat}» есть`);
    }
    assert.equal(new Set(names).size, names.length, 'ни одной карты дважды');
    // 09.10 (Андрей): с каталогом — как в Android, только карты каталога; зашитые без эквивалента убраны
    for (const gone of ['Гибрид Bing', 'Рельеф Google', '2GIS', 'Космоснимки рельеф', 'TF Outdoors', 'LoMaps', 'Michelin',
      'Яндекс Спутник', 'ГГЦ 2км', 'CyclOSM', 'OSM Humanitarian']) assert.ok(!names.includes(gone), `убрана «${gone}»`);
    const yh = list.find(r => r.layer === 'Яндекс Гибрид (точный)');
    assert.equal(yh.text, 'Яндекс Гибрид', 'отображаемое имя без «(точный)»');
    assert.equal(yh.key, 'yandex_hybrid_wgs');
    assert.equal(list.filter(r => r.text === 'Яндекс Гибрид').length, 1);
    assert.equal(list.find(r => r.layer === 'ESRI Topo')?.key, 'esri_topo', 'новая карта каталога тоже в списке');
    // бесплатные: OSM/OpenTopoMap из каталога, CyclOSM/OSM Humanitarian — зашитые
    const free = [...dom.window.document.querySelectorAll('#catalog-free-layers .base-layer')].map(d => d.dataset.layer);
    assert.deepEqual(free.sort(), ['OpenStreetMap', 'OpenTopoMap'].sort());
  } finally { dom.window.close(); }
});

test('сохранённый «Яндекс Гибрид» после загрузки каталога → yandex_hybrid_wgs (EPSG:3857), тихо; выбор по старому имени — тоже', needDom, () => {
  const { dom, t } = setup({ session: 'Яндекс Гибрид' });
  try {
    t.loadCatalog(CATALOG);
    assert.equal(t.name, 'Яндекс Гибрид (точный)');
    assert.equal(t.crs, 'EPSG3857');
    assert.deepEqual([...t.added], ['Яндекс Гибрид (точный)']);
    assert.deepEqual([...t.toasts], [], 'перевод без тоста');
    t.setLayer('Спутник Bing');
    assert.equal(t.name, 'Bing Спутник');
    t.setLayer('Гибрид Bing');
    assert.equal(t.name, 'Гибрид Bing', 'без эквивалента — зашитая');
    assert.equal(t.toasts.at(-1), 'Карта: Гибрид Bing');
    t.setLayer('Яндекс Гибрид (точный)');
    assert.equal(t.toasts.at(-1), 'Карта: Яндекс Гибрид', 'тост — отображаемое имя');
    const active = dom.window.document.querySelector('.base-layer.active');
    assert.equal(active?.dataset.layer, 'Яндекс Гибрид (точный)');
  } finally { dom.window.close(); }
});

test('без каталога выбор по зашитому имени остаётся зашитым', needDom, () => {
  const { dom, t } = setup({ session: 'OpenStreetMap' });
  try {
    t.setLayer('Яндекс Гибрид');
    assert.equal(t.name, 'Яндекс Гибрид');
    assert.equal(t.crs, 'EPSG3395');
  } finally { dom.window.close(); }
});

test('скрытые карты: глаз в заголовке показывает обе серыми с «Показать», вернуть одну — вторая скрыта; повторный глаз — выход', needDom, () => {
  const { dom, w, t, rows } = setup();
  try {
    t.loadCatalog(CATALOG);
    t.showHiddenLayersManager();
    assert.equal(t.toasts.at(-1), 'Нет скрытых карт');
    assert.equal(t.mode, false);
    t.toggleLayerHidden('bing_sat');
    t.toggleLayerHidden('google_hybrid');
    let names = rows().map(r => r.layer);
    assert.ok(!names.includes('Bing Спутник') && !names.includes('Google Гибрид'));
    t.showHiddenLayersManager();
    assert.equal(t.mode, true);
    const eye = w.document.getElementById('btn-show-hidden-layers');
    assert.ok(eye.classList.contains('active'));
    assert.equal(eye.getAttribute('aria-pressed'), 'true');
    let shown = rows().filter(r => r.hidden);
    assert.deepEqual(shown.map(r => r.layer).sort(), ['Bing Спутник', 'Google Гибрид'].sort());
    assert.ok(shown.every(r => r.btn === 'Показать в списке'));
    assert.ok(rows().filter(r => !r.hidden).every(r => r.btn === 'Скрыть из списка'));
    // вернуть одну
    w.document.querySelector('.base-layer.layer-hidden[data-layer="Bing Спутник"] button').click();
    assert.deepEqual([...t.getHiddenLayers()], ['google_hybrid']);
    shown = rows().filter(r => r.hidden);
    assert.deepEqual(shown.map(r => r.layer), ['Google Гибрид'], 'вторая осталась скрытой');
    assert.equal(rows().find(r => r.layer === 'Bing Спутник').hidden, false);
    // выйти из режима
    t.showHiddenLayersManager();
    assert.equal(t.mode, false);
    names = rows().map(r => r.layer);
    assert.ok(names.includes('Bing Спутник') && !names.includes('Гибрид Bing'));
    assert.equal(eye.getAttribute('aria-pressed'), 'false');
  } finally { dom.window.close(); }
});

test('режим «показывать скрытые» не запоминается; стили и кнопка в заголовке', () => {
  assert.match(html, /let showHiddenLayersMode = false;/);
  assert.doesNotMatch(html, /localStorage\.setItem\([^)]*showHidden/i);
  assert.match(html, /\.base-layer\.layer-hidden > span \{ opacity: 0\.5; \}/);
  assert.doesNotMatch(html, /SPECIAL_PREMIUM_LAYER_NAMES/);
  // скачивание областей: радиокнопки и второй слой — отображаемые имена, значения — label каталога
  assert.match(html, /`\$\{layerDisplayName\(entry\.label\)\} \(z\$\{maxZ\}\)`/);
  assert.match(html, /opt\.value = name; opt\.textContent = layerDisplayName\(name\);/);
});

test('ревью 2582 P2: скрытие под зашитым именем действует после загрузки каталога и наоборот; вернуть — снимает оба', needDom, () => {
  const { dom, t, rows } = setup({ hidden: ['OpenStreetMap', 'Спутник Bing'] });
  try {
    t.buildLayerUI();
    let names = rows().map(r => r.layer);
    assert.ok(!names.includes('OpenStreetMap') && !names.includes('Спутник Bing'), 'без каталога скрыты');
    t.loadCatalog(CATALOG);
    names = rows().map(r => r.layer);
    assert.ok(!names.includes('OpenStreetMap'), 'OSM каталога остаётся скрытой');
    assert.ok(!names.includes('Bing Спутник'), 'эквивалент каталога зашитого «Спутник Bing» остаётся скрытым');
    t.showHiddenLayersManager();
    const shown = rows().filter(r => r.hidden).map(r => r.layer);
    assert.ok(shown.includes('OpenStreetMap') && shown.includes('Bing Спутник'), 'режим глаза показывает их');
    t.toggleLayerHidden('bing_sat');
    assert.ok(!t.getHiddenLayers().includes('Спутник Bing'), 'вернуть по ключу каталога снимает и старое имя');
  } finally { dom.window.close(); }
});
