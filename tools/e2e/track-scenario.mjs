#!/usr/bin/env node
// Сквозной сценарий работы с треками настоящей мышью (план MapLibre v3, этап 0б — страховка переноса
// отрисовки треков в адаптер). node tools/e2e/track-scenario.mjs <ui> [план.gpx] > result.json
// (по умолчанию — фикстура F16 plan-15-segments.gpx)
// Результат на чистой 0.9.34 и на ветке должен совпадать.
import { open, screenOf } from './lib.mjs';

const uiDir = process.argv[2];
const planGpx = process.argv[3] || new URL('../../tests/fixtures/map/F16/plan-15-segments.gpx', import.meta.url).pathname;
const { page, ev, errors, close } = await open(uiDir, { extra: { '/_e2e/plan.gpx': planGpx } });
const closeModals = () => ev(() => document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m.id)));
await ev(() => void map.setView([59.93, 30.31], 14, { animate: false }));
const box = await ev(() => { const r = map.getContainer().getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const at = (fx, fy) => [Math.round(box.x + box.w * fx), Math.round(box.y + box.h * fy)];
const midOf = async (ti, i) => {
  const [a, b] = await ev(([ti, i]) => [tracks[ti].points[i], tracks[ti].points[i + 1]].map(p => ({ lat: p.lat, lng: p.lng })), [ti, i]);
  const [ax, ay] = await screenOf(ev, a), [bx, by] = await screenOf(ev, b);
  return [Math.round((ax + bx) / 2), Math.round((ay + by) / 2)];
};
const snap = () => ev(() => ({
  tracks: tracks.map(t => ({ name: t.name, n: t.points.length, segs: (t.pointsData || []).filter((d, i) => i > 0 && d && d.seg).length,
    first: [+t.points[0].lat.toFixed(6), +t.points[0].lng.toFixed(6)], last: [+t.points[t.points.length - 1].lat.toFixed(6), +t.points[t.points.length - 1].lng.toFixed(6)],
    onMap: !!t.polyline && map.hasLayer(t.polyline), visible: t.visible !== false, markersOnMap: (t.markers || []).filter(m => map.hasLayer(m)).length })),
  selected: tracks.findIndex(t => t.id === selectedTrackId), mode: currentMode, editing: !!currentTrackEdit,
  menus: ['ctx-menu', 'ctx-menu-map', 'ctx-menu-track'].filter(id => document.getElementById(id).classList.contains('open')),
  modals: [...document.querySelectorAll('.modal-overlay.active')].map(m => m.id),
  toast: (document.getElementById('toast')?.textContent || '').trim(),
  popups: [...document.querySelectorAll('.leaflet-popup')].map(p => p.className.replace(/\s*leaflet-zoom-animated/, '')),
}));
const R = {};

// 1. загрузка плана из кусков (GPX с несколькими trkseg); точки трека ещё ни разу не показывались
await ev(async () => { loadGPXTracks(await (await fetch('/_e2e/plan.gpx')).text(), 'plan.gpx', { silent: true }); });
await closeModals();
// середина плана: отрезки M..M+1 и M+5..M+6 внутри одного куска (без разрывов trkseg)
const M = await ev(() => { const t = tracks[0], brk = i => !!t.pointsData?.[i]?.seg;
  for (let i = Math.floor(t.points.length / 2); i < t.points.length - 7; i++) if (![1, 2, 3, 4, 5, 6].some(k => brk(i + k))) return i; return -1; });
await ev(M => { const p = tracks[0].points; map.setView([(p[M].lat + p[M + 6].lat) / 2, (p[M].lng + p[M + 6].lng) / 2], 14, { animate: false }); }, M);
R.s1_load = await snap();

// 2. клик по линии плана между точками — попап точки или окно треков
{ const [x, y] = await midOf(0, M); R.s2_target = await ev(([x, y]) => document.elementFromPoint(x, y)?.tagName, [x, y]); await page.mouse.click(x, y); await page.waitForTimeout(300); }
R.s2_click = await snap();
await closeModals(); await ev(() => { map.closePopup(); });

// 3. правый клик по линии → меню трека; «Разбить» вне правки — отказ с подсказкой
{ const [x, y] = await midOf(0, M); await page.mouse.click(x, y, { button: 'right' }); await page.waitForTimeout(250); }
R.s3_menu = await snap();
await page.evaluate(() => ctxTrackAction('split')); await page.waitForTimeout(300);
R.s3_splitOutsideEdit = await snap();

// 3б. правка плана: клик по линии — вставка точки; ПКМ по линии → «Разбить здесь»; выход из правки
await ev(() => { selectTrackById(tracks[0].id); startTrackEdit(); }); await closeModals();
{ const [x, y] = await midOf(0, M); await page.mouse.click(x, y); await page.waitForTimeout(300); }
R.s3b_insert = await snap();
{ const [x, y] = await midOf(0, M + 5); await page.mouse.click(x, y, { button: 'right' }); await page.waitForTimeout(250); }
R.s3b_menu = await snap();
await page.evaluate(() => { if (document.getElementById('ctx-menu-track').classList.contains('open')) ctxTrackAction('split'); }); await page.waitForTimeout(300);
await closeModals(); await ev(() => { map.closePopup(); if (currentTrackEdit) finishTrackEdit(); }); await closeModals();
R.s3b_split = await snap();

// 4. рисование кликами (центр карты, мимо панели построения), двойной щелчок — завершить
await ev(() => void map.setView([59.93, 30.31], 14, { animate: false }));
await ev(() => startNewTrack()); await closeModals();
for (const [fx, fy] of [[0.36, 0.3], [0.42, 0.4], [0.48, 0.32], [0.54, 0.45]]) { const [x, y] = at(fx, fy); await page.mouse.click(x, y); await page.waitForTimeout(120); }
{ const [x, y] = at(0.54, 0.45); await page.mouse.dblclick(x, y); await page.waitForTimeout(400); }
await closeModals(); await ev(() => { map.closePopup(); });
R.s4_draw = await snap();
const D = R.s4_draw.tracks.length - 1;
await ev(D => { window.__D = D; }, D);  // индекс нарисованного трека для кода страницы

// 4б. ошибка 0.9.34: после первого показа точек трека их пустой холст лежит поверх холста линий,
// ПКМ по линии уходит в меню карты. Фиксируется как исходное поведение (паритет), см. наблюдения.
{ const [x, y] = await midOf(D, 1); await page.mouse.click(x, y, { button: 'right' }); await page.waitForTimeout(250); }
R.s4b_menuAfterMarkers = await snap();
await ev(() => closeCtxMenu());

// 5. правка трека 0: перетащить вершину 1, вставить точку кликом по линии, удалить точку через меню
await ev(() => { map.closePopup(); selectTrackById(tracks[__D].id); startTrackEdit(); }); await closeModals();
{ const [x, y] = await screenOf(ev, await ev(() => ({ lat: tracks[__D].points[1].lat, lng: tracks[__D].points[1].lng })));
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 30, y - 25, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(250); }
R.s5_dragVertex = await snap();
if (await ev(() => tracks[__D].points.length) >= 2) { const [x, y] = await midOf(D, 2); await page.mouse.click(x, y); await page.waitForTimeout(250); }
R.s5_insert = await snap();
{ const [x, y] = await screenOf(ev, await ev(() => ({ lat: tracks[__D].points[1].lat, lng: tracks[__D].points[1].lng })));
  await page.mouse.click(x, y, { button: 'right' }); await page.waitForTimeout(250); }
await page.evaluate(() => { if (document.getElementById('ctx-menu-track').classList.contains('open')) ctxTrackAction('delete'); }); await page.waitForTimeout(250);
R.s5_deletePoint = await snap();
await ev(() => finishTrackEdit()); await closeModals();
R.s5_finish = await snap();

// 6. «Обзор»: потянуть за линию трека 0 — в месте захвата трек ломается и идёт за мышью
await ev(() => setMode('hand'));
{ const [x, y] = await midOf(D, 0); await page.mouse.move(x, y); await page.waitForTimeout(150); await page.mouse.down(); await page.mouse.move(x + 20, y + 35, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300); }
R.s6_reshape = await snap();

// 7. точки трека на крупном масштабе (detail zoom 17)
await ev(() => { const p = tracks[__D].points[0]; map.setView([p.lat, p.lng], 17.5, { animate: false }); });
await page.waitForTimeout(500);
R.s7_detail = await snap();
await ev(() => void map.setView([59.93, 30.31], 14, { animate: false }));

// 8. скрыть/показать, развернуть, удалить
await ev(() => toggleTrackVisible(tracks[__D].id)); R.s8_hidden = await snap();
await ev(() => toggleTrackVisible(tracks[__D].id)); R.s8_shown = await snap();
await ev(() => { selectTrackById(tracks[__D].id); reverseSelectedTrack(); }); await closeModals(); R.s8_reverse = await snap();
await ev(() => deleteTrackById(tracks[0].id)); await closeModals(); R.s8_delete = await snap();
R.s8_leftoverLines = await ev(() => { let n = 0; map.eachLayer(l => { if (l instanceof L.Polyline && !(l instanceof L.Polygon)) n++; }); return n; });

R.errors = errors;
process.stdout.write(JSON.stringify(R, null, 1) + '\n');
await close();
