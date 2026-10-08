// Обзорная карта России под картой области (ТЗ 2026-10-08, п. 1 и п. 2): стиль с двумя источниками
// и выбор области по полигонам слоя regions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import '../ui/trophynav-maps-core.js';

const Core = globalThis.TrophyNavMapsCore;
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const template = read('../ui/vector/style-liberty.json');
const topo = JSON.parse(read('../ui/vector/theme-topo.json'));
const contrast = JSON.parse(read('../ui/vector/theme-contrast.json'));
const BASE = 'tnmap://localhost';
const overview = { id: 'russia-overview', modified: 7, minZoom: 0, maxZoom: 8 };
const leningrad = { id: 'leningrad', modified: 1, minZoom: 0, maxZoom: 14 };

test('таблица ISO: 82 карты областей, СПб и ЛО — одна карта, Москва и МО — одна', () => {
  assert.equal(new Set(Object.values(Core.REGION_ISO)).size, 82);
  assert.deepEqual(Core.isosOfRegion('leningrad').sort(), ['RU-LEN', 'RU-SPE']);
  assert.deepEqual(Core.isosOfRegion('moscow').sort(), ['RU-MOS', 'RU-MOW']);
  assert.equal(Core.regionOfIso('RU-SEV'), 'crimea');
  assert.equal(Core.regionOfIso('toString'), null);
});

