#!/usr/bin/env node
// Сквозной сценарий работы с точками WP настоящей мышью (план MapLibre v3, этап 0б — страховка переноса
// отрисовки WP в адаптер). Запуск: node tools/e2e/wp-scenario.mjs <каталог ui> > result.json
// Сравнение: результат на чистой 0.9.34 и на ветке должен совпадать (id и время нормализуются).
// Использует playwright-core из tools/golden (npm ci --prefix tools/golden) и системный Chrome.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../golden/package.json', import.meta.url));
const { chromium } = require('playwright-core');

const UI = path.resolve(process.argv[2] || 'ui');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.pbf': 'application/x-protobuf' };
const server = http.createServer((req, res) => {
  const p = path.join(UI, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(UI) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'ru-RU', timezoneId: 'UTC' });
// внешняя сеть не нужна и не должна влиять (тайлы, каталог, лицензия)
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
await ctx.addInitScript(() => {
  const T0 = Date.parse('2026-01-02T03:04:05.000Z'); const RealDate = Date; let tick = 0;
  // Date.now/new Date() — фиксированное время с шагом 1 мс (детерминизм id и createdAt)
  globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [T0 + tick++])); } static now() { return T0 + tick++; } };
  let s = 0x934; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  try { localStorage.clear(); } catch {}
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}/index.html`);
await page.waitForTimeout(1500);

const ev = (f, arg) => page.evaluate(f, arg);
await ev(() => {
  document.getElementById('onboarding-overlay')?.remove();
  document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m.id));
  map.setView([59.93, 30.31], 14, { animate: false });
});
const box = await ev(() => { const r = map.getContainer().getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const at = (fx, fy) => [Math.round(box.x + box.w * fx), Math.round(box.y + box.h * fy)];
const wpScreen = i => ev(i => { const m = waypoints[i]; const p = map.latLngToContainerPoint(m.getLatLng()); const r = map.getContainer().getBoundingClientRect(); return [Math.round(r.left + p.x), Math.round(r.top + p.y)]; }, i);
const snap = () => ev(() => ({
  wp: waypoints.map(m => ({ name: m.wpData.name, lat: +m.wpData.lat.toFixed(6), lng: +m.wpData.lng.toFixed(6), radius: m.wpData.radius, setIdx: waypointSets.findIndex(s => s.id === m._setId),
    onMap: map.hasLayer(m), circleOnMap: !!m.wpCircle && map.hasLayer(m.wpCircle),
    circleAtMarker: !!m.wpCircle && Math.abs(m.wpCircle.getLatLng().lat - m.getLatLng().lat) < 1e-9 && Math.abs(m.wpCircle.getLatLng().lng - m.getLatLng().lng) < 1e-9 })),
  sets: waypointSets.map(s => ({ name: s.name, visible: s.visible, n: s.waypoints.length })),
  routes: routes.map(r => ({ n: r.points.length, labels: r.labels, linked: (r.pointWaypointIds || []).map(id => waypoints.findIndex(m => m.wpData.id === id)) })),
  mode: currentMode,
}));
const R = {};

// 1. три клика в режиме «Точка»
await ev(() => toggleMode('waypoint'));
for (const [fx, fy] of [[0.25, 0.35], [0.4, 0.55], [0.55, 0.4]]) { const [x, y] = at(fx, fy); await page.mouse.click(x, y); await page.waitForTimeout(150); }
R.s1_hit = await page.evaluate(pts => pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return (e && (e.id || e.className || e.tagName)).toString().slice(0, 40); }), [[0.25, 0.35], [0.4, 0.55], [0.55, 0.4]].map(([fx, fy]) => at(fx, fy)));
await ev(() => setMode('hand'));
R.s1_add = await snap();
if (R.s1_add.wp.length < 3) { process.stdout.write(JSON.stringify(R, null, 1)); process.exit(2); }

// 2. клик по точке → быстрое переименование → Enter
{ const [x, y] = await wpScreen(1); await page.mouse.click(x, y); await page.waitForTimeout(250); }
R.s2_popupOpen = await ev(() => !!document.querySelector('.leaflet-popup input'));
await page.fill('.leaflet-popup input', 'Ромашка'); await page.press('.leaflet-popup input', 'Enter'); await page.waitForTimeout(250);
R.s2_rename = (await snap()).wp.map(w => w.name);

// 3. правый клик по точке → меню → «Удалить»
{ const [x, y] = await wpScreen(2); await page.mouse.click(x, y, { button: 'right' }); await page.waitForTimeout(250); }
R.s3_menuOpen = await ev(() => document.getElementById('ctx-menu').classList.contains('open'));
await page.click('#ctx-menu .ctx-item.danger'); await page.waitForTimeout(300);
R.s3_delete = await snap();

// 4. перетаскивание точки 0 на (+60, +40) px
{ const [x, y] = await wpScreen(0); await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60, y + 40, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300); }
R.s4_drag = await snap();

// 5. отмена последнего действия (Ctrl+Z)
await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
R.s5_undo = await snap();

// 6. второй набор, точка в нём; скрыть первый набор
await ev(() => createWaypointSet('Набор 2'));
await ev(() => toggleMode('waypoint'));
{ const [x, y] = at(0.7, 0.6); await page.mouse.click(x, y); await page.waitForTimeout(150); }
await ev(() => { setMode('hand'); toggleSetVisibility(waypointSets[0].id); });
await page.waitForTimeout(200);
R.s6_sets = await snap();
await ev(() => toggleSetVisibility(waypointSets[0].id));

// 7. маршрут кликами по точкам (видимые), двойной щелчок по последней — завершить
await ev(() => { startNewRoute(); document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m.id)); });
const n = await ev(() => waypoints.length);
for (let i = 0; i < n - 1; i++) { const [x, y] = await wpScreen(i); await page.mouse.click(x, y); await page.waitForTimeout(200); }
{ const [x, y] = await wpScreen(n - 1); await page.mouse.dblclick(x, y); await page.waitForTimeout(500); }
R.s7_route = await snap();

// 7б. «Свойства» точки 0: радиус 150, затем 0 (круг пропадает) и снова 80
const circleOf = i => ev(i => { const m = waypoints[i]; let r = null; map.eachLayer(l => { if (l instanceof L.Circle && Math.abs(l.getLatLng().lat - m.getLatLng().lat) < 1e-9 && Math.abs(l.getLatLng().lng - m.getLatLng().lng) < 1e-9) r = { radius: l.getRadius(), color: l.options.color, fillOpacity: l.options.fillOpacity }; }); return r; }, i);
R.s7b_radius = [];
for (const r of [150, 0, 80]) {
  await ev(() => openWaypointPropsByNum(waypoints[0].wpData.num));
  await page.fill('#prop-radius', String(r));
  await ev(() => applyWaypointProps()); await page.waitForTimeout(150);
  R.s7b_radius.push(await circleOf(0));
}

// 8. «Скрыть все рабочие объекты» и обратно (кнопка с глазом)
await ev(() => toggleAllWorkObjectsVisible()); await page.waitForTimeout(200);
R.s8_hidden = await snap();
await ev(() => toggleAllWorkObjectsVisible()); await page.waitForTimeout(200);
R.s8_shown = await snap();

// 8б. замок объектов: точку не утащить; снять замок — «Переместить» из меню и перетащить
const dragWp = async (i, dx, dy) => { const [x, y] = await wpScreen(i); await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300); };
await ev(() => toggleLock());
await dragWp(0, 50, -30);
R.s8b_locked = (await snap()).wp.map(w => [w.lat, w.lng]);
await ev(() => toggleLock());
{ const [x, y] = await wpScreen(0); await page.mouse.click(x, y, { button: 'right' }); await page.waitForTimeout(250); }
await ev(() => ctxAction('move')); await page.waitForTimeout(200);
await dragWp(0, 50, -30);
R.s8b_moved = (await snap()).wp.map(w => [w.lat, w.lng]);

// 9. очистить все рабочие данные
await ev(() => clearAllDataConfirmed()); await page.waitForTimeout(300);
R.s9_cleared = await snap();
R.s9_leftovers = await ev(() => { let n = 0; map.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.Circle) n++; }); return n; });

R.errors = errors;
process.stdout.write(JSON.stringify(R, null, 1) + '\n');
await browser.close();
server.close();
