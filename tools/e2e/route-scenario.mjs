#!/usr/bin/env node
// Сквозной сценарий работы с маршрутами настоящей мышью (план MapLibre v3, этап 0б — страховка переноса
// отрисовки маршрутов в адаптер). node tools/e2e/route-scenario.mjs <ui> > result.json
// Результат на чистой версии (v0.9.36) и на ветке должен совпадать.
import { open } from './lib.mjs';

const { page, ev, errors, close } = await open(process.argv[2] || 'ui');
await ev(() => map.setView([59.93, 30.31], 14, { animate: false }));
const box = await ev(() => { const r = map.getContainer().getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const at = (fx, fy) => [Math.round(box.x + box.w * fx), Math.round(box.y + box.h * fy)];
const closeModals = () => ev(() => document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m.id)));
// Экранная точка на середине отрезка i маршрута r
const routeMid = (r, i) => ev(([r, i]) => {
  const pts = routes[r].points; const a = pts[i], b = pts[i + 1];
  const p = map.latLngToContainerPoint({ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 });
  const c = map.getContainer().getBoundingClientRect(); return [Math.round(c.left + p.x), Math.round(c.top + p.y)];
}, [r, i]);
const snap = () => ev(() => ({
  routes: routes.map(r => {
    const pl = r.polyline;
    return {
      name: r.name, n: r.points.length, labels: r.labels, visible: r.visible !== false,
      pts: r.points.map(p => [+p.lat.toFixed(6), +p.lng.toFixed(6)]),
      line: pl ? { onMap: map.hasLayer(pl), n: pl.getLatLngs().length, color: pl.options.color, weight: pl.options.weight,
        opacity: pl.options.opacity, dash: pl.options.dashArray ?? null } : null,
    };
  }),
  draw: currentRouteDraw ? { n: currentRouteDraw.points.length, line: !!currentRouteDraw.polyline && map.hasLayer(currentRouteDraw.polyline) } : null,
  mode: currentMode,
  menus: ['ctx-menu', 'ctx-menu-map', 'ctx-menu-track'].filter(id => document.getElementById(id)?.classList.contains('open')),
}));
const R = {};
try {
// 0. пять точек WP (маршрут строится только по ним): клики в режиме «Точка»
await ev(() => toggleMode('waypoint'));
for (const [fx, fy] of [[0.3, 0.3], [0.45, 0.6], [0.6, 0.35], [0.7, 0.55], [0.8, 0.25], [0.2, 0.7], [0.35, 0.8]]) {
  const [x, y] = at(fx, fy); await page.mouse.click(x, y); await page.waitForTimeout(120);
}
await ev(() => setMode('hand'));
R.s0_wp = await ev(() => waypoints.length);
const wpScreen = i => ev(i => { const p = map.latLngToContainerPoint(waypoints[i].getLatLng()); const r = map.getContainer().getBoundingClientRect(); return [Math.round(r.left + p.x), Math.round(r.top + p.y)]; }, i);
const clickWp = async (i, dbl = false) => { const [x, y] = await wpScreen(i); if (dbl) await page.mouse.dblclick(x, y); else await page.mouse.click(x, y); await page.waitForTimeout(dbl ? 500 : 180); };

// 1. новый маршрут: клики по точкам 0–2, двойной щелчок по точке 3 — завершить
await ev(() => startNewRoute()); await closeModals();
for (const i of [0, 1, 2]) await clickWp(i);
R.s1_drawing = await snap();
await clickWp(3, true);
await closeModals();
R.s1_done = await snap();
if (!R.s1_done.routes.length) { process.stdout.write(JSON.stringify(R, null, 1) + '\n'); await close(); process.exit(2); }

// 2. правый клик по линии маршрута — меню карты (маршрут сам меню не держит)
{ const [x, y] = await routeMid(0, 0); await page.mouse.click(x, y, { button: 'right' }); await page.waitForTimeout(250); }
R.s2_ctx = (await snap()).menus;
await page.mouse.click(...at(0.05, 0.95)); await page.waitForTimeout(150);

// 3. правка: добавить точку 4 кликом, завершить
await ev(() => { startRouteEdit(routes[0].id); }); await closeModals();
await clickWp(4);
R.s3_editing = await snap();
await ev(() => finishRouteDraw()); await page.waitForTimeout(200); await closeModals();
R.s3_done = await snap();

// 4. свойства: предпросмотр, отмена предпросмотра, применение
await ev(() => selectRouteById(routes[0].id));
const setProps = (color, width, dash) => ev(([c, w, d]) => {
  document.getElementById('route-color-input').value = c;
  document.getElementById('route-width-input').value = w;
  document.getElementById('route-dash-input').value = d;
}, [color, width, dash]);
await setProps('#123456', '6', '');
await ev(() => previewRouteProps());
R.s4_preview = (await snap()).routes[0].line;
await ev(() => revertRoutePropsPreview());
R.s4_reverted = (await snap()).routes[0].line;
await setProps('#aa3300', '5', '2 6');
await ev(() => applyRouteProps());
R.s4_applied = (await snap()).routes[0].line;
await closeModals();

// 5. скрыть и показать маршрут
await ev(() => toggleRouteVisible(routes[0].id)); R.s5_hidden = (await snap()).routes[0];
await ev(() => toggleRouteVisible(routes[0].id)); R.s5_shown = (await snap()).routes[0];

// 6. КП: переставить первую вниз, удалить вторую
await ev(() => moveRoutePoint(routes[0].id, 0, 1)); R.s6_moved = (await snap()).routes[0];
await ev(() => deleteRoutePoint(routes[0].id, 1)); R.s6_deleted = (await snap()).routes[0];
await closeModals();

// 7. второй маршрут: точки 5 и 6, затем «Отмена» — маршрута нет, линия убрана
await ev(() => startNewRoute()); await closeModals();
for (const i of [5, 6]) await clickWp(i);
R.s7_drawing = await snap();
await ev(() => cancelRouteDraw()); await page.waitForTimeout(200); await closeModals();
R.s7_cancelled = await snap();
R.s7_strayLines = await ev(() => { let n = 0; map.eachLayer(l => { if (l instanceof L.Polyline && !routes.some(r => r.polyline === l) && !tracks.some(t => t.polyline === l)) n++; }); return n; });

// 8. «Скрыть все рабочие объекты» и обратно
await ev(() => toggleAllWorkObjectsVisible()); await page.waitForTimeout(150); R.s8_hidden = await snap();
await ev(() => toggleAllWorkObjectsVisible()); await page.waitForTimeout(150); R.s8_shown = await snap();

// 9. загрузка маршрута из GPX
await ev(() => loadGPXRoutes(`<?xml version="1.0"?><gpx version="1.1" creator="e2e"><rte><name>Из файла</name>
<rtept lat="59.931" lon="30.30"><name>A</name></rtept><rtept lat="59.935" lon="30.32"><name>B</name></rtept>
<rtept lat="59.928" lon="30.33"><name>C</name></rtept></rte></gpx>`, 'e2e.gpx'));
await page.waitForTimeout(200); await closeModals();
R.s9_loaded = await snap();

// 10. очистить все рабочие данные
await ev(() => clearAllDataConfirmed()); await page.waitForTimeout(300);
R.s10_cleared = await snap();
R.s10_leftovers = await ev(() => { let n = 0; map.eachLayer(l => { if (l instanceof L.Polyline) n++; }); return n; });

} catch (e) {
  R.fatal = String(e.message || e).split('\n')[0];
}
R.errors = errors;
process.stdout.write(JSON.stringify(R, null, 1) + '\n');
await close();
if (R.fatal) process.exit(1);
