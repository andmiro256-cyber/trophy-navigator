// 0.9.32: новые виджеты (маршрут по дорогам OSRM, уклон, 1:N, линейка от центра, закат/рассвет часами,
// световой день, Live), 8 мест вместо 5 и правый клик по полосе («Заменить на…», «Убрать», «Добавить»).
// DOM-проверки — jsdom (NODE_PATH=…/node_modules), как в desktop-widgets.test.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const widgetsJs = read('../ui/tn-widgets.js');
const require = createRequire(import.meta.url);
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }
const needDom = { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' };
const wait = ms => new Promise(r => setTimeout(r, ms));
const opened = [];
test.after(() => { for (const w of opened) try { w.close(); } catch { /* уже закрыто */ } });

async function boot({ storage = {}, globals = '' } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="map"></div><div id="tn-widgets-settings"></div></body>',
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
const J = x => JSON.parse(JSON.stringify(x));
const deepEqual = (a, b, msg) => assert.deepEqual(J(a), J(b), msg);
const cards = w => [...w.document.querySelectorAll('#tn-widgets .tn-widget')];
const stored = w => JSON.parse(w.localStorage.getItem('tnd-widgets-config'));
const SEG = 1111.95; // м: 0.01° по меридиану
const hm = ms => new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** Тайл terrarium w×h: высота ele(x, y) в метрах. */
function terrarium(w, h, ele) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = ele(x, y) + 32768, i = (y * w + x) * 4;
    data[i] = Math.floor(v / 256); data[i + 1] = Math.floor(v) % 256; data[i + 2] = Math.round((v % 1) * 256); data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}

test('расчёты 0.9.32: положение относительно маршрута, точки вдоль линии, масштаб 1:N, уклон', needDom, async () => {
  const w = await boot();
  const U = w.TnWidgets.util;
  // маршрут строго на север 2 × 0.01°, курсор на середине и в 0.001° к востоку (55.6 м на 60° с. ш.)
  const coords = [[60, 30], [60.01, 30], [60.02, 30]];
  const pr = U.routeProgress(coords, { lat: 60.01, lng: 30.001 });
  assert.ok(Math.abs(pr.totalM - 2 * SEG) < 0.5, `total ${pr.totalM}`);
  assert.ok(Math.abs(pr.alongM - SEG) < 1, `along ${pr.alongM}`);
  assert.ok(Math.abs(pr.offM - 55.6) < 0.5, `off ${pr.offM}`);
  // до начала / после конца — проекция на концы
  assert.equal(Math.round(U.routeProgress(coords, { lat: 59.99, lng: 30 }).alongM), 0);
  assert.ok(Math.abs(U.routeProgress(coords, { lat: 60.03, lng: 30 }).alongM - 2 * SEG) < 0.5);
  assert.equal(U.routeProgress([[60, 30]], { lat: 60, lng: 30 }), null);
  // точки через 500 м: 0, 500 … 2000, конец 2223.9
  const pts = U.pointsAlong(coords, 500);
  assert.equal(pts.length, 6);
  assert.ok(Math.abs(U.haversine(pts[0], pts[1]) - 500) < 0.5);
  assert.ok(Math.abs(U.haversine(pts[3], pts[4]) - 500) < 0.5, 'шаг сохраняется через вершину');
  deepEqual(pts[5], { lat: 60.02, lng: 30 });
  // масштаб: Z14 на экваторе — 9.55 м/px × 96 dpi = 1:36 112
  assert.ok(Math.abs(U.scaleDenominator(14, 0) - 36112) < 5);
  assert.equal(U.fmtScale(U.scaleDenominator(14, 0)), '1:36 000');
  assert.equal(U.fmtScale(U.scaleDenominator(17, 60)), '1:2 300');
  assert.equal(U.fmtScale(4_123_456), '1:4 100 000');
  assert.equal(U.fmtScale(NaN), '—');
  // уклон: на зуме z размер пикселя cell; подъём 0.5·cell м на пиксель по x → atan(0.5) = 26.6°
  const z = 12, lat = 60;
  const cell = 2 * Math.PI * 6378137 * Math.cos(lat * Math.PI / 180) / 2 ** z / 8;
  const img = terrarium(8, 8, x => 100 + x * cell * 0.5);
  assert.ok(Math.abs(U.slopeFromImage(img, 0.5, 0.5, z, lat) - 26.57) < 0.2);
  assert.equal(Math.round(U.slopeFromImage(terrarium(8, 8, () => 120), 0.3, 0.7, z, lat)), 0, 'ровно');
  // край тайла — окно 3x3 сдвигается внутрь, прозрачный пиксель рядом — нет данных
  assert.ok(Number.isFinite(U.slopeFromImage(img, 0, 0, z, lat)));
  const holed = terrarium(8, 8, () => 100); holed.data[(4 * 8 + 4) * 4 + 3] = 0;
  assert.equal(U.slopeFromImage(holed, 0.5, 0.5, z, lat), null);
});

test('новые виджеты на фикстурах', needDom, async () => {
  const w = await boot();
  const W = w.TnWidgets;
  const now = new Date('2026-10-08T10:15:00Z');
  const osrm = { id: 3, name: 'А — Б', coords: [[60, 30], [60.01, 30], [60.02, 30]], distance: 2224, duration: 300 };
  const base = { now, zoom: 14, center: { lat: 59.9386, lng: 30.3141 }, cursor: { lat: 60.01, lng: 30.001 },
    relief: false, elev: null, osrm, live: null };
  const c = (id, extra = {}) => W.compute(id, { ...base, ...extra });
  // по дорогам
  deepEqual(c('osrmLen'), { value: '2.2', caption: 'км по дорогам' });
  assert.equal(c('osrmTime').value, '5 мин');
  assert.equal(c('osrmEta').value, hm(+now + 300000));
  deepEqual(c('osrmLeft'), { value: '1.11 км · 3 мин', caption: 'до финиша по дороге' }); // половина: 2.5 мин → 3
  assert.equal(c('osrmLeft', { cursor: null }).caption, 'до финиша: наведите курсор');
  assert.equal(c('osrmOff').value, '56 м');
  for (const id of ['osrmLen', 'osrmTime', 'osrmEta', 'osrmLeft', 'osrmOff', 'osrmUp', 'osrmDown']) {
    deepEqual(c(id, { osrm: null }), { value: '—', caption: 'нет маршрута по дорогам' }, id);
  }
  assert.equal(c('osrmUp').caption, 'маршрут: нет рельефа');
  deepEqual(c('osrmUp', { osrmElev: { pending: true } }), { value: '…', caption: 'м набор (маршрут)' });
  deepEqual(c('osrmUp', { osrmElev: { up: 41.6, down: 12 } }), { value: '42', caption: 'м набор (маршрут)' });
  deepEqual(c('osrmDown', { osrmElev: { up: 41.6, down: 12 } }), { value: '12', caption: 'м сброс (маршрут)' });
  // курсор и карта
  deepEqual(c('slope'), { value: '—', caption: 'уклон: нет рельефа' });
  deepEqual(c('slope', { relief: true, elev: { value: 100, slope: 7.4 } }), { value: '7', caption: '° уклон' });
  assert.equal(c('slope', { relief: true, elev: { pending: true, value: null } }).value, '—');
  assert.equal(c('scale').value, W.util.fmtScale(W.util.scaleDenominator(14, 59.9386)));
  assert.match(c('scale').value, /^1:18 000$/);
  const cd = c('centerDist', { center: { lat: 60, lng: 30 }, cursor: { lat: 60.01, lng: 30 } });
  deepEqual(cd, { value: '1.11 км · 0°', caption: 'от центра' });
  assert.equal(c('centerDist', { cursor: null }).value, '—');
  // солнце часами и световой день (Петербург, 8 октября: 04:20:55–15:10:29 UTC)
  deepEqual(c('sunsetAt'), { value: hm(Date.parse('2026-10-08T15:10:29Z')), caption: 'закат' });
  deepEqual(c('sunriseAt'), { value: hm(Date.parse('2026-10-08T04:20:55Z')), caption: 'рассвет' });
  assert.match(c('dayLen').value, /^10 ч (49|50) мин$/);
  const polar = { center: { lat: 68.97, lng: 33.08 } };
  deepEqual(c('sunsetAt', { ...polar, now: new Date('2026-12-21T10:00:00Z') }), { value: '—', caption: 'полярная ночь' });
  deepEqual(c('dayLen', { ...polar, now: new Date('2026-06-21T10:00:00Z') }), { value: '24 ч', caption: 'полярный день' });
  // Live: двое в сети из трёх, ближайший к курсору, свежий сигнал 3 мин назад
  const live = [
    { name: 'Борис', lat: 60.02, lng: 30, t: +now - 3 * 60000, online: true },
    { name: 'Анна', lat: 60.012, lng: 30.001, t: +now - 9 * 60000, online: true },
    { name: 'Вера', lat: NaN, lng: NaN, t: null, online: false },
  ];
  deepEqual(c('liveOnline', { live }), { value: '2 / 3', caption: 'в сети' });
  deepEqual(c('liveNear', { live }), { value: '222 м', caption: 'от курсора: Анна' });
  assert.equal(c('liveNear', { live, cursor: null, center: { lat: 60.03, lng: 30 } }).caption, 'от центра: Борис');
  deepEqual(c('liveLast', { live }), { value: '3 мин', caption: 'последний сигнал' });
  deepEqual(c('liveLast', { live: [{ ...live[0], t: +now - 20000 }] }), { value: 'сейчас', caption: 'последний сигнал' });
  for (const id of ['liveOnline', 'liveNear', 'liveLast']) deepEqual(c(id), { value: '—', caption: 'Live выключен' }, id);
});

test('gather: активный видимый маршрут по дорогам и участники Live без своих устройств', needDom, async () => {
  const w = await boot({ globals: `
    var map = { getZoom: () => 12, getCenter: () => ({ lat: 60, lng: 30 }), on() {} };
    var osrmState = { activeId: 2, items: [
      { id: 1, name: 'x', coords: [[1, 1], [2, 2]], distance: 10, duration: 1, visible: true },
      { id: 2, name: 'А — Б', coords: [[60, 30], [60.01, 30]], distance: 1112, duration: 90, visible: true } ] };
    var liveState = { timer: 1, devices: [
      { id: 'ME', name: 'Я', lat: 60, lon: 30, lastUpdate: new Date().toISOString() },
      { id: 'P1', name: 'Пётр', lat: 60.1, lon: 30.1, lastUpdate: new Date().toISOString() } ] };
    function liveGetFilteredDevices(d) { return d; }
    function liveDeviceUniqueId(d) { return d.id; }
    function liveIsMyDeviceId(id) { return id === 'ME'; }
    function liveLastUpdateMs(d) { return Date.parse(d.lastUpdate); }
    function liveIsOnline() { return true; }` });
  const g = w.TnWidgets.gather();
  deepEqual(g.osrm, { id: 2, name: 'А — Б', coords: [[60, 30], [60.01, 30]], distance: 1112, duration: 90 });
  assert.equal(g.live.length, 1);
  assert.equal(g.live[0].name, 'Пётр');
  assert.equal(g.live[0].lng, 30.1);
  // скрытый маршрут не берётся; Live не запущен — null
  w.eval('osrmState.items[1].visible = false; liveState.timer = null; liveState.devices = [];');
  const g2 = w.TnWidgets.gather();
  assert.equal(g2.osrm, null);
  assert.equal(g2.live, null);
});

test('набор/сброс по маршруту: рельеф вдоль линии, один расчёт на маршрут, смена маршрута', needDom, async () => {
  const w = await boot({ globals: `
    window.TrophyNavMaps = { activeId: () => 'ryazan', localEntry: () => ({ id: 'ryazan', dem: { maxZoom: 12, modified: 5 } }) };` });
  const W = w.TnWidgets;
  const urls = [];
  W._elev.io.base = () => 'tnmap://localhost';
  // номер тайла по x едет в «байтах» ответа: высота растёт на восток непрерывно через стыки тайлов
  W._elev.io.fetch = async url => {
    urls.push(url);
    const tx = Number(url.split('/').at(-2));
    return { ok: true, status: 200, arrayBuffer: async () => new Float64Array([tx]).buffer };
  };
  W._elev.io.decode = async buf => { const tx = new Float64Array(buf)[0] - 1250; return terrarium(256, 256, x => 100 + 0.5 * (tx * 256 + x)); };
  const route = { id: 7, coords: [[54.6, 39.70], [54.6, 39.74]], distance: 2580, duration: 200 };
  deepEqual(W._routeElev.get(route), { pending: true });
  await wait(50);
  const r = W._routeElev.get(route);
  assert.ok(r.up > 20 && r.down === 0, JSON.stringify(r)); // 2.6 км на Z11 ≈ 58 px × 0.5 м
  assert.ok(urls.every(u => /^tnmap:\/\/localhost\/extra\/ryazan\.dem\/11\/\d+\/\d+\.png\?v=5$/.test(u)), urls.join());
  const n = urls.length;
  W._routeElev.get(route); await wait(20);
  assert.equal(urls.length, n, 'тот же маршрут — без новых запросов');
  // обратный маршрут: тот же рельеф — сброс
  const back = { ...route, id: 8, coords: [[54.6, 39.74], [54.6, 39.70]] };
  W._routeElev.get(back); await wait(50);
  const rb = W._routeElev.get(back);
  assert.ok(rb.down > 20 && rb.up === 0, JSON.stringify(rb));
  // без рельефа активной карты — null
  w.eval('window.TrophyNavMaps.localEntry = () => ({ id: "ryazan" });');
  assert.equal(W._routeElev.get({ ...route, id: 9 }), null);
});

test('8 мест: конфиг из 5 дополняется пустыми, карточка знает своё место', needDom, async () => {
  const w = await boot({ storage: { 'tnd-widgets-config': JSON.stringify({ v: 1, slots: ['zoom', '', 'time', 'date', 'coords'], opacity: 0, hidden: false }) } });
  deepEqual(w.TnWidgets.getConfig().slots, ['zoom', '', 'time', 'date', 'coords', '', '', '']);
  deepEqual(cards(w).map(c => [c.dataset.widget, c.dataset.slot]), [['zoom', '0'], ['time', '2'], ['date', '3'], ['coords', '4']]);
  w.TnWidgets.setConfig({ slots: ['zoom', 'time', 'date', 'coords', 'sunset', 'sunsetAt', 'dayLen', 'scale'], opacity: 0, hidden: false });
  assert.equal(cards(w).length, 8);
  assert.equal(w.document.querySelectorAll('select[data-tnw-slot]').length, 8);
  // откат на 0.9.31 читает первые 5 мест того же ключа — формат прежний
  deepEqual(Object.keys(stored(w)), ['v', 'slots', 'opacity', 'hidden']);
});

test('правый клик по полосе: заменить, убрать, добавить в свободное место, Escape', needDom, async () => {
  const w = await boot();
  const d = w.document;
  const ctx = (el, x = 100, y = 500) => {
    const ev = new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y });
    el.dispatchEvent(ev);
    return ev;
  };
  const menu = () => d.querySelector('.tnw-menu');
  // замена: место 3 (trackLen) → «Уклон под курсором»
  const ev = ctx(cards(w)[2]);
  assert.equal(ev.defaultPrevented, true, 'меню WebView не всплывает');
  assert.ok(menu());
  assert.match(menu().textContent, /Трек — длина/);
  assert.ok(menu().querySelector('[data-tnw-pick="trackLen"]').classList.contains('current'));
  assert.equal(menu().querySelectorAll('[data-tnw-pick]').length, Object.keys(w.TnWidgets.CATALOG).length + 1);
  menu().querySelector('[data-tnw-pick="slope"]').click();
  assert.equal(menu(), null);
  assert.equal(stored(w).slots[2], 'slope');
  assert.equal(cards(w)[2].dataset.widget, 'slope');
  // убрать: место 1
  ctx(cards(w)[0]);
  menu().querySelector('[data-tnw-pick=""]').click();
  assert.equal(stored(w).slots[0], '');
  // клик мимо карточек — «Добавить виджет» в первое свободное место (теперь место 1)
  ctx(d.getElementById('tn-widgets'));
  assert.match(menu().textContent, /Добавить виджет/);
  assert.equal(menu().querySelector('[data-tnw-pick=""]'), null, 'без «Убрать»');
  menu().querySelector('[data-tnw-pick="osrmEta"]').click();
  assert.equal(stored(w).slots[0], 'osrmEta');
  // Escape и клик снаружи закрывают
  ctx(cards(w)[1]);
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(menu(), null);
  ctx(cards(w)[1]);
  d.body.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  assert.equal(menu(), null);
  // все 8 мест заняты — клик мимо карточек только подсказывает
  w.TnWidgets.setConfig({ slots: ['zoom', 'time', 'date', 'coords', 'sunset', 'sunsetAt', 'dayLen', 'scale'], opacity: 0, hidden: false });
  ctx(d.getElementById('tn-widgets'));
  assert.match(menu().textContent, /Все 8 мест заняты/);
  assert.equal(menu().querySelectorAll('[data-tnw-pick]').length, 0);
});
