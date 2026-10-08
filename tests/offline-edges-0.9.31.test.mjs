// 0.9.31: офлайн-карта поверх онлайн-подложки (за краем файла — онлайн-карта, а не пустой лист; Яндекс 3395
// под офлайн не держим) и запоминание включённых офлайн-карт в сессии (map.offline). Куски настоящего
// ui/index.html выполняются в node:vm с поддельной картой — без jsdom и Tauri.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
const between = (from, to) => {
  const a = html.indexOf(from);
  const b = html.indexOf(to, a + from.length);
  assert.ok(a > 0 && b > a, `кусок ${from.slice(0, 40)}`);
  return html.slice(a, b);
};

function setup({ base = 'OpenStreetMap', crs = 'EPSG3857' } = {}) {
  let stampId = 0;
  const layers = new Set();
  const mkLayer = name => ({ name, _leaflet_id: ++stampId, addTo(m) { m.addLayer(this); return this; } });
  const ctx = {
    console,
    yandexLayers: new Set(['Яндекс Схема', 'Яндекс Гибрид', 'Яндекс Спутник']),
    L: { stamp: l => l._leaflet_id },
    map: { hasLayer: l => layers.has(l), removeLayer: l => layers.delete(l), addLayer: l => layers.add(l) },
    document: { querySelectorAll: () => [] },
    window: {},
    crsLog: [],
    toggles: [],
  };
  vm.createContext(ctx);
  vm.runInContext(`
    var currentCRS = ${JSON.stringify(crs)};
    var currentBaseLayerName = ${JSON.stringify(base)};
    var currentBaseLayer = null;
    var offlineBaseModeActive = false;
    var offlineMaps = {};
    function switchCRS(y) { currentCRS = y ? 'EPSG3395' : 'EPSG3857'; crsLog.push(currentCRS); }
    function removeActiveOverlaysForCRSChange() {}
    function updateBaseLayerStatusText() {}
    function resolveBaseLayerName(n) { return n === 'OpenStreetMap' ? 'osm_standard' : n; }
    function normalizeOfflineMapPath(p) { return String(p || '').replace(/\\\\/g, '/').replace(/\\/+$/, ''); }
    function getActiveOfflineMapEntries() {
      return Object.values(offlineMaps || {}).filter(entry => entry?.layer && map.hasLayer(entry.layer));
    }
    function hasActiveOfflineMaps() { return getActiveOfflineMapEntries().length > 0; }
    async function toggleOfflineMap(key, btn, opts) {
      toggles.push({ key, opts });
      const e = offlineMaps[key];
      e.layer = mkLayer('offline:' + key); e.layer.addTo(map); e.active = true;
      updateOnlineBaseForOfflineState();
    }
  `, ctx);
  ctx.mkLayer = mkLayer;
  vm.runInContext([
    between('function onlineBaseFitsOfflineMaps() {', '\nfunction deactivateActiveOfflineMapsForOnlineBase'),
    between('function migrateBaseLayerToCatalog() {', '\n// ─────'),
    between('// Включённые офлайн-карты из сессии (map.offline)', '\nfunction updateOfflineMapCardState'),
    `var makeBaseLayer = name => mkLayer(name);
     currentBaseLayer = makeBaseLayer(currentBaseLayerName); currentBaseLayer.addTo(map);
     this.api = {
       get base() { return currentBaseLayer; }, get crs() { return currentCRS; },
       get pending() { return pendingOfflineMapRestore; },
       set pending(v) { pendingOfflineMapRestore = v; },
       offlineMaps, updateOnlineBaseForOfflineState, migrateBaseLayerToCatalog,
       getOfflineMapPathsForState, restoreOfflineMapsFromState };`,
  ].join('\n'), ctx);
  const addOffline = path => {
    const e = { name: path.split('/').pop(), _path: path, layer: mkLayer('offline:' + path), active: true };
    ctx.api.offlineMaps[path] = e;
    e.layer.addTo(ctx.map);
    return e;
  };
  return { ctx, t: ctx.api, addOffline, layers };
}

test('онлайн-подложка остаётся под офлайн-картой и после её выключения', () => {
  const { t, addOffline, ctx } = setup();
  const base = t.base;
  const e = addOffline('/maps/a.sqlitedb');
  t.updateOnlineBaseForOfflineState();
  assert.ok(ctx.map.hasLayer(base), 'подложка не снята');
  assert.equal(t.crs, 'EPSG3857');
  ctx.map.removeLayer(e.layer); e.layer = null;
  t.updateOnlineBaseForOfflineState();
  assert.ok(ctx.map.hasLayer(base));
});

