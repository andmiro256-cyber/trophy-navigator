// Окно «Связь с сервером» (ui/tn-server.js) и «Получить с сервера» как на Android: только добавляет.
// Сеть не трогаем: fetch, IPC и функции приложения — заглушки. DOM — jsdom (NODE_PATH=…/node_modules).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const html = read('../ui/index.html');
const serverJs = read('../ui/tn-server.js');
const iconsJs = read('../ui/tn-icons.js');
const themeCss = read('../ui/theme.css');
const require = createRequire(import.meta.url);
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }
const needDom = { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' };
const tick = () => new Promise(r => setImmediate(r));
const plain = v => JSON.parse(JSON.stringify(v));
/** Текст узла: текстовые узлы через пробел (строки окна не склеиваются). */
function txt(el) {
  const out = [];
  const walk = n => { if (n.nodeType === 3) out.push(n.data); else n.childNodes.forEach(walk); };
  walk(el);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

/** Текст функции верхнего уровня index.html по имени (с учётом вложенных скобок, строк и шаблонов). */
function extractFn(name) {
  const m = new RegExp(`(?:async )?function ${name}\\(`).exec(html);
  assert.ok(m, `нет функции ${name}`);
  let i = html.indexOf('{', m.index), depth = 0, quote = null;
  for (; i < html.length; i++) {
    const c = html[i];
    if (quote) { if (c === '\\') { i++; continue; } if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '/' && html[i + 1] === '/') { i = html.indexOf('\n', i); continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return html.slice(m.index, i + 1);
  }
  throw new Error(`не закрыта ${name}`);
}

const doms = [];
test.afterEach(() => doms.splice(0).forEach(d => d.window.close()));

/** jsdom с tn-icons.js и tn-server.js; fetch — заглушка (до загрузки модуля, чтобы его обёртка наблюдала её). */
function makeDom({ fetchImpl, globals = {}, storage = {} } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><button class="server-btn"><span class="tb-icon"><span class="server-state-dot unknown" id="server-state-dot"></span></span></button><div id="update-status"></div></body></html>',
    { runScripts: 'outside-only', url: 'http://localhost/' });
  doms.push(dom);
  const w = dom.window;
  Object.entries(storage).forEach(([k, v]) => w.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)));
  const calls = [];
  w.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (fetchImpl) return fetchImpl(String(url), init);
    throw new Error('сеть в тестах запрещена');
  };
  Object.assign(w, globals);
  w.eval(iconsJs);
  w.eval(serverJs);
  return { dom, w, calls };
}

const NOW = new Date('2026-10-08T12:00:00Z').getTime();
const baseStatus = over => ({
  now: NOW,
  server: { ok: true, ms: 182, at: new Date(NOW - 60000).toISOString(), status: 200, path: '/api/tiles-catalog.json' },
  license: { plan: 'full', until: '2027-05-01T00:00:00Z', serverUntil: '2027-05-01T00:00:00Z', checkedAt: new Date(NOW - 3600000).toISOString() },
  trialDays: null,
  machineId: 'A1B2C3D4E5F60718293A4B5C6D7E8F90',
  sync: { email: 'user@example.com', linked: true, lastAt: new Date(NOW - 7200000).toISOString(),
    push: { at: new Date(NOW - 7200000).toISOString(), text: 'точки: 3, треки: 1' }, pull: null },
  version: '0.9.29',
  updateText: '',
  updatePending: false,
  live: { connected: true, error: false, online: 2, total: 5 },
  onlineMinutes: 5,
  ...over,
});

// ─── окно ───
test('окно: сервер доступен — время ответа, лицензия, устройство сокращённо, синхронизация, Live', needDom, () => {
  const { w } = makeDom();
  const div = w.document.createElement('div');
  div.innerHTML = w.TNServer.renderPanelHtml(baseStatus());
  const text = txt(div);
  assert.match(text, /Сервер trophynav\.ru/);
  assert.match(text, /Доступен/);
  assert.match(text, /182 мс/);
  assert.match(text, /Full — Android \+ Desktop \+ Server/);
  assert.match(text, /Действует до 01\.05\.2027/);
  assert.match(text, /Подтверждена сервером/);
  assert.match(text, /A1B2C3…8F90/, 'machine id сокращён');
  assert.doesNotMatch(text, /A1B2C3D4E5F60718293A4B5C6D7E8F90/, 'полный id только в подсказке');
  assert.match(text, /user@example\.com/);
  assert.match(text, /Отправлено точки: 3, треки: 1/);
  assert.match(text, /Получено —/);
  assert.match(text, /Текущая версия 0\.9\.29/);
  assert.match(text, /подключено/);
  assert.match(text, /В сети \(точка не старше 5 мин\) 2 из 5/);
  const labels = [...div.querySelectorAll('button')].map(b => b.textContent.trim());
  assert.deepEqual(labels, ['Отправить на сервер', 'Получить с сервера', 'Проверить обновление']);
  assert.ok(div.querySelector('.server-state-dot.ok'));
});