test('стиль области с обзорной: два источника, обзорная под слоями области, маска своей области', () => {
  for (const theme of [null, contrast, topo]) {
    const s = Core.buildStyle({ template, map: leningrad, base: BASE, theme, relief: {}, poi: 'all', overview });
    assert.ok(s.sources.openmaptiles && s.sources.overview, 'два векторных источника');
    assert.equal(s.sources.overview.maxzoom, 8);
    assert.equal(s.sources.overview.tiles[0], `${BASE}/vector/russia-overview/{z}/{x}/{y}.pbf?v=7`);
    assert.match(s.sources.openmaptiles.tiles[0], /\/vector\/leningrad\//);
    const ids = s.layers.map(l => l.id);
    assert.equal(new Set(ids).size, ids.length, 'id слоёв уникальны');
    assert.equal(s.layers[0].type, 'background');
    assert.equal(s.layers[0].paint['background-color'], Core.NEUTRAL_BACKGROUND);
    const ov = s.layers.filter(l => l.source === 'overview');
    const firstRegion = s.layers.findIndex(l => l.source === 'openmaptiles');
    const lastOv = s.layers.findLastIndex(l => l.source === 'overview');
    assert.ok(ov.length > 20, 'слои обзорной карты');
    assert.ok(lastOv < firstRegion, 'все слои обзорной — под слоями области');
    assert.ok(ov.every(l => l.id.startsWith(Core.OVERVIEW_PREFIX)));
    assert.ok(!ov.some(l => l.type === 'fill-extrusion' || l.source === 'dem' || l.source === 'slope'));
    const mask = s.layers[lastOv];
    assert.equal(mask.id, 'ov_mask');
    assert.equal(mask['source-layer'], 'regions');
    assert.deepEqual(mask.filter.slice(0, 2), ['in', 'iso']);
    assert.deepEqual(mask.filter.slice(2).sort(), ['RU-LEN', 'RU-SPE']);
    // Суша России и маска — цветом фона темы; правила темы те же, что у области
    const themed = Core.buildStyle({ template, map: leningrad, base: BASE, theme, relief: {}, poi: 'all' });
    const bgColor = themed.layers[0].paint['background-color'];
    assert.deepEqual(s.layers[1].paint['fill-color'], bgColor);
    assert.deepEqual(mask.paint['fill-color'], bgColor);
    for (const l of themed.layers.filter(x => x.source === 'openmaptiles' && x.type !== 'fill-extrusion')) {
      const copy = s.layers.find(x => x.id === `ov_${l.id}`);
      assert.ok(copy, `копия ${l.id}`);
      assert.deepEqual(copy.paint, l.paint);
      assert.deepEqual(copy.filter, l.filter);
    }
  }
});

test('без обзорной стиль прежний; слой поверх и обзорная основой — без второго источника', () => {
  const plain = Core.buildStyle({ template, map: leningrad, base: BASE, theme: contrast, relief: {}, poi: 'all' });
  const withNull = Core.buildStyle({ template, map: leningrad, base: BASE, theme: contrast, relief: {}, poi: 'all', overview: null });
  assert.deepEqual(withNull, plain);
  assert.ok(!plain.sources.overview);
  assert.ok(!plain.layers.some(l => l.id.startsWith('ov_')));
  const broken = Core.buildStyle({ template, map: leningrad, base: BASE, theme: null, relief: {}, poi: 'all', overview: { ...overview, error: 'x' } });
  assert.ok(!broken.sources.overview);
  const main = Core.buildStyle({ template, map: overview, base: BASE, theme: contrast, relief: {}, poi: 'all', overview });
  assert.ok(!main.sources.overview, 'обзорная основой — сама себе источник');
  assert.equal(main.layers[0].paint['background-color'], Core.NEUTRAL_BACKGROUND);
  assert.equal(main.layers[1].id, 'ov_land');
  assert.equal(main.layers[1].source, 'openmaptiles');
  // 3D-вид строится из того же стиля
  const s3d = Core.to3dStyle(Core.buildStyle({ template, map: leningrad, base: BASE, theme: topo, relief: {}, poi: 'all', overview }), leningrad, BASE, 1.5);
  assert.ok(s3d.sources.overview);
  // Минимальный масштаб файла области — маска с него, ниже обзорная видна и внутри
  const z4 = Core.buildStyle({ template, map: { ...leningrad, minZoom: 4 }, base: BASE, theme: null, relief: {}, poi: 'all', overview });
  assert.equal(z4.layers.find(l => l.id === 'ov_mask').minzoom, 4);
});

// Синтетика: две соседние «области» по меридиану 31, у ЛО анклав СПб (дырка + отдельный полигон)
const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const features = [
  { properties: { iso: 'RU-LEN' }, geometry: { type: 'Polygon', coordinates: [square(28, 58, 31, 61), square(29.5, 59.5, 30.5, 60.2)] } },
  { properties: { iso: 'RU-SPE' }, geometry: { type: 'Polygon', coordinates: [square(29.5, 59.5, 30.5, 60.2)] } },
  { properties: { iso: 'RU-NGR' }, geometry: { type: 'MultiPolygon', coordinates: [[square(31, 57, 34, 59.5)], [square(31.005, 59.5, 34, 60)]] } },
  { properties: { iso: 'XX-ZZZ' }, geometry: { type: 'Polygon', coordinates: [square(0, 0, 90, 90)] } },
];

test('полигоны: точка внутри, дырка-анклав, мультиполигон, вне всех', () => {
  assert.equal(Core.regionFromFeatures(features, 29, 59), 'leningrad');
  assert.equal(Core.regionFromFeatures(features, 30, 59.9), 'leningrad', 'СПб — та же карта');
  assert.equal(Core.regionFromFeatures(features, 32, 58), 'novgorod');
  assert.equal(Core.regionFromFeatures(features, 33, 59.8), 'novgorod', 'вторая часть мультиполигона');
  assert.equal(Core.regionFromFeatures(features, 50, 50), null, 'неизвестный ISO не область');
  assert.equal(Core.regionFromFeatures([], 29, 59), null);
  assert.ok(Core.pointInGeometry(features[0].geometry, 29, 59));
  assert.ok(!Core.pointInGeometry(features[0].geometry, 30, 59.9), 'дырка не внутри');
});

test('стык: побеждает текущая; далеко от неё — та, где точка', () => {
  // Точка в 0,5 км восточнее границы — в Новгородской, но текущая ЛО остаётся
  assert.equal(Core.regionFromFeatures(features, 31.01, 58.5, { prefer: 'leningrad' }), 'leningrad');
  assert.equal(Core.regionFromFeatures(features, 31.01, 58.5), 'novgorod');
  assert.equal(Core.regionFromFeatures(features, 31.5, 58.5, { prefer: 'leningrad' }), 'novgorod');
  // Щель между упрощёнными полигонами (31…31,005 на широте 59,7) — текущая
  assert.equal(Core.regionFromFeatures(features, 31.003, 59.7, { prefer: 'novgorod' }), 'novgorod');
  assert.equal(Core.regionFromFeatures(features, 31.003, 59.7, { prefer: 'novgorod', tolerance: 0 }), null);
});

// ─── regionAt в trophynav-maps.js: полигоны из GL-карты, без них — bounds ───
function setup({ gl } = {}) {
  const ctx = { console, Date, setTimeout() { return 0; }, clearTimeout() {},
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
    localStorage: { getItem: () => null, setItem() {} },
    L: { Layer: { extend: p => p }, DomEvent: {} },
    currentBaseLayerName: 'tnmap:leningrad',
    map: { getZoom: () => 8, getCenter: () => ({ lat: 59, lng: 33 }), hasLayer: () => true },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('../ui/trophynav-maps-core.js'), ctx);
  vm.runInContext(read('../ui/trophynav-maps.js'), ctx);
  const api = ctx.TrophyNavMaps, state = api._state;
  state.local = [
    { id: 'leningrad', bounds: [27, 57, 33, 62] },
    { id: 'novgorod', bounds: [29, 56, 37, 60] },
    { id: 'russia-overview', bounds: [19, 41, 180, 82] },
  ];
  state.catalog = { maps: [{ id: 'tver', bounds: [30, 55, 38, 58] }] };
  state.activeLayer = { mapId: 'leningrad', glMap: () => gl || null };
  return { ctx, api, state };
}
const fakeGl = feats => ({ queried: 0, getSource: id => (id === 'overview' ? {} : undefined),
  querySourceFeatures(src, opts) { this.queried++; assert.equal(src, 'overview'); assert.equal(opts.sourceLayer, 'regions'); return feats; } });

test('regionAt: есть обзорная — по полигону, а не по пересекающимся bounds', () => {
  const gl = fakeGl(features);
  const { api } = setup({ gl });
  // bounds ЛО накрывают точку в Новгородской, полигон — нет
  assert.equal(api.regionAt(58, 32, 'leningrad'), 'novgorod');
  assert.ok(gl.queried > 0);
  assert.equal(api.regionAt(58.5, 31.01, 'leningrad'), 'leningrad', 'стык — текущая');
  // Вне полигонов (море, тайлы не пришли) — запасной способ по bounds, обзорная в нём не область
  assert.equal(api.regionAt(61.5, 32), 'leningrad');
  assert.equal(api.regionAt(70, 100), null);
});

test('regionAt: полигон области без карты — null, с каталогом — её id', () => {
  const tver = { properties: { iso: 'RU-TVE' }, geometry: { type: 'Polygon', coordinates: [square(31, 55, 38, 57.5)] } };
  const { api } = setup({ gl: fakeGl([tver]) });
  assert.equal(api.regionAt(56, 34, 'leningrad'), null);
  assert.equal(api.regionAt(56, 34, 'leningrad', true), 'tver');
});

test('regionAt: без обзорной карты или без GL — прежние bounds', () => {
  const gl = fakeGl(features);
  const { api, state } = setup({ gl });
  state.local = state.local.filter(m => m.id !== 'russia-overview');
  assert.equal(api.regionAt(58, 32, 'leningrad'), 'leningrad');
  assert.equal(gl.queried, 0);
  const noGl = setup();
  assert.equal(noGl.api.regionAt(58, 32, 'leningrad'), 'leningrad');
  assert.equal(noGl.api.regionAt(58, 32), 'leningrad');
});
