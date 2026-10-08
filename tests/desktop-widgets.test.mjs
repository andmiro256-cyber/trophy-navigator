// 0.9.30: настраиваемые нижние виджеты (ui/tn-widgets.js) — как на Android. Настройки → «Виджеты»:
// 5 мест с выбором виджета или «пусто», порядок перетаскиванием и стрелками, прозрачность полосы,
// «По умолчанию»; конфиг в localStorage со схемой и миграцией старого «tnd-widgets-hidden».
// Значения каждого виджета считаются на фикстурах. DOM-проверки — jsdom (NODE_PATH=…/node_modules).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const html = read('../ui/index.html');
const widgetsJs = read('../ui/tn-widgets.js');
const require = createRequire(import.meta.url);
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }
const needDom = { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' };
const wait = ms => new Promise(r => setTimeout(r, ms));
// окна закрываются и при упавшей проверке — иначе setInterval полосы держит процесс
const opened = [];
test.after(() => { for (const w of opened) try { w.close(); } catch { /* уже закрыто */ } });

/** Окно с #map, разделом настроек и tn-widgets.js; storage — начальное содержимое localStorage. */
async function boot({ storage = {}, globals = '' } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="map"></div>'
    + '<select id="setting-coord-format"><option value="dm" selected>dm</option><option value="dms">dms</option><option value="dd">dd</option></select>'
    + '<div id="tn-widgets-settings"></div></body>',
  { url: 'https://review.invalid/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  opened.push(w);
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.eval(read('../ui/tn-icons.js'));
  if (globals) w.eval(globals);
  w.eval(widgetsJs);
  await wait(20);
  return w;
}
const cards = w => [...w.document.querySelectorAll('#tn-widgets .tn-widget')];
const values = w => cards(w).map(c => c.querySelector('.tn-widget-value').textContent);
// объекты из окна jsdom — другой realm: сравнивать как JSON
const J = x => JSON.parse(JSON.stringify(x));
const deepEqual = (a, b, msg) => assert.deepEqual(J(a), J(b), msg);
const stored = w => JSON.parse(w.localStorage.getItem('tnd-widgets-config'));

// ─── Фикстуры ───
const T0 = Date.parse('2026-10-08T09:00:00Z');
const iso = s => new Date(T0 + s * 1000).toISOString();
// 4 точки по меридиану через ~1.112 км (0.01° широты), с временем и высотой
const TRACK_PTS = [{ lat: 60, lng: 30 }, { lat: 60.01, lng: 30 }, { lat: 60.02, lng: 30 }, { lat: 60.03, lng: 30 }];
const TRACK_PD = [
  { time: iso(0), ele: 100 },
  { time: iso(300), ele: 110 }, // 1112 м за 5 мин = 13.3 км/ч
  { time: iso(420), ele: 105 }, // за 2 мин = 33.4 км/ч — максимум
  { time: iso(1800), ele: 120.5 }, // за 23 мин
];
const SEG = 1111.95; // м: 0.01° по меридиану при R = 6371 км

test('index.html: раздел «Виджеты» в настройках, хуки выбранной точки, фон полосы гасится прозрачностью', () => {
  assert.match(html, /aria-controls="tab-widgets" class="tab-btn" onclick="switchTab\(this,'tab-widgets'\)"><svg class="tn-ico" aria-hidden="true"><use href="#tn-i-gauge"\/><\/svg><span>Виджеты<\/span>/);
  assert.match(html, /<div class="tab-content" id="tab-widgets"><div id="tn-widgets-settings"><\/div><\/div>/);
  assert.match(html, /function showWptPopup\(marker\) \{\n  activeWaypoint = marker;\n  window\.TnWidgets\?\.selectWp\(marker\);/);
  assert.match(html, /function openQuickRename\(marker\) \{\n  window\.TnWidgets\?\.selectWp\(marker\);/);
  assert.match(html, /#tn-widgets::before \{[^}]*opacity: var\(--widget-fill\);[^}]*background: var\(--widget-bar-bg\)/);
  assert.match(html, /\.tn-widget::before \{[^}]*opacity: var\(--widget-fill\);[^}]*background: var\(--widget-bg\)/);
  assert.match(html, /#tn-widgets\.tn-widgets-clear \.tn-widget-value[^{]*\{\s*text-shadow:/);
  assert.match(read('../ui/theme.css'), /--widget-fill: 1;/);
  // без эмодзи и стрелок-символов в модуле
  assert.doesNotMatch(widgetsJs, /\p{Extended_Pictographic}|[▴▾×]/u);
});

test('расчёты: расстояние, азимут, координаты, длительность', async t => {
  if (!JSDOM) return t.skip('jsdom не найден (NODE_PATH)');
  const w = await boot();
  const U = w.TnWidgets.util;
  assert.ok(Math.abs(U.haversine({ lat: 60, lng: 30 }, { lat: 60.01, lng: 30 }) - SEG) < 0.1);
  assert.equal(Math.round(U.bearing({ lat: 60, lng: 30 }, { lat: 61, lng: 30 })), 0);
  assert.equal(Math.round(U.bearing({ lat: 0, lng: 30 }, { lat: 0, lng: 31 })), 90);
  assert.equal(Math.round(U.bearing({ lat: 60, lng: 30 }, { lat: 59, lng: 30 })), 180);
  assert.equal(U.formatCoord(59.9386, 30.3141, 'dm'), "59°56.316'N  30°18.846'E");
  assert.equal(U.formatCoord(59.9386, -30.3141, 'dms'), '59°56\'19.0"N  30°18\'50.8"W');
  assert.equal(U.formatCoord(59.9386, 30.3141, 'dd'), '59.93860, 30.31410');
  assert.equal(U.fmtDist(850.4), '850 м');
  assert.equal(U.fmtDist(1234), '1.23 км');
  assert.equal(U.fmtDist(12345), '12.3 км');
  assert.equal(U.fmtDuration(83 * 60000), '1 ч 23 мин');
  assert.equal(U.fmtDuration(7 * 60000), '7 мин');
  w.close();
});

test('ревью 2578: максимальная скорость учитывает первую точку трека', async t => {
  if (!JSDOM) return t.skip('jsdom не найден (NODE_PATH)');
  const w = await boot();
  const { trackStats } = w.TnWidgets.util;
  const pts = [{ lat: 60, lng: 30 }, { lat: 60.001, lng: 30 }, { lat: 60.002, lng: 30 }];
  const pd = [0, 60, 120].map((s, i) => ({ time: new Date(Date.UTC(2026, 9, 8, 10, 0, s)).toISOString(), speed: [20, 1, 1][i] }));
  assert.equal(Math.round(trackStats(pts, pd).maxKmh), 72, '20 м/с в первой точке = 72 км/ч');
});

test('солнце: восход и закат для Петербурга, Москвы и полярной ночи совпадают с NOAA ±2 мин', async t => {
  if (!JSDOM) return t.skip('jsdom не найден (NODE_PATH)');
  const w = await boot();
  const { sunTimes, nextSunEvent } = w.TnWidgets.util;
  // эталон — astral 3 (алгоритм NOAA), UTC
  const ref = [
    [59.9386, 30.3141, '2026-10-08T10:00:00Z', '2026-10-08T04:20:55Z', '2026-10-08T15:10:29Z'],
    [59.9386, 30.3141, '2026-06-21T10:00:00Z', '2026-06-21T00:35:47Z', '2026-06-21T19:25:18Z'],
    [55.7558, 37.6173, '2026-03-20T10:00:00Z', '2026-03-20T03:32:32Z', '2026-03-20T15:42:38Z'],
  ];
  for (const [lat, lng, day, rise, set] of ref) {
    const s = sunTimes(new Date(day), lat, lng);
    assert.ok(Math.abs(s.rise - Date.parse(rise)) < 120000, `восход ${day}: ${new Date(s.rise).toISOString()}`);
    assert.ok(Math.abs(s.set - Date.parse(set)) < 120000, `закат ${day}: ${new Date(s.set).toISOString()}`);
  }
  // после заката «до рассвета» — завтрашний восход, «до заката» — завтрашний закат
  const evening = Date.parse('2026-10-08T17:00:00Z');
  assert.ok(nextSunEvent('rise', evening, 59.9386, 30.3141) > evening);
  assert.ok(Math.abs(nextSunEvent('set', evening, 59.9386, 30.3141) - Date.parse('2026-10-09T15:07:50Z')) < 180000);
  // Мурманск, конец декабря — полярная ночь
  assert.equal(sunTimes(new Date('2026-12-21T10:00:00Z'), 68.97, 33.08).polar, 'night');
  assert.equal(sunTimes(new Date('2026-06-21T10:00:00Z'), 68.97, 33.08).polar, 'day');
  w.close();
});

test('каждый виджет считает значение на фикстурах', async t => {
  if (!JSDOM) return t.skip('jsdom не найден (NODE_PATH)');
  const w = await boot();
  const W = w.TnWidgets;
  const now = new Date('2026-10-08T10:15:00Z'); // 13:15 в Москве; закат в Петербурге 15:10 UTC
  const base = {
    now, zoom: 12.6, center: { lat: 59.9386, lng: 30.3141 }, cursor: { lat: 60.01, lng: 30 }, coordFormat: 'dm',
    track: { name: 'Утро', points: TRACK_PTS, pointsData: TRACK_PD },
    route: { name: 'М1', points: [{ lat: 60, lng: 30 }, { lat: 60.01, lng: 30 }, { lat: 60.01, lng: 30.02 }] },
    wp: { lat: 60, lng: 30, name: 'WP7' }, relief: false, elev: null,
  };
  const c = (id, extra = {}) => W.compute(id, { ...base, ...extra });
  deepEqual(c('zoom'), { value: 'Z13', caption: 'масштаб' });
  assert.equal(c('time').value, new Date(now).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
  assert.match(c('date').value, /08\.10/);
  assert.equal(c('coords').value, "60°0.600'N  30°0.000'E");
  assert.equal(c('coords', { coordFormat: 'dd' }).value, '60.01000, 30.00000');
  // трек с временем и высотой
  deepEqual(c('trackLen'), { value: (3 * SEG / 1000).toFixed(1), caption: 'км · Утро' });
  assert.equal(c('trackTime').value, '30 мин');
  assert.equal(c('trackAvg').value, ((3 * SEG / 1000) / 0.5).toFixed(1));
  assert.equal(c('trackMax').value, (SEG / 120 * 3.6).toFixed(1));
  assert.equal(c('trackUp').value, '26'); // +10, затем +15.5 (сброс −5 между ними)
  assert.equal(c('trackDown').value, '5');
  // скорость из GPX <speed> важнее вычисленной
  const withSpeed = TRACK_PD.map((p, i) => (i === 1 ? { ...p, speed: 20 } : p));
  assert.equal(c('trackMax', { track: { name: 'x', points: TRACK_PTS, pointsData: withSpeed } }).value, '72.0');
  // трек без времени и высоты
  const bare = { name: '', points: TRACK_PTS, pointsData: [] };
  deepEqual(c('trackLen', { track: bare }), { value: (3 * SEG / 1000).toFixed(1), caption: 'км трек' });
  for (const id of ['trackTime', 'trackAvg', 'trackMax', 'trackUp', 'trackDown']) assert.equal(c(id, { track: bare }).value, '—', id);
  // нет трека / маршрута
  for (const id of ['trackLen', 'trackTime', 'routeLen', 'routeWp']) assert.equal(c(id, { track: null, route: null }).value, '—', id);
  // маршрут
  const rLen = (SEG + W.util.haversine({ lat: 60.01, lng: 30 }, { lat: 60.01, lng: 30.02 })) / 1000;
  deepEqual(c('routeLen'), { value: rLen.toFixed(1), caption: 'км · 3 WP' });
  assert.equal(c('routeWp').value, '3');
  // WP → курсор: строго на север 1.11 км; на восток — 90°
  deepEqual(c('wpDist'), { value: '1.11 км · 0°', caption: 'от WP7 до курсора' });
  assert.equal(c('wpDist', { cursor: { lat: 60, lng: 30.005 } }).value, '278 м · 90°');
  deepEqual(c('wpDist', { wp: null }), { value: '—', caption: 'до WP: выберите точку' });
  // высота под курсором
  deepEqual(c('elev'), { value: '—', caption: 'высота: нет рельефа' });
  deepEqual(c('elev', { relief: true, elev: { value: 152.4 } }), { value: '152', caption: 'м высота' });
  assert.equal(c('elev', { relief: true, elev: { pending: true, value: null } }).value, '—');
  // по умолчанию первое место: с рельефом — высота, без — расстояние/азимут до WP
  deepEqual(c('elevAuto', { relief: true, elev: { value: 88 } }), { value: '88', caption: 'м высота' });
  deepEqual(c('elevAuto'), { value: '1.11 км · 0°', caption: 'от WP7 до курсора' });
  // солнце: до заката 15:10:29 UTC от 10:15 UTC — 4 ч 55 мин
  const sunset = c('sunset');
  assert.match(sunset.value, /^4 ч 5[56] мин$/); // 4:55:29
  assert.match(sunset.caption, /^до заката \d\d:\d\d$/);
  const sunrise = c('sunrise'); // завтра 04:22 UTC
  assert.match(sunrise.value, /^18 ч \d+ мин$/);
  assert.equal(c('sunset', { center: { lat: 68.97, lng: 33.08 }, now: new Date('2026-12-21T10:00:00Z') }).caption, 'полярная ночь');
  w.close();
});

test('высота: terrarium-пиксель, тайл, кэш и троттлинг запросов к tnmap://', async t => {
  if (!JSDOM) return t.skip('jsdom не найден (NODE_PATH)');
  const w = await boot({ globals: `window.TrophyNavMaps = { activeId: () => 'lo', localEntry: () => ({ id: 'lo', dem: { maxZoom: 12, modified: 7 } }) };` });
  const { terrariumElev, tileXY, elevFromImage } = w.TnWidgets.util;
  assert.equal(terrariumElev(128, 0, 0), 0);
  assert.equal(terrariumElev(128, 152, 128), 152.5);
  const tl = tileXY(60, 30, 12);
  deepEqual([tl.x, tl.y], [2389, 1189]);
  const img = { width: 2, height: 2, data: new Uint8ClampedArray([128, 100, 0, 255, 128, 101, 0, 255, 128, 102, 0, 255, 0, 0, 0, 0]) };
  assert.equal(elevFromImage(img, 0.1, 0.1), 100);
  assert.equal(elevFromImage(img, 0.9, 0.1), 101);
  assert.equal(elevFromImage(img, 0.1, 0.9), 102);
  assert.equal(elevFromImage(img, 0.9, 0.9), null); // прозрачный — нет данных

  const E = w.TnWidgets._elev;
  const urls = [];
  E.io.base = () => 'tnmap://localhost';
  E.io.fetch = async url => { urls.push(url); return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(1) }; };
  E.io.decode = async () => ({ width: 1, height: 1, data: new Uint8ClampedArray([128, 152, 0, 255]) });
  const p = { lat: 60.0001, lng: 30.0001 };
  deepEqual(E.at(p), { pending: true, value: null });
  // 30 движений мыши подряд в одном тайле → один запрос
  for (let i = 0; i < 30; i++) E.request({ lat: 60.0001 + i * 1e-6, lng: 30.0001 });
  await wait(220);
  assert.equal(urls.length, 1);
  assert.equal(urls[0], `tnmap://localhost/extra/lo.dem/12/${tl.x}/${tl.y}.png?v=7`);
  deepEqual(E.at(p), { value: 152 });
  // 204 — нет тайла рельефа → «—», без ошибок
  E.io.fetch = async url => { urls.push(url); return { ok: true, status: 204 }; };
  const far = { lat: 61.5, lng: 31.5 };
  E.request(far);
  await wait(400); // мог ещё идти интервал троттлинга от прошлых запросов
  assert.equal(urls.length, 2); // хвостовой запрос в том же тайле взят из кэша
  deepEqual(E.at(far), { value: null });
  // без активной карты с рельефом — нет рельефа и нет запросов
  w.TrophyNavMaps.localEntry = () => ({ id: 'lo' });
  assert.equal(E.at(p), null);
  const n = urls.length;
  await E.load({ lat: 62, lng: 32 });
  assert.equal(urls.length, n);
  w.close();
});

test('конфиг: по умолчанию, сохранение и восстановление после перезапуска, битый JSON, неизвестные виджеты', needDom, async () => {
  let w = await boot();
  deepEqual(w.TnWidgets.getConfig(), { v: 1, slots: ['elevAuto', 'zoom', 'trackLen', 'routeLen', 'time'], opacity: 0, hidden: false });
  deepEqual(cards(w).map(c => c.dataset.widget), ['elevAuto', 'zoom', 'trackLen', 'routeLen', 'time']);
  deepEqual(cards(w).map(c => c.querySelector('.tn-widget-caption').textContent).slice(1),
    ['масштаб', 'км трек', 'км маршрут', 'время']);
  w.TnWidgets.setConfig({ slots: ['sunset', '', 'trackMax', 'date', 'coords'], opacity: 35, hidden: false });
  const saved = w.localStorage.getItem('tnd-widgets-config');
  deepEqual(JSON.parse(saved), { v: 1, slots: ['sunset', '', 'trackMax', 'date', 'coords'], opacity: 35, hidden: false });
  w.close();
  // «перезапуск» — новое окно с тем же localStorage
  w = await boot({ storage: { 'tnd-widgets-config': saved } });
  deepEqual(w.TnWidgets.getConfig().slots, ['sunset', '', 'trackMax', 'date', 'coords']);
  assert.equal(w.TnWidgets.getConfig().opacity, 35);
  deepEqual(cards(w).map(c => c.dataset.widget), ['sunset', 'trackMax', 'date', 'coords']);
  w.close();
  // битый JSON и мусор → по умолчанию / пусто, прозрачность в пределах 0..100
  w = await boot({ storage: { 'tnd-widgets-config': '{oops' } });
  deepEqual(w.TnWidgets.getConfig().slots, ['elevAuto', 'zoom', 'trackLen', 'routeLen', 'time']);
  w.close();
  w = await boot({ storage: { 'tnd-widgets-config': JSON.stringify({ v: 1, slots: ['zoom', 'gps-speed', 7], opacity: 250 }) } });
  deepEqual(w.TnWidgets.getConfig(), { v: 1, slots: ['zoom', '', '', '', ''], opacity: 100, hidden: false });
  w.close();
});

test('конфиг: миграция старого tnd-widgets-hidden и запись его обратно для отката', needDom, async () => {
  let w = await boot({ storage: { 'tnd-widgets-hidden': '1' } });
  assert.equal(w.TnWidgets.getConfig().hidden, true);
  deepEqual(w.TnWidgets.getConfig().slots, ['elevAuto', 'zoom', 'trackLen', 'routeLen', 'time']);
  assert.equal(w.document.getElementById('tn-widgets').hidden, true);
  assert.equal(w.document.body.classList.contains('tn-widgets-on'), false);
  assert.equal(w.document.getElementById('tnw-shown').checked, false);
  w.document.getElementById('tn-widgets-toggle').click();
  assert.equal(w.document.getElementById('tn-widgets').hidden, false);
  assert.equal(stored(w).hidden, false);
  assert.equal(w.localStorage.getItem('tnd-widgets-hidden'), '0');
  w.close();
  w = await boot({ storage: { 'tnd-widgets-hidden': '0' } });
  assert.equal(w.TnWidgets.getConfig().hidden, false);
  w.close();
  // новый конфиг главнее старого ключа
  w = await boot({ storage: { 'tnd-widgets-hidden': '1', 'tnd-widgets-config': JSON.stringify({ v: 1, slots: ['zoom'], hidden: false }) } });
  assert.equal(w.TnWidgets.getConfig().hidden, false);
  w.close();
});

test('раздел «Виджеты»: выбор, «пусто», стрелки, перетаскивание, прозрачность, «По умолчанию»', needDom, async () => {
  const w = await boot({ globals: 'var map = { getZoom: () => 9.4, getCenter: () => ({ lat: 59.9, lng: 30.3 }), on() {} };' });
  const d = w.document;
  const host = d.getElementById('tn-widgets-settings');
  const selects = () => [...host.querySelectorAll('select[data-tnw-slot]')];
  assert.equal(selects().length, 5);
  deepEqual(selects().map(s => s.value), ['elevAuto', 'zoom', 'trackLen', 'routeLen', 'time']);
  // в выпадающем списке весь каталог + «Пусто»
  assert.equal(selects()[0].querySelectorAll('option').length, Object.keys(w.TnWidgets.CATALOG).length + 1);
  assert.equal(selects()[0].querySelector('option').textContent, 'Пусто');
  assert.equal(host.querySelectorAll('.setting-row.tnw-slot .tnw-handle svg.tn-ico').length, 5);
  // выбор виджета
  const change = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  change(selects()[2], 'trackUp');
  assert.equal(stored(w).slots[2], 'trackUp');
  assert.equal(cards(w)[2].dataset.widget, 'trackUp');
  // пустое место: карточка исчезает, остальные на месте, значения считаются
  change(selects()[1], '');
  deepEqual(cards(w).map(c => c.dataset.widget), ['elevAuto', 'trackUp', 'routeLen', 'time']);
  w.TnWidgets.refresh();
  assert.equal(values(w).length, 4);
  assert.ok(values(w).every(v => v.length > 0));
  // стрелка «правее» у места 1 → виджет переезжает на место 2
  host.querySelector('[data-tnw-move="0:1"]').click();
  deepEqual(stored(w).slots, ['', 'elevAuto', 'trackUp', 'routeLen', 'time']);
  assert.equal(d.activeElement?.dataset.tnwFocus, 'down1'); // фокус едет за виджетом
  assert.equal(host.querySelector('[data-tnw-move="0:-1"]').disabled, true);
  assert.equal(host.querySelector('[data-tnw-move="4:1"]').disabled, true);
  host.querySelector('[data-tnw-move="4:-1"]').click();
  deepEqual(stored(w).slots, ['', 'elevAuto', 'trackUp', 'time', 'routeLen']);
  // перетаскивание за ручку: место 5 → место 1
  const rows = [...host.querySelectorAll('.tnw-slot')];
  d.elementFromPoint = () => rows[0].querySelector('.setting-label');
  const P = (type, el) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5 }));
  // jsdom без PointerEvent — MouseEvent с pointerId = undefined у всех событий одинаков
  P('pointerdown', rows[4].querySelector('.tnw-handle'));
  assert.ok(rows[4].classList.contains('tnw-dragging'));
  P('pointermove', rows[4]);
  assert.ok(rows[0].classList.contains('tnw-drop'));
  P('pointerup', rows[4]);
  deepEqual(stored(w).slots, ['routeLen', '', 'elevAuto', 'trackUp', 'time']);
  deepEqual(cards(w).map(c => c.dataset.widget), ['routeLen', 'elevAuto', 'trackUp', 'time']);
  // прозрачность: живой предпросмотр на input, сохранение, фон полосы гаснет, текст с обводкой
  const range = host.querySelector('[data-tnw="opacity"]');
  range.value = '50';
  range.dispatchEvent(new w.Event('input', { bubbles: true }));
  const bar = d.getElementById('tn-widgets');
  assert.equal(bar.style.getPropertyValue('--widget-fill'), '0.5');
  assert.ok(bar.classList.contains('tn-widgets-clear'));
  assert.equal(host.querySelector('[data-tnw="opacity-val"]').textContent, '50%');
  assert.equal(stored(w).opacity, 50);
  range.value = '0';
  range.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(bar.style.getPropertyValue('--widget-fill'), '1');
  assert.equal(bar.classList.contains('tn-widgets-clear'), false);
  // скрыть полосу из настроек
  const shown = host.querySelector('#tnw-shown');
  shown.checked = false;
  shown.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(bar.hidden, true);
  // все места пустые → полосы нет, карта не поджимается
  w.TnWidgets.setConfig({ slots: ['', '', '', '', ''], opacity: 0, hidden: false });
  assert.equal(bar.hidden, true);
  assert.equal(d.body.classList.contains('tn-widgets-on'), false);
  // «По умолчанию»
  host.querySelector('[data-tnw="reset"]').click();
  deepEqual(stored(w), { v: 1, slots: ['elevAuto', 'zoom', 'trackLen', 'routeLen', 'time'], opacity: 0, hidden: false });
  deepEqual(selects().map(s => s.value), ['elevAuto', 'zoom', 'trackLen', 'routeLen', 'time']);
  assert.equal(bar.hidden, false);
  w.TnWidgets.refresh();
  assert.equal(values(w)[1], 'Z9');
  w.close();
});

test('полоса берёт данные приложения: выбранный трек и маршрут, выбранная WP, удалённая WP забывается', needDom, async () => {
  const w = await boot({ globals: `
    var map = { getZoom: () => 14, getCenter: () => ({ lat: 60, lng: 30 }), on() {} };
    var tracks = [{ id: 1, name: 'Т1', points: ${JSON.stringify(TRACK_PTS)}, pointsData: ${JSON.stringify(TRACK_PD)} }];
    var selectedTrackId = 1, currentTrackDraw = null, currentTrackEdit = null;
    var routes = [{ id: 5, name: 'R', points: [{ lat: 60, lng: 30 }, { lat: 60.01, lng: 30 }] }];
    var selectedRouteId = 5, currentRouteDraw = null;
    var wpMarker = { wpData: { name: 'КП3' }, getLatLng: () => ({ lat: 60, lng: 30 }) };
    var waypoints = [wpMarker];` }); // var: let из отдельного eval не виден другому eval (в браузере скрипты делят let)
  w.TnWidgets.setConfig({ slots: ['wpDist', 'zoom', 'trackLen', 'routeLen', 'trackUp'], opacity: 0 });
  w.TnWidgets._setCursor({ lat: 60.01, lng: 30 });
  w.TnWidgets.refresh();
  deepEqual(values(w), ['—', 'Z14', (3 * SEG / 1000).toFixed(1), (SEG / 1000).toFixed(1), '26']);
  w.eval('TnWidgets.selectWp(wpMarker)');
  w.TnWidgets.refresh();
  assert.equal(values(w)[0], '1.11 км · 0°');
  assert.equal(cards(w)[0].querySelector('.tn-widget-caption').textContent, 'от КП3 до курсора');
  w.eval('waypoints = []');
  w.TnWidgets.refresh();
  assert.equal(values(w)[0], '—');
  w.eval('selectedTrackId = null; selectedRouteId = null');
  w.TnWidgets.refresh();
  deepEqual(values(w).slice(2), ['—', '—', '—']);
  w.close();
});

test('ревью 2648: смена состава виджетов — ширины карточек пересчитываются под новый набор', needDom, async () => {
  // jsdom не раскладывает: ширина текста = 8 px на символ, полоса 1000 px
  const w = await boot({ globals: `
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return this.id === 'tn-widgets' ? 1000 : 0; } });
    document.createRange = () => { let el; return { selectNodeContents(n) { el = n; }, getBoundingClientRect: () => ({ width: (el.textContent || '').length * 8 }) }; };` });
  w.TnWidgets.setConfig({ slots: ['date', 'time', '', '', ''], opacity: 0, hidden: false });
  await wait(60);
  const before = cards(w).map(c => c.style.minWidth);
  assert.ok(before.every(Boolean), 'после первой подгонки у всех карточек есть ширина');
  w.TnWidgets.setConfig({ slots: ['coords', 'zoom', 'trackLen', '', ''], opacity: 0, hidden: false });
  await wait(60);
  const after = cards(w);
  deepEqual(after.map(c => c.dataset.widget), ['coords', 'zoom', 'trackLen']);
  after.forEach(c => assert.equal(c.style.minWidth,
    `${Math.ceil(Math.ceil(c.querySelector('.tn-widget-value').textContent.length * 8) + 1)}px`, c.dataset.widget));
  w.close();
});