test('окно: сервер недоступен, нет лицензии (пробный и истёкший), нет sync, Live выключен', needDom, () => {
  const { w } = makeDom();
  const render = s => { const d = w.document.createElement('div'); d.innerHTML = w.TNServer.renderPanelHtml(s); return d; };
  const down = render(baseStatus({
    server: { ok: false, ms: null, at: new Date(NOW - 30000).toISOString(), status: null, path: '/api/live2/devices' },
    license: null, trialDays: 9, machineId: null,
    sync: { email: null, linked: false, lastAt: null, push: null, pull: null },
    live: { connected: false, error: false, online: 0, total: 0 },
  }));
  const t = txt(down);
  assert.match(t, /Недоступен/);
  assert.match(t, /Время ответа —/);
  assert.ok(down.querySelector('.server-state-dot.bad'));
  assert.match(t, /Пробный период — 9 дн\./);
  assert.match(t, /Email не привязан/);
  assert.match(t, /Последний обмен —/);
  assert.match(t, /Подключение не подключено/);
  const none = txt(render(baseStatus({ server: null, license: null, trialDays: 0 })));
  assert.match(none, /Ещё не проверялся/);
  assert.match(none, /План Нет лицензии/);
  const expired = txt(render(baseStatus({ license: { plan: 'desktop', until: '2026-01-01T00:00:00Z', checkedAt: null } })));
  assert.match(expired, /Navigator Pro/);
  assert.match(expired, /01\.01\.2026 — истекла/);
});

test('окно: данные экранируются (email и текст сервера — не разметка)', needDom, () => {
  const { w } = makeDom();
  const d = w.document.createElement('div');
  d.innerHTML = w.TNServer.renderPanelHtml(baseStatus({ sync: { email: '<img src=x onerror=alert(1)>', linked: true, lastAt: null, push: { at: null, text: '<b>x</b>' }, pull: null } }));
  assert.equal(d.querySelector('img'), null);
  assert.equal(d.querySelector('b'), null);
});

test('gatherStatus: лицензия, sync-config, последний обмен, устройство — из localStorage, без запросов', needDom, () => {
  const { w, calls } = makeDom({ storage: {
    'tnd-license': { plan: 'full', expiry: '2027-05-01T00:00:00Z', serverUntil: null, checkedAt: '2026-10-08T10:00:00Z' },
    'tnd-sync-config': { email: 'a@b.ru', syncKey: 'k' },
    'tnd-sync-last': '2026-10-08T09:00:00Z',
    'tnd-machine-id': 'SW-ABCD-EF01-2345',
  } });
  w.TNServer.rememberExchange('pull', 'Добавлено: 1 точка, 0 маршрутов, 0 треков', '2026-10-08T09:00:00Z');
  const s = w.TNServer.gatherStatus(NOW);
  assert.equal(s.license.plan, 'full');
  assert.equal(s.license.checkedAt, '2026-10-08T10:00:00Z');
  assert.equal(s.sync.email, 'a@b.ru');
  assert.equal(s.sync.linked, true);
  assert.equal(s.sync.pull.text, 'Добавлено: 1 точка, 0 маршрутов, 0 треков');
  assert.equal(s.machineId, 'SW-ABCD-EF01-2345');
  assert.equal(s.onlineMinutes, 5);
  assert.equal(calls.length, 0, 'ни одного запроса');
});