test('Яндекс (3395) под офлайн-картой не держим: снят, проекция 3857; без офлайн — вернулся и 3395', () => {
  const { t, addOffline, ctx } = setup({ base: 'Яндекс Схема', crs: 'EPSG3395' });
  const base = t.base;
  const e = addOffline('/maps/a.mbtiles');
  t.updateOnlineBaseForOfflineState();
  assert.ok(!ctx.map.hasLayer(base), 'Яндекс снят');
  assert.equal(t.crs, 'EPSG3857');
  ctx.map.removeLayer(e.layer); e.layer = null;
  t.updateOnlineBaseForOfflineState();
  assert.ok(ctx.map.hasLayer(base));
  assert.equal(t.crs, 'EPSG3395');
});

test('переход на карту каталога при включённой офлайн-карте: новая подложка тоже под ней', () => {
  const { t, addOffline, ctx } = setup();
  const old = t.base;
  addOffline('/maps/a.rmap');
  t.updateOnlineBaseForOfflineState();
  assert.equal(t.migrateBaseLayerToCatalog(), true);
  assert.ok(!ctx.map.hasLayer(old));
  assert.ok(ctx.map.hasLayer(t.base), 'osm_standard на карте под офлайн');
});

test('map.offline: пути в порядке включения; до восстановления — пути из сессии', () => {
  const { t, addOffline } = setup();
  addOffline('/maps/b.sqlitedb');
  addOffline('/maps/a.sqlitedb');
  assert.deepEqual([...t.getOfflineMapPathsForState()], ['/maps/b.sqlitedb', '/maps/a.sqlitedb']);
  t.pending = ['/maps/x.mbtiles'];
  assert.deepEqual([...t.getOfflineMapPathsForState()], ['/maps/x.mbtiles']);
});

test('восстановление после сканирования: тихо, по порядку, отсутствующие пропускаются, один раз', async () => {
  const { t, ctx } = setup();
  t.offlineMaps['/maps/a.sqlitedb'] = { name: 'a', _path: '/maps/a.sqlitedb' };
  t.offlineMaps['/maps/gone.sqlitedb'] = { name: 'gone', _path: '/maps/gone.sqlitedb', missing: true };
  t.offlineMaps['C:/maps/w.mbtiles'] = { name: 'w', _path: 'C:/maps/w.mbtiles' };
  t.pending = ['/maps/nofile.rmap', '/maps/gone.sqlitedb', 'C:\\maps\\w.mbtiles', '/maps/a.sqlitedb'];
  await t.restoreOfflineMapsFromState();
  assert.deepEqual(ctx.toggles.map(x => x.key), ['C:/maps/w.mbtiles', '/maps/a.sqlitedb']);
  assert.ok(ctx.toggles.every(x => x.opts?.quiet === true), 'без тостов и перехода к границам');
  assert.equal(t.pending, null);
  assert.deepEqual([...t.getOfflineMapPathsForState()], ['C:/maps/w.mbtiles', '/maps/a.sqlitedb']);
  t.pending = ['/maps/a.sqlitedb'];
  await t.restoreOfflineMapsFromState();
  assert.equal(ctx.toggles.length, 2, 'второй скан ничего не включает повторно');
});

test('разметка: pane offlineTiles выше tilePane; сессия пишет и читает map.offline, скан запускает восстановление', () => {
  const z = Number(html.match(/getPane\('offlineTiles'\)\.style\.zIndex = (\d+)/)?.[1]);
  assert.ok(z > 200 && z < 400, 'offlineTiles между tilePane и overlayPane');
  assert.match(between('function collectState(options = {}) {', 'counters:'), /offline: getOfflineMapPathsForState\(\)/);
  assert.match(between('// 5. Restore map view and layer', 'State applied:'),
    /!offlineMapsRestoreConsumed && Array\.isArray\(state\.map\.offline\)/);
  const scan = between('async function scanOfflineMaps() {', '\n/** Подпись кнопки');
  assert.equal(scan.match(/restoreOfflineMapsFromState\(\)/g)?.length, 2, 'оба выхода скана');
});
