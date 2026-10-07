// Хотфикс 0.9.28: XSS из имён точек/треков/Live, пустые координаты, кнопки «Мои карты», opener open_path.
// Функции берутся из ui/index.html как есть и выполняются в jsdom с настоящим Leaflet
// (NODE_PATH=…/node_modules). Без jsdom DOM-тесты пропускаются, остальные идут.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const html = read('../ui/index.html');
const require = createRequire(import.meta.url);
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }
const needDom = { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' };

const XSS = '<img src=x onerror=window.__x=1>';

function sourceBetween(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return html.slice(start, end);
}

// escapeHtml, safeCssColor, safeNum, formatDm, parseCoordinateInput, isBlankCoordinateInput, getWaypointPropCoordinates
const HELPERS = sourceBetween('function escapeHtml(text)', 'function formatMapCoord(');

function makeDom(body = '') {
  const dom = new JSDOM(`<!doctype html><body><div id="map" style="width:800px;height:600px"></div>${body}</body>`,
    { url: 'https://review.invalid/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(read('../ui/leaflet.js'));
  w.eval('var map = L.map("map", { attributionControl: false }).setView([60, 30], 10);');
  w.eval(HELPERS);
  w.toasts = [];
  w.showToast = msg => w.toasts.push(String(msg));
  return { dom, w };
}

function assertInert(w, root, where) {
  assert.equal(root.querySelector('img'), null, `${where}: <img> из данных не должен стать элементом`);
  assert.equal(root.querySelectorAll('[onerror]').length, 0, `${where}: нет атрибутов onerror`);
  assert.equal(w.__x, undefined, `${where}: код из имени не выполнился`);
}

test('#1 таблица точек: имя/описание/источник/цвет из GPX показываются текстом, не HTML', needDom, () => {
  const { dom, w } = makeDom('<table><tbody id="wpt-tbody"></tbody></table><input id="wpt-select-all" type="checkbox">');
  try {
    w.eval(sourceBetween('function updateWptTable()', 'function showWptPopup('));
    w.updateSetSelector = () => {};
    w.getActiveSet = () => null;
    w.eval(`var waypoints = [{ wpData: {
      name: ${JSON.stringify(XSS)}, desc: '', num: '1"><b>x</b>', radius: '30<script>', lat: 55.5, lng: 37.5,
      color: 'red;background-image:url(javascript:alert(1))', source: '<i>gpx</i>', syncedAt: '2026-10-07T10:00:00Z'
    } }];`);
    w.updateWptTable();
    const tbody = w.document.getElementById('wpt-tbody');
    assertInert(w, tbody, 'таблица точек');
    assert.equal(tbody.querySelector('.wpt-name').firstChild.textContent, XSS);
    assert.equal(tbody.querySelector('b'), null);
    assert.equal(tbody.querySelector('i'), null);
    assert.equal(tbody.querySelector('script'), null);
    assert.equal(tbody.querySelector('.wpt-num').textContent, '1"><b>x</b>');
    // цвет вне белого списка — значение по умолчанию, без url(…)
    assert.equal(tbody.querySelector('.wpt-icon').getAttribute('style'), 'background:#df7a4a');
  } finally { dom.window.close(); }
});

test('#1 маркер, быстрое переименование и подсказка трека на карте не исполняют имя', needDom, () => {
  const { dom, w } = makeDom();
  try {
    w.eval(sourceBetween('function makeDivIcon(data)', 'function makeWaypointMarkerOptions('));
    w.eval(sourceBetween('let quickRenamePopup = null;', 'function getDefaultRadius()'));
    w.eval(sourceBetween('function formatTrackPointTooltip(track, idx)', '// Тянет точку трека за мышью.'));
    w.garminToEmoji = s => s;
    w.applyQuickRename = () => {};
    w.openWaypointPropsByNum = () => {};

    const data = { name: XSS, icon: '⬤', color: '#123456', num: 7, lat: 60, lng: 30 };
    const marker = w.L.marker([60, 30], { icon: w.makeDivIcon(data) }).addTo(w.map);
    marker.wpData = data;
    const markerEl = marker.getElement();
    assertInert(w, markerEl, 'маркер точки');
    assert.equal(markerEl.querySelector('.tnd-wp-label').textContent, XSS);
    assert.equal(markerEl.querySelector('.tnd-wp-dot').style.background.replace(/\s/g, ''), 'rgb(18,52,86)');

    w.openQuickRename(marker);
    const popup = w.document.querySelector('.leaflet-popup-content');
    assert.ok(popup, 'попап быстрого переименования открыт');
    assertInert(w, popup, 'попап переименования');
    assert.equal(popup.querySelector('input').value, XSS);

    const track = {
      id: 3, name: XSS,
      points: [w.L.latLng(60, 30), w.L.latLng(60.001, 30.001)],
      pointsData: [{}, { name: XSS, desc: '<svg onload=window.__x=2>', sat: '<b>9</b>', hr: '<i>1</i>' }]
    };
    w.L.popup().setLatLng(track.points[1]).setContent(w.formatTrackPointTooltip(track, 1)).openOn(w.map);
    const trackPopup = w.document.querySelector('.leaflet-popup-content');
    assertInert(w, trackPopup, 'попап точки трека');
    assert.equal(trackPopup.querySelector('svg'), null);
    assert.equal(trackPopup.querySelector('i'), null);
    assert.ok(trackPopup.textContent.includes(XSS), 'имя видно текстом');
    assert.ok(trackPopup.textContent.includes('<b>9</b>'), 'спутники видны текстом');
  } finally { dom.window.close(); }
});

test('#1 Live: имя, батарея и uniqueId участника с сервера — текст и data-атрибут', needDom, () => {
  const { dom, w } = makeDom('<div id="live-devices-list"></div><span id="live-header-text"></span>');
  try {
    w.eval(sourceBetween('function liveDeviceUniqueId(dev)', 'function liveGetActiveGroupId()'));
    w.eval(sourceBetween('function liveEsc(s)', '\n'));
    w.eval(sourceBetween('function liveShowPopup(dev)', 'function liveUpdateDot('));
    w.eval('var LIVE_STATUS_OPTIONS = [{ code: "none", emoji: "", label: "Нет" }]; var LIVE_OFFLINE_TIMEOUT = 600000; var LIVE_GROUP_SELF_ID = "__self__";');
    w.liveGetActiveGroupId = () => 'all';
    const opened = [];
    w.liveOpenDeviceThread = id => opened.push(id);
    const zoomed = [];
    w.liveZoomTo = (lat, lon) => zoomed.push([lat, lon]);
    const devId = `AB'C");window.__x=3;//`;
    const dev = { name: XSS, battery: '<b>50</b>', uniqueId: devId, lat: 60, lon: 30, lastUpdate: new Date().toISOString(), plan: 'full' };

    w.liveShowPopup(dev);
    const popup = w.document.querySelector('.leaflet-popup-content');
    assertInert(w, popup, 'попап Live');
    assert.ok(popup.textContent.includes(XSS));
    popup.querySelector('button').click();
    assert.deepEqual(opened, [devId.toUpperCase()]);
    assert.equal(w.__x, undefined);

    w.liveRenderSidebar([dev], Date.now());
    const list = w.document.getElementById('live-devices-list');
    assertInert(w, list, 'список Live');
    assert.equal(list.querySelector('b'), null);
    list.querySelector('button').click();
    assert.deepEqual(opened, [devId.toUpperCase(), devId.toUpperCase()]);
    list.querySelector('.live-device').click();
    assert.deepEqual(zoomed, [[60, 30]]);
  } finally { dom.window.close(); }
});

test('#2 пустая широта/долгота отклоняется, точка не сохраняется', () => {
  const context = vm.createContext({});
  vm.runInContext(HELPERS, context);
  for (const empty of ['', '   ', '\t', 'N', ' S ', null, undefined]) {
    assert.ok(Number.isNaN(context.parseCoordinateInput(empty, 'N', 'S')), `«${empty}» — не координата`);
  }
  assert.ok(Math.abs(context.parseCoordinateInput("55°30.000'N", 'N', 'S') - 55.5) < 1e-9);
  assert.ok(Math.abs(context.parseCoordinateInput("37°15.000'W", 'E', 'W') + 37.25) < 1e-9);
  assert.equal(context.parseCoordinateInput('0', 'N', 'S'), 0, 'явный 0 — допустимая координата');
  assert.equal(context.parseCoordinateInput('12,5', 'E', 'W'), 12.5);
  assert.equal(context.parseCoordinateInput('12.5W', 'E', 'W'), -12.5);
  assert.ok(Number.isNaN(context.parseCoordinateInput('абв', 'N', 'S')));

  const calls = [];
  const values = { 'prop-name': 'WP01', 'prop-lat': '', 'prop-lng': "37°30.000'E", 'prop-desc': '', 'prop-color': '#ff0000', 'prop-radius': '30' };
  Object.assign(context, {
    document: { getElementById: id => ({ value: values[id] }), querySelector: () => null },
    showToast: msg => calls.push(['toast', msg]),
    closeModal: id => calls.push(['close', id]),
    refreshWaypoint: () => calls.push(['refresh']),
    syncWaypointReferences: () => {},
    updateWptTable: () => {},
    activeWaypoint: { wpData: { name: 'WP01', lat: 55, lng: 37 }, setLatLng: ll => calls.push(['setLatLng', ll]) }
  });
  vm.runInContext(sourceBetween('function applyWaypointProps()', 'function normalizeRoutePointRadii('), context);
  for (const latText of ['', '   ']) {
    calls.length = 0;
    values['prop-lat'] = latText;
    context.applyWaypointProps();
    assert.deepEqual(calls.map(c => c[0]), ['toast'], 'только сообщение, без сохранения и закрытия окна');
    assert.match(calls[0][1], /Укажите широту и долготу — точка не сохранена/);
    assert.deepEqual(context.activeWaypoint.wpData, { name: 'WP01', lat: 55, lng: 37 });
  }
  calls.length = 0;
  values['prop-lat'] = "55°30.000'N";
  values['prop-lng'] = ' ';
  context.applyWaypointProps();
  assert.deepEqual(calls.map(c => c[0]), ['toast']);
  // корректные значения по-прежнему сохраняются
  calls.length = 0;
  values['prop-lng'] = "37°30.000'E";
  context.applyWaypointProps();
  assert.deepEqual(calls.map(c => c[0]), ['setLatLng', 'refresh', 'close', 'toast']);
  assert.deepEqual([...calls[0][1]], [55.5, 37.5]);
  assert.equal(calls[3][1], 'Точка сохранена');

  // «Открыть на карте» тем же парсером: пустое поле → null
  values['prop-lat'] = '';
  assert.equal(context.getWaypointPropCoordinates(), null);
});

test('#3 «Мои карты»: Вкл/Выкл и 🗑 передают обработчику точный путь с кавычками и пробелами', needDom, async () => {
  const { dom, w } = makeDom('<div id="offline-maps-list"></div><div id="offline-maps-empty"></div>');
  try {
    w.eval(sourceBetween('async function scanOfflineMaps()', 'function updateOfflineMapCardState('));
    w.eval('var offlineMaps = {}; var appDataPath = "/home/u/Документы/Trophy Navigator";');
    const weirdName = `My "best" map 'Карелия' <b>&amp;.mbtiles`;
    const externalPath = `/media/u/Flash Drive/he said "hi" & left/Ladoga 'z13'.mbtiles`;
    w.__TAURI__ = { fs: {
      readDir: async () => [{ name: weirdName }],
      exists: async () => true,
      stat: async () => ({ size: 3 * 1024 * 1024 })
    } };
    w.isOfflineMapFileName = name => /\.mbtiles$/i.test(name);
    w.normalizeOfflineMapPath = p => String(p || '');
    w.getFileNameFromPath = p => String(p).split('/').pop();
    w.getOfflineMapRegistry = () => [{ path: externalPath, name: w.getFileNameFromPath(externalPath) }];
    w.updateOnlineBaseForOfflineState = () => {};
    w.updateOfflineLayersList = () => {};
    const calls = [];
    w.toggleOfflineMap = (key, btn) => calls.push(['toggle', key, btn?.tagName]);
    w.deleteOfflineMap = key => calls.push(['delete', key]);

    await w.scanOfflineMaps();
    const cards = [...w.document.querySelectorAll('.offline-map-card')];
    assert.equal(cards.length, 2);
    const listEl = w.document.getElementById('offline-maps-list');
    assertInert(w, listEl, 'список офлайн-карт');
    assert.equal(listEl.querySelector('b'), null, 'имя файла — текст');
    assert.equal(cards[0].querySelector('.omc-name').textContent, weirdName);

    const internalPath = '/home/u/Документы/Trophy Navigator/maps/' + weirdName;
    for (const [card, path] of [[cards[0], internalPath], [cards[1], externalPath]]) {
      const [toggleBtn, deleteBtn] = card.querySelectorAll('button');
      toggleBtn.click();
      deleteBtn.click();
      assert.deepEqual(calls.splice(0), [['toggle', path, 'BUTTON'], ['delete', path]]);
    }
    // Linux-обход кликов исполняет тот же атрибут через new Function(…).call(el) — путь тот же
    const btn = cards[1].querySelector('button');
    new w.Function('event', btn.getAttribute('onclick')).call(btn, {});
    assert.deepEqual(calls.splice(0), [['toggle', externalPath, 'BUTTON']]);
    // updateOfflineMapCardState по-прежнему находит кнопку Вкл/Выкл по data-offline-key
    assert.equal([...listEl.querySelectorAll('[data-offline-key]')].find(n => n.dataset.offlineKey === externalPath), btn);
  } finally { dom.window.close(); }
});

test('#3 ни один inline-обработчик не собирается из JSON.stringify, данные — через data-атрибуты', () => {
  assert.doesNotMatch(html, /on[a-z]+="[^"]*\$\{JSON\.stringify/);
  assert.doesNotMatch(html, /const keyArg = JSON\.stringify/);
  // строки из данных не вставляются в JS внутри атрибута
  assert.doesNotMatch(html, /on[a-z]+="[^"]*'\$\{(?:group\.id|deviceId|uniqueId|e\.key)\}'/);
  assert.doesNotMatch(html, /\.replace\(\/'\/g, ?"\\\\'"\)/);
});

test('#4 opener: open_path разрешён только для рабочей папки и папки TrophyNav Maps', () => {
  const cap = JSON.parse(read('../src-tauri/capabilities/default.json'));
  const entries = cap.permissions.filter(p => (typeof p === 'string' ? p : p.identifier).startsWith('opener:'));
  assert.ok(entries.includes('opener:default'));
  assert.ok(!entries.includes('opener:allow-open-path'), 'open_path без scope запрещён');
  const openPath = entries.filter(p => typeof p === 'object' && p.identifier === 'opener:allow-open-path');
  assert.equal(openPath.length, 1);
  assert.deepEqual(openPath[0].allow, [
    { path: '$DOCUMENT/TrophyNavigator' },
    { path: '$DOCUMENT/TrophyNavigator/maps/vector' }
  ]);
  assert.equal(openPath[0].deny, undefined);
  for (const { path } of openPath[0].allow) assert.doesNotMatch(path, /\*/, 'без шаблонов');
  // те же папки, что реально открываются
  assert.match(html, /const APP_DIR_NAME = 'TrophyNavigator';/);
  assert.match(html, /root = docDir \+ sep \+ APP_DIR_NAME;/);
  assert.match(html, /if \(opener\?\.openPath\) await opener\.openPath\(appDataPath\);/);
  assert.match(read('../src-tauri/src/vector_maps.rs'), /docs\.join\("TrophyNavigator"\)\.join\("maps"\)\.join\("vector"\)/);
  assert.match(read('../ui/trophynav-maps.js'), /opener\.openPath\(state\.dir\)/);
});