test('точка на кнопке: по уже идущим запросам к trophynav.ru/api (наблюдение fetch), старое — серое', needDom, async () => {
  let fail = false;
  const { w, calls } = makeDom({ fetchImpl: async url => {
    if (fail) throw new TypeError('Failed to fetch');
    return { ok: true, status: url.includes('/sync/') ? 401 : 200, json: async () => ({}) };
  } });
  const dot = w.document.getElementById('server-state-dot');
  w.TNServer.updateDot();
  assert.equal(dot.className, 'server-state-dot unknown');
  // запрос не к API (плитка, GitHub) — не наблюдается
  await w.fetch('https://api.github.com/repos/x/releases/latest');
  await w.fetch('https://trophynav.ru/tiles/wikimapia_hybrid/1/2/3');
  assert.equal(w.TNServer.last, null);
  await w.fetch('https://trophynav.ru/api/tiles-catalog.json');
  assert.equal(dot.className, 'server-state-dot ok');
  assert.equal(w.TNServer.last.path, '/api/tiles-catalog.json');
  assert.ok(Number.isFinite(w.TNServer.last.ms));
  // 401 — сервер ответил: доступен
  await w.fetch('https://trophynav.ru/api/sync/pull');
  assert.equal(dot.className, 'server-state-dot ok');
  fail = true;
  await assert.rejects(w.fetch('https://trophynav.ru/api/live2/devices'));
  assert.equal(dot.className, 'server-state-dot bad');
  assert.equal(w.TNServer.dotState({ ok: true, at: new Date(NOW - 2 * 3600000).toISOString() }, NOW), 'unknown');
  assert.equal(calls.length, 5);
});

test('«Обновить состояние»: каталог карт (существующий GET) + checkLicenseOnServer; окно перерисовано', needDom, async () => {
  let licenseChecks = 0;
  const { w, calls } = makeDom({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    globals: { checkLicenseOnServer: async () => { licenseChecks++; }, openModal: id => w.document.getElementById(id).classList.add('open') },
  });
  w.openServerPanel();
  const overlay = w.document.getElementById('modal-server');
  assert.ok(overlay.classList.contains('open'));
  assert.match(overlay.querySelector('.modal-title').textContent, /Связь с сервером/);
  assert.match(overlay.textContent, /Ещё не проверялся/);
  overlay.querySelector('[data-srv="refresh"]').click();
  await settle();
  assert.deepEqual(calls.map(c => c.url), ['https://trophynav.ru/api/tiles-catalog.json']);
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(licenseChecks, 1);
  assert.match(overlay.textContent, /Доступен/);
  assert.equal(w.document.getElementById('server-state-dot').className, 'server-state-dot ok');
});

test('кнопки окна вызывают те же функции: syncPush, syncPull, checkForUpdates', needDom, async () => {
  const called = [];
  const { w } = makeDom({ globals: {
    syncPush: async () => called.push('push'), syncPull: async silent => called.push('pull:' + silent),
    checkForUpdates: async silent => called.push('update:' + silent),
  } });
  w.openServerPanel();
  for (const a of ['push', 'pull', 'update']) {
    w.document.querySelector(`#modal-server [data-srv="${a}"]`).click();
    await settle();
  }
  assert.deepEqual(called, ['push', 'pull:undefined', 'update:false']);
});

// ─── «Получить с сервера»: только добавляет ───
const local = () => ({
  version: 3, map: { zoom: 9 }, settings: { colorWpt: 'local' }, activeSetId: 1,
  counters: { wpCounter: 3, trackIdCounter: 3, routeIdCounter: 2, waypointSetIdCounter: 2 },
  waypointSets: [{ id: 1, name: 'Основной', visible: true }],
  waypoints: [
    { id: 'wp-local-1', name: 'Лагерь', lat: 60, lng: 30, desc: 'мой', setId: 1, source: 'desktop' },
    { id: 'wp-local-2', name: 'Брод', lat: 60.1, lng: 30.1, setId: 1, source: 'desktop' },
  ],
  tracks: [{ id: 1, name: 'Утро', points: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }] }, { id: 2, name: 'Вечер', points: [{ lat: 1, lng: 1 }, { lat: 3, lng: 3 }] }],
  routes: [{ id: 1, name: 'Гонка', points: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], pointWaypointIds: ['wp-local-1', null] }],
  gpxFiles: [],
});
const remote = () => ({
  _source: 'android',
  map: { zoom: 3 }, settings: { colorWpt: 'server' }, activeSetId: 7,
  counters: { wpCounter: 10, trackIdCounter: 2, routeIdCounter: 2, waypointSetIdCounter: 8 },
  waypointSets: [{ id: 7, name: 'С телефона', visible: true }],
  waypoints: [
    { id: 'wp-s-1', name: ' лагерь ', lat: 10, lng: 10, setId: 7 },           // уже есть «Лагерь»
    { id: 'wp-local-2', name: 'Мост', lat: 61, lng: 31, setId: 7 },            // новый, id совпал с локальной «Брод»
    { id: 'wp-s-3', name: 'Мост', lat: 62, lng: 32, setId: 7 },               // дубль сервера
    { id: 'wp-s-4', name: 'Без координат', lat: null, lng: 32, setId: 7 },
  ],
  tracks: [{ id: 1, name: 'Ночь', points: [{ lat: 5, lng: 5 }, { lat: 6, lng: 6 }] }, { id: 9, name: 'УТРО', points: [{ lat: 0, lng: 0 }, { lat: 9, lng: 9 }] }],
  routes: [
    { id: 1, name: 'Разведка', points: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }], pointWaypointIds: ['wp-s-1', 'wp-local-2', 'wp-s-3'] },
    { id: 5, name: 'гонка', points: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] },
    { id: 6, name: 'Разведка', points: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] },
  ],
  gpxFiles: [],
});
const ALL = { waypoints: true, tracks: true, routes: true, gpx: true };

