// Слои поверх основной карты (ui/tn-layers.js): модель стека, классификатор TrophyNav Maps «только дороги и
// подписи» на всех темах, pane'ы ниже пользовательских объектов, правило проекции (Яндекс 3395), недоступный
// источник, оверлеи каталога в том же стеке, сессия. DOM-проверки — jsdom (NODE_PATH=…/node_modules).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const html = read('../ui/index.html');
const layersJs = read('../ui/tn-layers.js');
const Core = require('../ui/trophynav-maps-core.js');
const TnLayers = require('../ui/tn-layers.js');
const M = TnLayers.Model;
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }
const needDom = { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' };

// ─── модель ───
test('модель: добавить, один экземпляр на источник, не больше трёх, порядок снизу вверх', () => {
  let s = M.emptyStack();
  let r = M.addItem(s, { source: 'map:Google Спутник', label: 'Google Спутник' });
  assert.ok(r.item && /^st_/.test(r.item.iid));
  s = r.stack;
  assert.equal(s.items[0].opacity, 0.5, 'растровая карта поверх — 50 % (решение 08.10)');
  assert.deepEqual(s.items[0].raster, M.NEUTRAL);
  const again = M.addItem(s, { source: 'map:Google Спутник' });
  assert.equal(again.existed, true, 'тот же источник второй раз не добавляется');
  assert.equal(again.stack.items.length, 1);
  s = M.addItem(s, { source: 'tnmap:lo', label: 'ЛО' }).stack;
  assert.deepEqual(s.items[1].tn, { mode: 'roads-labels', poi: false }, 'TrophyNav Maps по умолчанию — дороги и подписи');
  s = M.addItem(s, { source: 'overlay:Яндекс Подписи', opacity: 0.7 }).stack;
  const full = M.addItem(s, { source: 'map:OpenTopoMap' });
  assert.equal(full.full, true);
  assert.equal(full.stack.items.length, 3);
  assert.equal(M.addItem(s, { source: 'bogus' }).item, null, 'неизвестный вид источника');
  // iid стабильны и уникальны
  assert.equal(new Set(s.items.map(i => i.iid)).size, 3);
});

test('модель: порядок (стрелки и перетаскивание), вкл/выкл, прозрачность шагом 5 %, удаление', () => {
  let s = M.emptyStack();
  ['map:A', 'map:B', 'map:C'].forEach(src => { s = M.addItem(s, { source: src }).stack; });
  const [a, b, c] = s.items.map(i => i.iid);
  s = M.moveItem(s, a, +1);
  assert.deepEqual(s.items.map(i => i.iid), [b, a, c]);
  s = M.moveItem(s, c, +1);
  assert.deepEqual(s.items.map(i => i.iid), [b, a, c], 'верхний выше не поднимается');
  s = M.moveItemTo(s, c, 0);
  assert.deepEqual(s.items.map(i => i.iid), [c, b, a]);
  s = M.updateItem(s, b, { enabled: false, opacity: 0.437 });
  assert.equal(M.findItem(s, b).enabled, false);
  assert.equal(M.findItem(s, b).opacity, 0.45);
  assert.equal(M.updateItem(s, b, { opacity: 7 }).items[1].opacity, 1);
  assert.equal(M.updateItem(s, b, { opacity: -1 }).items[1].opacity, 0);
  s = M.removeItem(s, c);
  assert.deepEqual(s.items.map(i => i.iid), [b, a]);
});

test('модель: яркость/контраст/насыщенность у каждого слоя и у основы, «Сбросить» — нейтраль', () => {
  let s = M.addItem(M.emptyStack(), { source: 'map:Google Спутник' }).stack;
  s = M.addItem(s, { source: 'map:OpenTopoMap' }).stack;
  const [sat, topo] = s.items.map(i => i.iid);
  s = M.setAdjust(s, sat, { brightness: -0.4, contrast: 0.2 });
  s = M.setAdjust(s, 'base', { saturation: -1.7 });
  assert.deepEqual(M.findItem(s, sat).raster, { brightness: -0.4, contrast: 0.2, saturation: 0 });
  assert.deepEqual(M.findItem(s, topo).raster, M.NEUTRAL, 'настройка не перетекает на другой слой');
  assert.equal(s.base.raster.saturation, -1, 'значения ограничены −1…1');
  assert.equal(M.cssFilter(M.findItem(s, sat).raster), 'brightness(0.6) contrast(1.25)');
  assert.equal(M.cssFilter(M.NEUTRAL), '', 'нейтраль — без filter');
  const paint = M.maplibreRasterPaint({ brightness: -0.4 });
  assert.ok(paint['raster-brightness-min'] <= paint['raster-brightness-max']);
  assert.deepEqual(paint, { 'raster-brightness-min': 0, 'raster-brightness-max': 0.6, 'raster-contrast': 0, 'raster-saturation': 0 });
  assert.equal(M.maplibreRasterPaint({ brightness: 0.3 })['raster-brightness-min'], 0.3);
  s = M.resetAdjust(s, sat);
  assert.deepEqual(M.findItem(s, sat).raster, M.NEUTRAL);
  // повтор одного и того же значения не накапливается
  let t = s;
  for (let i = 0; i < 5; i++) t = M.setAdjust(t, sat, { brightness: -0.3 });
  assert.equal(M.findItem(t, sat).raster.brightness, -0.3);
});

test('модель: наборы — сохранить, перезаписать по имени, применить (замена стека), удалить', () => {
  let s = M.addItem(M.emptyStack(), { source: 'tnmap:lo' }).stack;
  s = M.setAdjust(s, 'base', { brightness: -0.5 });
  let presets = M.savePreset([], 'Спутник + дороги', s, 'Google Спутник');
  assert.equal(presets.length, 1);
  assert.equal(presets[0].baseLayer, 'Google Спутник');
  const id = presets[0].id;
  const s2 = M.addItem(s, { source: 'map:OpenTopoMap' }).stack;
  presets = M.savePreset(presets, 'спутник + ДОРОГИ', s2, 'Google Спутник');
  assert.equal(presets.length, 1, 'то же имя без учёта регистра — перезапись');
  assert.equal(presets[0].id, id);
  assert.equal(presets[0].stack.items.length, 2);
  presets = M.savePreset(presets, '  ', s2);
  assert.equal(presets.length, 1, 'пустое имя не сохраняется');
  const applied = M.presetStack(presets[0]);
  assert.deepEqual(applied.items.map(i => i.source), ['tnmap:lo', 'map:OpenTopoMap']);
  assert.equal(applied.base.raster.brightness, -0.5);
  assert.deepEqual(M.deletePreset(presets, id), []);
});

test('модель: восстановление из сессии — мусор отбрасывается, лишнее обрезается, настройки целы', () => {
  const raw = { version: 1, base: { raster: { brightness: -0.35 } }, items: [
    { iid: 'st_keep1', source: 'map:Google Спутник', opacity: 0.8, raster: { contrast: 0.3 }, enabled: false },
    { source: 'nope:1' }, null, 'x',
    { iid: 'st_keep1', source: 'tnmap:lo', tn: { mode: 'full', poi: true } },
    { source: 'map:Google Спутник' },
    { source: 'offline:/home/a/карта.sqlitedb', label: 'карта' },
    { source: 'overlay:Яндекс Подписи' },
  ] };
  const s = M.normalizeStack(raw);
  assert.equal(s.items.length, 3);
  assert.deepEqual(s.items.map(i => i.source), ['map:Google Спутник', 'tnmap:lo', 'offline:/home/a/карта.sqlitedb']);
  assert.equal(s.items[0].iid, 'st_keep1');
  assert.notEqual(s.items[1].iid, 'st_keep1', 'повтор iid получает новый');
  assert.equal(s.items[0].enabled, false);
  assert.equal(s.items[0].raster.contrast, 0.3);
  assert.deepEqual(s.items[1].tn, { mode: 'full', poi: true });
  assert.equal(s.base.raster.brightness, -0.35);
  assert.deepEqual(M.normalizeStack(JSON.parse(JSON.stringify(M.serializeStack(s)))), s, 'сериализация обратима');
  assert.deepEqual(M.normalizeStack(null), M.emptyStack());
});

test('модель: MapStack R9 — основа первым элементом, настройки в paint MapLibre', () => {
  let s = M.addItem(M.emptyStack(), { source: 'tnmap:lo' }).stack;
  s = M.setAdjust(s, 'base', { brightness: -0.4 });
  const r9 = M.toR9(s, 'map:Google Спутник');
  assert.equal(r9.version, 1);
  assert.equal(r9.items[0].source, 'map:Google Спутник');
  assert.deepEqual(r9.items[0].raster, { brightnessMin: 0, brightnessMax: 0.6, contrast: 0, saturation: 0 });
  assert.deepEqual(r9.items[1].tn, { mode: 'roads-labels', poi: 'none' });
});

test('правило показа: проекция, основа, выключен, недоступен', () => {
  const item = { source: 'map:Яндекс Схема', enabled: true };
  const ok3395 = { status: 'ok', crs: 'EPSG3395' };
  const ok3857 = { status: 'ok', crs: 'EPSG3857' };
  assert.equal(M.suspendReason(item, { resolved: ok3395, baseCrs: 'EPSG3857', baseSources: new Set() }), 'crs');
  assert.equal(M.suspendReason(item, { resolved: ok3395, baseCrs: 'EPSG3395', baseSources: new Set() }), null);
  assert.equal(M.suspendReason(item, { resolved: ok3857, baseCrs: 'EPSG3395', baseSources: new Set() }), 'crs', 'и наоборот');
  assert.equal(M.suspendReason(item, { resolved: ok3395, baseCrs: 'EPSG3395', baseSources: new Set(['map:Яндекс Схема']) }), 'base');
  assert.equal(M.suspendReason({ ...item, enabled: false }, { resolved: ok3395, baseCrs: 'EPSG3395', baseSources: new Set() }), 'off');
  assert.equal(M.suspendReason(item, { resolved: { status: 'missing' }, baseCrs: 'EPSG3857' }), 'missing');
  assert.equal(M.baseSourceFor('tnmap:lo'), 'tnmap:lo');
  assert.equal(M.baseSourceFor('custom:Моя'), 'custom:Моя');
  assert.equal(M.baseSourceFor('OpenStreetMap'), 'map:OpenStreetMap');
});

// ─── классификатор «только дороги и подписи» ───
const template = read('../ui/vector/style-liberty.json');
const THEME_FILES = { normal: null, contrast: '../ui/vector/theme-contrast.json', topo: '../ui/vector/theme-topo.json' };
const styleFor = theme => Core.buildStyle({
  template, map: { id: 'lo', modified: 1, dem: { modified: 1 }, slope: { modified: 1 } }, base: 'tnmap://localhost',
  theme: THEME_FILES[theme] ? JSON.parse(read(THEME_FILES[theme])) : null, relief: {}, poi: 'all',
});

for (const theme of Object.keys(THEME_FILES)) {
  test(`классификатор: тема «${theme}» — у каждого слоя известная группа, режим убирает фон, заливки и рельеф`, () => {
    const style = styleFor(theme);
    const unknown = style.layers.filter(l => Core.classifyLayer(l) === 'unknown').map(l => l.id);
    assert.deepEqual(unknown, [], 'новый слой темы без группы — его нужно классифицировать');
    style.layers.forEach(l => assert.ok(Core.STACK_GROUPS.includes(Core.classifyLayer(l)), l.id));

    const rl = Core.roadsLabelsStyle(style, {});
    const ids = new Set(rl.layers.map(l => l.id));
    // нет ничего непрозрачного поверх спутника
    assert.deepEqual(rl.layers.filter(l => !['line', 'symbol'].includes(l.type)).map(l => l.id), []);
    for (const l of style.layers) {
      const g = Core.classifyLayer(l);
      if (['background', 'landcover', 'landuse', 'water-fill', 'park', 'building', 'building-3d', 'relief-hillshade', 'relief-contour', 'relief-slope', 'road-area', 'aeroway', 'poi'].includes(g)) {
        assert.ok(!ids.has(l.id), `${l.id} (${g}) убран`);
      }
      // все линии дорог (включая обводки, мосты, тоннели, ж/д) и подписи остаются
      if (l['source-layer'] === 'transportation' && l.type === 'line') assert.ok(ids.has(l.id), `${l.id} остался`);
      if (['transportation_name', 'place', 'water_name', 'mountain_peak'].includes(l['source-layer'])) assert.ok(ids.has(l.id), `${l.id} остался`);
      if (l['source-layer'] === 'boundary') assert.ok(ids.has(l.id), `${l.id} остался`);
    }
    assert.ok(rl.layers.some(l => /casing/.test(l.id)), 'обводки дорог на месте');
    assert.ok(rl.layers.every(l => l.metadata?.['tn:group']), 'у слоёв проставлена группа');
    assert.deepEqual(Object.keys(rl.sources), ['openmaptiles'], 'рельеф (dem/slope) не грузится');
    // значки — по выбору
    const withPoi = Core.roadsLabelsStyle(style, { poi: true });
    assert.ok(withPoi.layers.some(l => Core.classifyLayer(l) === 'poi'));
    assert.ok(!rl.layers.some(l => Core.classifyLayer(l) === 'poi'));
    // исходный стиль не тронут
    assert.ok(style.layers.some(l => l.type === 'background'));
  });
}

test('классификатор: тропы, просеки, зимники «Топо» — дороги; болота и горизонтали — нет; неизвестный слой скрыт', () => {
  const topo = styleFor('topo');
  const group = id => Core.classifyLayer(topo.layers.find(l => l.id === id));
  for (const id of ['topo_track_good', 'topo_track_4wd', 'topo_path', 'topo_winter', 'topo_cutline', 'topo_bridge_casing']) assert.equal(group(id), 'road', id);
  assert.equal(group('topo_swamp'), 'landcover');
  assert.equal(group('topo_contour'), 'relief-contour');
  assert.equal(group('topo_contour_label'), 'relief-contour');
  assert.equal(group('topo_lake_label'), 'water-label');
  assert.equal(group('topo_locality'), 'place-label');
  // роль — не по id: слой с «дорожным» именем, но заливкой землепользования, дорогой не считается
  assert.equal(Core.classifyLayer({ id: 'road_fake', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse' }), 'landuse');
  const odd = { id: 'new_layer', type: 'line', source: 'openmaptiles', 'source-layer': 'something_new' };
  assert.equal(Core.classifyLayer(odd), 'unknown');
  const st = Core.roadsLabelsStyle({ version: 8, sources: { openmaptiles: {} }, layers: [odd] });
  assert.equal(st.layers.length, 0);
});

// ─── index.html: точки связи ───
test('index.html: модуль подключён, раздел в «Карта и слои», сессия пишет стек, синхронизация его не несёт', () => {
  assert.match(html, /<script src="tn-layers\.js"><\/script>/);
  assert.match(html, /<div id="tn-stack-section"><\/div>/);
  assert.match(html, /stack: window\.TnLayers\.serialize\(\)/);
  assert.match(html, /if \(state\.map\.stack\) window\.TnLayers\?\.restore\(state\.map\.stack\)/);
  assert.match(html, /map: fullState\.map \? \(\(\{ stack, \.\.\.rest \}\) => rest\)\(fullState\.map\)/);
  // оверлеи каталога — через стек, CRS их не снимает
  const toggle = html.slice(html.indexOf('function toggleOverlay('), html.indexOf('function setOverlayOpacity('));
  assert.match(toggle, /TnLayers\.setOverlay\(/);
  assert.doesNotMatch(toggle, /addTo\(map\)/);
  const rm = html.slice(html.indexOf('function removeActiveOverlaysForCRSChange('), html.indexOf('function setLayer('));
  assert.doesNotMatch(rm, /cb\.checked = false/, 'смена проекции не снимает галочки');
});

test('без «#» перед цифрами и без цветов в модуле (тест цветов темы)', () => {
  assert.doesNotMatch(layersJs, /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
  const theme = read('../ui/theme.css');
  const missing = [...layersJs.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]).filter(t => !new RegExp(`${t}\\s*:`).test(theme));
  assert.deepEqual([...new Set(missing)], [], 'все токены есть в theme.css');
});

// ─── отрисовка на Leaflet (jsdom) ───
/** Страница с Leaflet, pane'ами из index.html и минимальными глобальными переменными основного скрипта. */
function boot({ base = 'OpenStreetMap', crs = 'EPSG3857', catalog = true } = {}) {
  const dom = new JSDOM('<!doctype html><head></head><body><div id="map" style="width:800px;height:600px"></div><div id="tn-stack-section"></div>'
    + '<div id="catalog-free-layers"><div class="base-layer" data-layer="OpenStreetMap"></div><div class="base-layer" data-layer="OpenTopoMap"></div></div>'
    + '<div id="catalog-base-layers"><div class="base-layer premium-layer" data-layer="Google Спутник"></div><div class="base-layer premium-layer" data-layer="Яндекс Схема"></div></div>'
    + '<div id="catalog-overlay-layers"><div class="overlay-layer"><input type="checkbox" data-overlay="Яндекс Подписи"><span class="overlay-name"></span><input type="range" class="opacity-slider" value="70"><span class="opacity-val">70%</span></div></div>'
    + '</body>', { url: 'https://review.invalid/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(read('../ui/leaflet.js'));
  w.eval('var map = L.map("map").setView([59.9, 30.3], 10);');
  // pane'ы ровно как в index.html
  const a = html.indexOf('// Pane для тайловых оверлеев');
  const b = html.indexOf('// Слои карты управляются', a);
  assert.ok(a > 0 && b > a, 'блок создания pane в index.html');
  w.eval(html.slice(a, b));
  w.eval(`
    var currentBaseLayerName = ${JSON.stringify(base)};
    var currentCRS = ${JSON.stringify(crs)};
    var yandexLayers = new Set(['Яндекс Схема', 'Яндекс Гибрид', 'Яндекс Спутник']);
    var FREE_LAYER_KEYS = new Set(['osm_standard', 'opentopomap']);
    var tileCatalog = ${catalog ? `{ base: [
      { key: 'osm_standard', label: 'OpenStreetMap', url: 'https://t.invalid/osm/{z}/{x}/{y}', maxZoom: 19 },
      { key: 'opentopomap', label: 'OpenTopoMap', url: 'https://t.invalid/otm/{z}/{x}/{y}', maxZoom: 17 },
      { key: 'google_sat', label: 'Google Спутник', url: 'https://t.invalid/gs/{z}/{x}/{y}', maxZoom: 20 },
      { key: 'esri_topo', label: 'ESRI Topo', url: 'https://t.invalid/et/{z}/{x}/{y}', maxZoom: 20 } ],
      overlays: [{ key: 'yandex_labels_webmerc', label: 'Яндекс Подписи', url: 'https://t.invalid/yl/{z}/{x}/{y}', maxZoom: 19 }] }` : 'null'};
    var overlayLayers = {};
    var offlineMaps = {};
    var customLayers = [];
    var premium = true;
    function isPremiumAvailable() { return premium; }
    var saved = 0;
    function saveState() { saved++; }
    function makeBaseLayer(name) {
      const e = (tileCatalog && tileCatalog.base || []).find(x => x.label === name);
      if (e) return L.tileLayer(e.url, { maxNativeZoom: e.maxZoom, maxZoom: 22 });
      if (yandexLayers.has(name)) return L.tileLayer('https://t.invalid/ya/{z}/{x}/{y}', { maxZoom: 22 });
      return null;
    }
    var toasts = [];
    function showToast(m) { toasts.push(m); }
  `);
  w.eval(read('../ui/tn-icons.js'));
  w.eval(layersJs);
  w.TnLayers.init();
  return { dom, w, T: w.TnLayers, map: w.map };
}
/** Объект из окна jsdom → обычный объект node (deepStrictEqual сравнивает и прототипы). */
const plain = v => JSON.parse(JSON.stringify(v));
const z = (map, pane) => Number(map.getPane(pane).style.zIndex || getComputedZ(map, pane));
function getComputedZ(map, pane) {
  // встроенные pane Leaflet получают z-index из leaflet.css: tilePane 200, overlayPane 400, shadowPane 500,
  // markerPane 600, tooltipPane 650, popupPane 700
  return { tilePane: 200, overlayPane: 400, shadowPane: 500, markerPane: 600, tooltipPane: 650, popupPane: 700 }[pane];
}

test('pane: слои поверх выше основы и офлайн-карт, ниже треков, WP и маркеров; порядок = порядок стека', needDom, () => {
  const { dom, T, map } = boot();
  try {
    T.addSource('map:Google Спутник', 'Google Спутник');
    T.addSource('map:OpenTopoMap', 'OpenTopoMap');
    T.addSource('overlay:Яндекс Подписи', 'Яндекс Подписи');
    const items = T.getStack().items;
    const zs = plain(items.map(i => z(map, `tnst-${i.iid}`)));
    assert.deepEqual(zs, [...zs].sort((x, y) => x - y), 'снизу вверх');
    assert.equal(new Set(zs).size, 3);
    const user = ['overlayPane', 'waypointRadius', 'markerPane', 'waypointMarkers', 'tooltipPane', 'popupPane'].map(p => z(map, p));
    const base = ['tilePane', 'offlineTiles'].map(p => z(map, p));
    assert.ok(Math.max(...zs) < Math.min(...user), `слои ${zs} ниже пользовательских ${user}`);
    assert.ok(Math.min(...zs) > Math.max(...base), `слои ${zs} выше основы ${base}`);
    // слой реально лежит в своём pane
    const it = items[0];
    assert.ok(map.getPane(`tnst-${it.iid}`).querySelector('.leaflet-layer'), 'тайлы в pane слоя');
    // перестановка меняет z-index, не пересоздавая слой
    const layerBefore = T._runtime.get(items[2].iid).layer;
    T.setStack({ ...T.getStack(), items: [items[2], items[0], items[1]] });
    assert.equal(T._runtime.get(items[2].iid).layer, layerBefore, 'слой не пересоздан');
    assert.ok(z(map, `tnst-${items[2].iid}`) < z(map, `tnst-${items[1].iid}`));
  } finally { dom.window.close(); }
});

test('отрисовка: прозрачность — setOpacity слоя, яркость — filter только на его pane, основа — tilePane', needDom, () => {
  const { dom, w, T, map } = boot();
  try {
    T.addSource('map:Google Спутник', 'Google Спутник');
    T.addSource('map:OpenTopoMap', 'OpenTopoMap');
    const [sat, topo] = T.getStack().items;
    let s = T.Model.updateItem(T.getStack(), topo.iid, { opacity: 0.5 });
    s = T.Model.setAdjust(s, sat.iid, { brightness: -0.4 });
    s = T.Model.setAdjust(s, 'base', { brightness: -0.2 });
    T.setStack(s);
    assert.equal(T._runtime.get(topo.iid).layer.options.opacity, 0.5);
    assert.equal(map.getPane(`tnst-${sat.iid}`).style.filter, 'brightness(0.6)');
    assert.equal(map.getPane(`tnst-${topo.iid}`).style.filter, '', 'соседний слой не затемнён');
    assert.equal(map.getPane('tilePane').style.filter, 'brightness(0.8)');
    assert.equal(map.getPane('offlineTiles').style.filter, 'brightness(0.8)');
    assert.equal(map.getPane('overlayPane').style.filter, '', 'треки не затемняются');
    // ползунок в панели меняет прозрачность без пересборки окна
    const slider = w.document.querySelector(`.tnst-row[data-iid="${topo.iid}"] input[data-act="opacity"]`);
    slider.value = '25';
    slider.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal(T._runtime.get(topo.iid).layer.options.opacity, 0.25);
    assert.equal(T.getStack().items[1].opacity, 0.25);
    assert.ok(w.saved >= 0);
    assert.equal(JSON.parse(w.localStorage.getItem('tnd-map-stack')).items[1].opacity, 0.25, 'сохранено в localStorage');
  } finally { dom.window.close(); }
});

test('CRS: на основе Яндекс (3395) слои 3857 временно скрыты с подсказкой и настройками; и наоборот', needDom, () => {
  const { dom, w, T, map } = boot({ base: 'Яндекс Схема', crs: 'EPSG3395' });
  try {
    w.premium = true;
    T.addSource('map:Google Спутник', 'Google Спутник');
    const it = T.getStack().items[0];
    let rt = T._runtime.get(it.iid);
    assert.equal(rt.view.reason, 'crs');
    assert.equal(rt.layer, null, 'не нарисован со сдвигом');
    assert.equal(it.enabled, true, 'включённость не тронута');
    assert.match(w.document.querySelector(`.tnst-row[data-iid="${it.iid}"] [data-note]`).textContent, /Временно скрыт/);
    // основа сменилась на 3857 — слой вернулся сам
    w.eval('currentBaseLayerName = "OpenStreetMap"; currentCRS = "EPSG3857";');
    T.refresh();
    rt = T._runtime.get(it.iid);
    assert.equal(rt.view.reason, null);
    assert.ok(rt.layer && map.hasLayer(rt.layer));
    // и наоборот: Яндекс 3395 слоем поверх OSM
    T.addSource('map:Яндекс Схема', 'Яндекс Схема');
    const ya = T.getStack().items[1];
    assert.equal(T._runtime.get(ya.iid).view.reason, 'crs');
  } finally { dom.window.close(); }
});

test('недоступный источник: слой помечен, настройки сохранены, нижние слои показываются; основа не дублируется', needDom, () => {
  const { dom, w, T, map } = boot();
  try {
    T.addSource('map:Google Спутник', 'Google Спутник');
    T.addSource('map:ESRI Topo', 'ESRI Topo');
    const [sat, topo] = T.getStack().items;
    T.setStack(T.Model.setAdjust(T.getStack(), topo.iid, { contrast: 0.5 }));
    // ESRI Topo пропала из каталога (зашитой копии у неё нет)
    w.eval('tileCatalog.base = tileCatalog.base.filter(e => e.label !== "ESRI Topo");');
    T.refresh();
    const rtTopo = T._runtime.get(topo.iid);
    assert.equal(rtTopo.view.reason, 'missing');
    assert.match(w.document.querySelector(`.tnst-row[data-iid="${topo.iid}"] [data-note]`).textContent, /Недоступен.*Настройки сохранены/);
    assert.equal(T.getStack().items[1].raster.contrast, 0.5, 'настройки на месте');
    assert.ok(map.hasLayer(T._runtime.get(sat.iid).layer), 'нижний слой на месте');
    // офлайн-карта без файла
    T.setStack({ ...T.getStack(), items: [...T.getStack().items, { source: 'offline:/нет/файла.sqlitedb', label: 'файл' }] });
    assert.equal(T._runtime.get(T.getStack().items[2].iid).view.reason, 'missing');
    // Premium без лицензии — недоступен, не удалён
    w.premium = false;
    T.refresh();
    assert.equal(T._runtime.get(sat.iid).view.reason, 'locked');
    w.premium = true;
    // основа = источник слоя — слой не рисуется второй раз
    w.eval('currentBaseLayerName = "Google Спутник";');
    T.refresh();
    assert.equal(T._runtime.get(sat.iid).view.reason, 'base');
    assert.equal(T._runtime.get(sat.iid).layer, null);
  } finally { dom.window.close(); }
});

test('ошибка тайлов верхнего слоя: строка показывает «нет тайлов», слой и нижние остаются', needDom, () => {
  const { dom, w, T, map } = boot();
  try {
    T.addSource('map:Google Спутник', 'Google Спутник');
    T.addSource('map:OpenTopoMap', 'OpenTopoMap');
    const [sat, topo] = T.getStack().items;
    const layer = T._runtime.get(topo.iid).layer;
    for (let i = 0; i < 5; i++) layer.fire('tileerror', { tile: w.document.createElement('img'), coords: { x: 0, y: 0, z: 1 } });
    assert.equal(T._runtime.get(topo.iid).health, 'error');
    assert.match(w.document.querySelector(`.tnst-row[data-iid="${topo.iid}"] [data-note]`).textContent, /Нет тайлов/);
    assert.ok(map.hasLayer(T._runtime.get(sat.iid).layer));
  } finally { dom.window.close(); }
});

test('оверлеи каталога — тот же стек: галочка добавляет слой с прозрачностью каталога, список синхронизирован', needDom, () => {
  const { dom, w, T } = boot();
  try {
    const cb = w.document.querySelector('#catalog-overlay-layers input[type=checkbox]');
    assert.equal(T.setOverlay('Яндекс Подписи', true, 0.7), true);
    const item = T.getStack().items[0];
    assert.equal(item.source, 'overlay:Яндекс Подписи');
    assert.equal(item.opacity, 0.7, 'прозрачность оверлея по умолчанию — 70 %, как раньше');
    assert.equal(cb.checked, true);
    // прозрачность из панели «Слои поверх» видна на ползунке списка оверлеев
    T.setStack(T.Model.updateItem(T.getStack(), item.iid, { opacity: 0.4 }));
    assert.equal(w.document.querySelector('#catalog-overlay-layers .opacity-slider').value, '40');
    // удаление в панели снимает галочку
    w.document.querySelector(`.tnst-row[data-iid="${item.iid}"] [data-act="remove"]`).click();
    assert.equal(T.getStack().items.length, 0);
    assert.equal(cb.checked, false);
    // больше трёх — отказ с подсказкой, галочка не ставится
    T.addSource('map:Google Спутник', 'G'); T.addSource('map:OpenTopoMap', 'O'); T.addSource('map:OpenStreetMap', 'S');
    assert.equal(T.setOverlay('Яндекс Подписи', true), false);
    assert.match(w.toasts.at(-1), /Не больше 3/);
  } finally { dom.window.close(); }
});

test('панель: добавить из списка (без основы), стрелки, глаз, настройки, наборы и «Вернуть прежний»', needDom, async () => {
  const { dom, w, T } = boot();
  try {
    const box = () => w.document.getElementById('tn-stack-section');
    const click = sel => { const el = box().querySelector(sel); assert.ok(el, sel); el.click(); };
    assert.match(box().textContent, /Слои поверх/);
    click('[data-act="add-open"]');
    const values = [...box().querySelectorAll('[data-picker] option')].map(o => o.value);
    assert.ok(!values.includes('map:OpenStreetMap'), 'основа в списке не предлагается');
    assert.ok(values.includes('map:Google Спутник') && values.includes('overlay:Яндекс Подписи'));
    box().querySelector('[data-picker]').value = 'map:Google Спутник';
    click('[data-act="add"]');
    T.addSource('map:OpenTopoMap', 'OpenTopoMap');
    const [sat, topo] = T.getStack().items;
    // строки сверху вниз от верхнего слоя
    assert.deepEqual(plain([...box().querySelectorAll('.tnst-row')].map(r => r.dataset.iid)), [topo.iid, sat.iid]);
    // с клавиатуры: фокус на стрелке, Enter/пробел = click
    box().querySelector(`.tnst-row[data-iid="${sat.iid}"] [data-act="up"]`).focus();
    click(`.tnst-row[data-iid="${sat.iid}"] [data-act="up"]`);
    assert.deepEqual(plain(T.getStack().items.map(i => i.iid)), [topo.iid, sat.iid]);
    const focused = w.document.activeElement;
    assert.equal(focused?.dataset.iid, sat.iid, 'фокус остаётся на строке того же слоя');
    assert.equal(focused?.dataset.act, 'down', 'слой наверху — фокус на соседней стрелке');
    click(`.tnst-row[data-iid="${sat.iid}"] [data-act="toggle"]`);
    assert.equal(T.Model.findItem(T.getStack(), sat.iid).enabled, false);
    assert.equal(T._runtime.get(sat.iid).layer, null, 'выключенный слой снят с карты');
    click(`.tnst-row[data-iid="${sat.iid}"] [data-act="settings"]`);
    const bright = box().querySelector(`[data-adjust-for="${sat.iid}"] input[data-adj="brightness"]`);
    bright.value = '-40';
    bright.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal(T.Model.findItem(T.getStack(), sat.iid).raster.brightness, -0.4);
    click(`[data-adjust-for="${sat.iid}"] [data-act="reset"]`);
    assert.deepEqual(plain(T.Model.findItem(T.getStack(), sat.iid).raster), plain(T.Model.NEUTRAL));
    // наборы
    w.tndPrompt = async () => 'Мой набор';
    click('[data-act="preset-save"]');
    await new Promise(r => setTimeout(r, 0));
    assert.equal(T.getPresets().length, 1);
    assert.equal(JSON.parse(w.localStorage.getItem('tnd-map-stack-presets'))[0].name, 'Мой набор');
    click(`.tnst-row[data-iid="${topo.iid}"] [data-act="remove"]`);
    assert.equal(T.getStack().items.length, 1);
    click('[data-act="preset-apply"]');
    assert.equal(T.getStack().items.length, 2, 'набор заменил стек');
    click('[data-act="preset-undo"]');
    assert.equal(T.getStack().items.length, 1, 'прежний набор вернулся');
    w.tndConfirmDanger = async () => true;
    click('[data-act="preset-delete"]');
    await new Promise(r => setTimeout(r, 0));
    assert.equal(T.getPresets().length, 0);
  } finally { dom.window.close(); }
});

test('сессия: restore() восстанавливает стек и настройки, старая сессия без stack ничего не трогает', needDom, () => {
  const { dom, T } = boot();
  try {
    T.addSource('map:Google Спутник', 'Google Спутник');
    const before = T.getStack();
    T.restore(undefined);
    assert.deepEqual(plain(T.getStack()), plain(before), 'сессия 0.9.29 без map.stack');
    T.restore({ version: 1, base: { raster: { brightness: -0.3 } }, items: [{ iid: 'st_a1', source: 'map:OpenTopoMap', opacity: 0.55 }] });
    const s = T.getStack();
    assert.equal(s.items[0].iid, 'st_a1');
    assert.equal(s.items[0].opacity, 0.55);
    assert.equal(s.base.raster.brightness, -0.3);
    assert.ok(T._runtime.get('st_a1').layer, 'слой нарисован');
    assert.equal(T._runtime.size, 1, 'прежний слой снят');
  } finally { dom.window.close(); }
});

test('до загрузки каталога: слой каталога ждёт, после загрузки — рисуется', needDom, () => {
  const { dom, w, T } = boot({ catalog: false });
  try {
    T.restore({ version: 1, items: [{ iid: 'st_g1', source: 'map:Google Спутник' }] });
    assert.equal(T._runtime.get('st_g1').view.reason, 'pending');
    w.eval(`tileCatalog = { base: [{ key: 'google_sat', label: 'Google Спутник', url: 'https://t.invalid/gs/{z}/{x}/{y}', maxZoom: 20 }], overlays: [] };`);
    T.refresh();
    assert.equal(T._runtime.get('st_g1').view.reason, null);
    assert.ok(T._runtime.get('st_g1').layer);
  } finally { dom.window.close(); }
});