test('add-only: «Лагерь» не заменён « лагерь », новые добавлены, дубль сервера — одна копия, ничего не удалено', needDom, () => {
  const { w } = makeDom();
  const L = local();
  const { state, stats, added } = plain(w.TNServer.mergeAddOnly(L, remote(), ALL, { syncTime: '2026-10-08T12:00:00Z', makeWaypointId: (() => { let n = 0; return () => `wp-new-${++n}`; })() }));
  // локальное — как было, в своём порядке
  assert.deepEqual(state.waypoints.slice(0, 2), L.waypoints);
  assert.deepEqual(state.tracks.slice(0, 2), L.tracks);
  assert.deepEqual(state.routes.slice(0, 1), L.routes);
  const camp = state.waypoints.filter(p => p.name.trim().toLowerCase() === 'лагерь');
  assert.equal(camp.length, 1);
  assert.deepEqual(camp[0], L.waypoints[0], 'локальный «Лагерь» не тронут (координаты, описание, источник)');
  // добавлены
  assert.deepEqual(state.waypoints.map(p => p.name), ['Лагерь', 'Брод', 'Мост']);
  assert.deepEqual(state.tracks.map(t => t.name), ['Утро', 'Вечер', 'Ночь']);
  assert.deepEqual(state.routes.map(r => r.name), ['Гонка', 'Разведка']);
  // id: совпавший с локальным — новый; треки/маршруты — свободный номер
  const bridge = state.waypoints[2];
  assert.equal(bridge.id, 'wp-new-1');
  assert.equal(bridge.lat, 61, 'первая копия дубля');
  assert.equal(state.tracks[2].id, 10, 'номер выше всех локальных и серверных');
  assert.equal(state.routes[1].id, 7);
  assert.equal(new Set(state.tracks.map(t => t.id)).size, 3);
  // пометки источника
  assert.equal(bridge.source, 'android');
  assert.equal(bridge.syncedAt, '2026-10-08T12:00:00Z');
  assert.equal(state.tracks[2].source, 'android');
  // набор с сервера — новый набор с свободным номером
  assert.deepEqual(state.waypointSets.map(s => s.name), ['Основной', 'С телефона']);
  assert.equal(bridge.setId, state.waypointSets[1].id);
  assert.equal(state.waypointSets[1].id, 8);
  // связи КП→WP: пропущенная « лагерь » → локальный «Лагерь», id «Моста» → новый, дубль → первая копия
  assert.deepEqual(state.routes[1].pointWaypointIds, ['wp-local-1', 'wp-new-1', 'wp-new-1']);
  // настройки, вид карты, активный набор — локальные
  assert.deepEqual(state.settings, L.settings);
  assert.deepEqual(state.map, L.map);
  assert.equal(state.activeSetId, 1);
  assert.ok(state.counters.trackIdCounter > 10 && state.counters.routeIdCounter > 7);
  // статистика и итог
  assert.deepEqual({ ...stats.waypoints }, { added: 1, skipped: 1, duplicates: 1, invalid: 1 });
  assert.deepEqual({ ...stats.tracks }, { added: 1, skipped: 1, duplicates: 0, invalid: 0 });
  assert.deepEqual({ ...stats.routes }, { added: 1, skipped: 1, duplicates: 1, invalid: 0 });
  assert.equal(w.TNServer.formatPullSummary(stats),
    'Добавлено: 1 точка, 1 маршрут, 1 трек. Уже было на устройстве, не тронуто: 3. Пропущено без координат: 1');
  assert.deepEqual(added.waypoints.map(p => p.name), ['Мост']);
  assert.deepEqual(added.tracks.map(t => t.name), ['Ночь']);
  // вход не изменён
  assert.deepEqual(L, local());
});

test('add-only: повторное получение того же ничего не добавляет; снятый тип не трогается', needDom, () => {
  const { w } = makeDom();
  const first = plain(w.TNServer.mergeAddOnly(local(), remote(), ALL, { makeWaypointId: () => 'wp-x' }));
  const again = plain(w.TNServer.mergeAddOnly(first.state, remote(), ALL, { makeWaypointId: () => 'wp-y' }));
  assert.equal(w.TNServer.addedTotal(again.stats), 0);
  assert.deepEqual(again.state.waypoints, first.state.waypoints);
  assert.equal(w.TNServer.formatPullSummary(again.stats), 'Добавлено: 0 точек, 0 маршрутов, 0 треков. Уже было на устройстве, не тронуто: 6. Пропущено без координат: 1');
  const onlyRoutes = plain(w.TNServer.mergeAddOnly(local(), remote(), { routes: true }));
  assert.deepEqual(onlyRoutes.state.waypoints, local().waypoints);
  assert.deepEqual(onlyRoutes.state.tracks, local().tracks);
  assert.equal(onlyRoutes.stats.routes.added, 1);
  // склонения
  assert.equal(w.TNServer.formatPullSummary({ waypoints: { added: 5 }, routes: { added: 2 }, tracks: { added: 21 } }), 'Добавлено: 5 точек, 2 маршрута, 21 трек');
  assert.equal(w.TNServer.nameKey('  ЛаГерь '), 'лагерь');
});

test('addMissingByName повторяет SyncMerge.addMissingByName (Android)', needDom, () => {
  const { w } = makeDom();
  const r = plain(w.TNServer.addMissingByName(['A', 'b'], [' a', 'C', 'c ', 'B', 'D'], x => x));
  assert.deepEqual(r.merged, ['A', 'b', 'C', 'D']);
  assert.deepEqual([r.added, r.skipped, r.duplicates], [2, 2, 1]);
});

// ─── ссылки КП→WP: только доказанное соответствие (ревью 2576) ───
const tim = () => ({
  local: { waypointSets: [{ id: 1, name: 'Основной' }], activeSetId: 1, counters: {},
    waypoints: [{ id: 'wp-1', name: 'Локальная точка', lat: 60, lng: 30, setId: 1 }], tracks: [], routes: [], gpxFiles: [] },
  remote: { waypointSets: [{ id: 1, name: 'Основной' }],
    waypoints: [{ id: 'wp-1', name: 'Серверная точка', lat: 61, lng: 31, setId: 1 }],
    routes: [{ id: 1, name: 'Импорт', points: [{ lat: 61, lng: 31 }, { lat: 62, lng: 32 }], pointWaypointIds: ['wp-1', null] }] },
});
const linkTarget = (state, route) => route.pointWaypointIds.map(id => (id == null ? null : state.waypoints.find(p => p.id === id)?.name ?? `?${id}`));

test('КП→WP: маршруты без точек, id сервера совпал с чужой локальной точкой — ссылка не на «Локальная точка»', needDom, () => {
  const { w } = makeDom();
  const { local, remote } = tim();
  const { state } = plain(w.TNServer.mergeAddOnly(local, remote, { routes: true, waypoints: false }));
  const route = state.routes.find(r => r.name === 'Импорт');
  assert.deepEqual(route.pointWaypointIds, [null, null], 'неподтверждённая ссылка обнулена');
  assert.deepEqual(state.waypoints, local.waypoints, 'точки не добавлялись');
  // при снятых «Точках» допустима связь с уже имеющейся точкой того же названия
  const r2 = tim();
  r2.local.waypoints.push({ id: 'wp-7', name: 'серверная ТОЧКА ', lat: 61, lng: 31, setId: 1 });
  const linked = plain(w.TNServer.mergeAddOnly(r2.local, r2.remote, { routes: true, waypoints: false })).state;
  assert.deepEqual(linkTarget(linked, linked.routes[0]), ['серверная ТОЧКА ', null]);
});

test('КП→WP: серверной точки нет в ответе или она без координат — ссылка null (и при включённых «Точках»)', needDom, () => {
  const { w } = makeDom();
  for (const checks of [{ routes: true, waypoints: true }, { routes: true, waypoints: false }]) {
    const missing = tim();
    missing.remote.waypoints = [];
    const a = plain(w.TNServer.mergeAddOnly(missing.local, missing.remote, checks)).state;
    assert.deepEqual(a.routes[0].pointWaypointIds, [null, null], `нет в ответе: ${JSON.stringify(checks)}`);
    const invalid = tim();
    invalid.remote.waypoints[0].lat = null;
    const b = plain(w.TNServer.mergeAddOnly(invalid.local, invalid.remote, checks)).state;
    assert.deepEqual(b.routes[0].pointWaypointIds, [null, null], `без координат: ${JSON.stringify(checks)}`);
    assert.ok(!b.waypoints.some(p => p.name === 'Серверная точка'));
  }
  // один server id у двух разных точек — неоднозначно
  const amb = tim();
  amb.remote.waypoints.push({ id: 'wp-1', name: 'Другая', lat: 63, lng: 33, setId: 1 });
  const c = plain(w.TNServer.mergeAddOnly(amb.local, amb.remote, { routes: true, waypoints: true }, { makeWaypointId: (() => { let n = 0; return () => `wp-n${++n}`; })() })).state;
  assert.deepEqual(c.routes[0].pointWaypointIds, [null, null]);
});

test('КП→WP контроль: «Точки» включены — ссылка на добавленную серверную точку с новым id', needDom, () => {
  const { w } = makeDom();
  const { local, remote } = tim();
  const { state } = plain(w.TNServer.mergeAddOnly(local, remote, { routes: true, waypoints: true }, { makeWaypointId: () => 'wp-new' }));
  assert.deepEqual(state.routes[0].pointWaypointIds, ['wp-new', null]);
  assert.deepEqual(linkTarget(state, state.routes[0]), ['Серверная точка', null]);
  assert.deepEqual(state.waypoints.find(p => p.id === 'wp-1'), local.waypoints[0], 'локальная wp-1 не тронута');
});

// ─── ревью 2587: точка без координат не доказывает связь; повтор id — по всем записям ответа ───
const t2587 = (serverWaypoints) => ({
  local: { waypointSets: [{ id: 1, name: 'Основной' }], activeSetId: 1, counters: {},
    waypoints: [{ id: 'local-A', name: 'A', lat: 60, lng: 30, setId: 1 }], tracks: [], routes: [], gpxFiles: [] },
  remote: { waypointSets: [{ id: 1, name: 'Основной' }], waypoints: serverWaypoints,
    routes: [{ id: 1, name: 'Импорт', points: [{ lat: 61, lng: 31 }, { lat: 62, lng: 32 }], pointWaypointIds: ['server-1', null] }] },
});

test('КП→WP: серверная точка без координат с тем же названием, что у локальной, — ссылка null при обеих галочках', needDom, () => {
  const { w } = makeDom();
  for (const waypoints of [false, true]) {
    const { local, remote } = t2587([{ id: 'server-1', name: 'A', lat: null, lng: 31, setId: 1 }]);
    const { state } = plain(w.TNServer.mergeAddOnly(local, remote, { routes: true, waypoints }));
    assert.deepEqual(state.routes[0].pointWaypointIds, [null, null], `waypoints=${waypoints}`);
    assert.deepEqual(state.waypoints, local.waypoints);
  }
});

test('КП→WP: один server id у валидной и невалидной точки — неоднозначно, ссылка null при обеих галочках', needDom, () => {
  const { w } = makeDom();
  for (const waypoints of [false, true]) {
    for (const order of [0, 1]) {
      const pts = [{ id: 'server-1', name: 'A', lat: 61, lng: 31, setId: 1 }, { id: 'server-1', name: 'B', lat: null, lng: 32, setId: 1 }];
      const { local, remote } = t2587(order ? pts.reverse() : pts);
      const { state } = plain(w.TNServer.mergeAddOnly(local, remote, { routes: true, waypoints }));
      assert.deepEqual(state.routes[0].pointWaypointIds, [null, null], `waypoints=${waypoints}, порядок ${order}`);
    }
  }
});

/** syncPull из index.html с заглушками: ответ сервера, collectState/applyState — память. */
function runSyncPull(w, { localState, payload, silent = false, confirm = true }) {
  const out = { applied: null, toasts: [], saved: 0, files: null, status: [] };
  const el = { textContent: '' };
  Object.assign(w, {
    isPremiumAvailable: () => true, saveSyncConfig() {}, getSyncConfig: () => ({ email: 'a@b.ru', syncKey: 'k' }),
    getSyncChecks: () => ({ ...ALL }), tndConfirm: async () => confirm, updateSyncStatus: (t, ok) => out.status.push([t, ok]),
    syncApiUrl: p => 'https://trophynav.ru' + p, syncHeaders: () => ({}),
    collectState: () => JSON.parse(JSON.stringify(localState)), applyState: s => { out.applied = s; }, saveState: () => { out.saved++; },
    saveSyncedGPXFiles: (s, c) => { out.files = s; }, showToast: t => out.toasts.push(t), makeEntityId: p => `${p}-gen`,
    APP_STATE_VERSION: 3,
  });
  w.document.getElementById = (orig => id => (id === 'sync-last-time' || id === 'sync-server-info' ? el : orig.call(w.document, id)))(w.document.getElementById);
  w.eval(['isPlainObject', 'getSyncItems', 'normalizeSyncPullState', 'syncPull'].map(extractFn).join('\n')
    + '\nwindow.syncPull = syncPull;');
  return w.syncPull(silent).then(stats => plain({ ...out, stats: stats || null }));
}

test('syncPull (index.html): локальное не заменено и не удалено, итог в тосте и в «последнем обмене»', needDom, async () => {
  const { w, calls } = makeDom({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: {
    waypoints: { items: remote().waypoints, waypointSets: remote().waypointSets },
    tracks: { items: remote().tracks }, routes: { items: remote().routes }, settings: { settings: { colorWpt: 'server' }, map: { zoom: 3 } },
  } }) }) });
  const L = local();
  const r = await runSyncPull(w, { localState: L });
  assert.deepEqual(calls.map(c => c.url), ['https://trophynav.ru/api/sync/pull']);
  assert.ok(r.applied, 'состояние применено');
  assert.deepEqual(r.applied.waypoints.slice(0, 2), L.waypoints);
  assert.deepEqual(r.applied.tracks.slice(0, 2), L.tracks);
  assert.deepEqual(r.applied.routes.slice(0, 1), L.routes);
  assert.deepEqual(r.applied.settings, L.settings, 'настройки сервера не перезаписали локальные');
  assert.deepEqual(r.applied.map, L.map);
  assert.equal(r.applied.waypoints.length, 3);
  assert.deepEqual(r.files.waypoints.map(p => p.name), ['Мост'], 'в рабочую папку — только добавленное');
  assert.deepEqual(r.files.tracks.map(t => t.name), ['Ночь']);
  const summary = 'Добавлено: 1 точка, 1 маршрут, 1 трек. Уже было на устройстве, не тронуто: 3. Пропущено без координат: 1';
  assert.deepEqual(r.toasts, [summary]);
  assert.equal(JSON.parse(w.localStorage.getItem('tnd-sync-last-pull')).text, summary);
  assert.ok(w.localStorage.getItem('tnd-sync-last'));
});

test('syncPull: id сервера совпал с локальным объектом другого названия — локальный остаётся (прежний дефект)', needDom, async () => {
  // До исправления слияние по id «сервер побеждает» заменяло локальный трек 1 «Утро» серверным треком 1 «Ночь».
  const { w } = makeDom({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({
    tracks: [{ id: 1, name: 'Ночь', points: [{ lat: 5, lng: 5 }, { lat: 6, lng: 6 }], updatedAt: '2030-01-01T00:00:00Z' }],
    waypoints: [{ id: 'wp-local-1', name: 'Чужая', lat: 1, lng: 1, updatedAt: '2030-01-01T00:00:00Z' }],
  }) }) });
  const r = await runSyncPull(w, { localState: local() });
  const t1 = r.applied.tracks.find(t => t.id === 1);
  assert.equal(t1.name, 'Утро');
  assert.ok(r.applied.tracks.some(t => t.name === 'Ночь' && t.id !== 1));
  assert.equal(r.applied.waypoints.find(p => p.id === 'wp-local-1').name, 'Лагерь');
  assert.ok(r.applied.waypoints.some(p => p.name === 'Чужая' && p.id === 'wp-gen'));
});

test('syncPull: пустой ответ и «нечего добавить» — состояние не пересобирается, локальное цело', needDom, async () => {
  const { w } = makeDom({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ waypoints: [{ name: 'ЛАГЕРЬ', lat: 0, lng: 0 }] }) }) });
  const r = await runSyncPull(w, { localState: local() });
  assert.equal(r.applied, null, 'applyState не вызывался');
  assert.deepEqual(r.toasts, ['Добавлено: 0 точек, 0 маршрутов, 0 треков. Уже было на устройстве, не тронуто: 1']);
  const silentDom = makeDom({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  const s = await runSyncPull(silentDom.w, { localState: local(), silent: true });
  assert.equal(s.applied, null);
  assert.deepEqual(s.toasts, [], 'тихий запуск без тостов');
});

test('«Очистить данные на сервере»: та же отправка, пустые списки, после подтверждения', needDom, async () => {
  let declined = true;
  const { w, calls } = makeDom({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }), globals: {
    isPremiumAvailable: () => true, saveSyncConfig() {}, getSyncConfig: () => ({ email: 'a@b.ru', syncKey: 'k' }),
    tndConfirmDanger: async () => !declined, updateSyncStatus() {}, syncApiUrl: p => 'https://trophynav.ru' + p,
    syncHeaders: () => ({ 'X-Sync-Email': 'a@b.ru', 'X-Sync-Key': 'k' }), getMachineIdAsync: async () => 'M1', showToast() {},
  } });
  assert.equal(await w.TNServer.clearServerData(), false);
  assert.equal(calls.length, 0, 'без подтверждения — ни одного запроса');
  declined = false;
  assert.equal(await w.TNServer.clearServerData(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://trophynav.ru/api/sync/push');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.data.waypoints.items, []);
  assert.deepEqual(body.data.tracks.items, []);
  assert.deepEqual(body.data.routes.items, []);
  assert.equal(body.data.waypoints.replace, true);
  assert.equal(body.deviceType, 'desktop');
});

test('writeNewTextFile: существующий файл не перезаписывается — «имя (2).gpx», createNew', async () => {
  const files = new Map([['/w/routes/A.gpx', 'old']]);
  const opts = [];
  const fsStub = {
    exists: async p => files.has(p),
    writeTextFile: async (p, c, o) => { opts.push(o); if (o?.createNew && files.has(p)) throw new Error('exists'); files.set(p, c); },
  };
  const { w } = JSDOM ? makeDom() : { w: null };
  if (!w) return;
  const path = await w.TNServer.writeNewTextFile('/w/routes', 'A', '.gpx', 'new', fsStub);
  assert.equal(path, '/w/routes/A (2).gpx');
  assert.equal(files.get('/w/routes/A.gpx'), 'old');
  assert.equal(opts[0].createNew, true);
});

// ─── тексты и стиль ───
test('UI синхронизации: нет «облак…», названия как на Android, «Сервер» больше не заглушка', () => {
  assert.doesNotMatch(html, /облак|облач/i);
  assert.doesNotMatch(serverJs, /облак|облач/i);
  assert.doesNotMatch(html, /Сервер — в разработке/);
  for (const label of ['Отправить на сервер', 'Получить с сервера', 'Очистить данные на сервере']) {
    assert.ok(html.includes(`</svg>${label}</button>`), `кнопка «${label}»`);
  }
  assert.match(html, /class="tb-btn tb-captioned server-btn[^"]*" onclick="openServerPanel\(\)"/);
  assert.match(html, /onclick="closeToolbarMore\(\);openServerPanel\(\)"/);
  assert.match(html, /id="server-state-dot"/);
  assert.match(html, /<script src="tn-server\.js"><\/script>/);
  // прежнее слияние «сервер побеждает» удалено, pull идёт через mergeAddOnly
  assert.doesNotMatch(html, /function mergeSyncState\(/);
  assert.match(extractFn('syncPull'), /TNServer\.mergeAddOnly\(/);
  assert.match(extractFn('syncPull'), /normalizeSyncPullState\(payload\)/);
});

test('tn-server.js: только токены theme.css, значки из набора, без «#» перед числами в комментариях', () => {
  assert.doesNotMatch(serverJs, /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
  const defined = new Set([...themeCss.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(m => m[1]));
  const missing = [...serverJs.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]).filter(n => !defined.has(n));
  assert.deepEqual(missing, []);
  const NAMES = JSON.parse(iconsJs.match(/window\.TN_ICON_NAMES = (\[[^\]]*\]);/)[1]);
  const used = [...serverJs.matchAll(/\b(?:ico|title)\(\s*'([a-z0-9-]+)'/g)].map(m => m[1]);
  assert.ok(used.length >= 8);
  assert.deepEqual(used.filter(n => !NAMES.includes(n)), []);
  assert.doesNotMatch(serverJs, /\/\/.*#\d/);
});
