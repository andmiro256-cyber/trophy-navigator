#!/usr/bin/env node
// Сверка 3D-оверлея и кнопки «3D» (план MapLibre v3, этап 0б — перевод trophynav-3d.js на фасад TnMap).
// node tools/e2e/overlay3d-scenario.mjs <ui> [план.gpx] > result.json — на чистой версии и на ветке должно совпадать.
import { open } from './lib.mjs';

const planGpx = process.argv[3] || new URL('../../tests/fixtures/map/F16/plan-15-segments.gpx', import.meta.url).pathname;
const { page, ev, errors, close } = await open(process.argv[2] || 'ui', { extra: { '/_e2e/plan.gpx': planGpx } });
const R = {};
try {
  await ev(() => map.setView([59.93, 30.31], 13, { animate: false }));
  const box = await ev(() => { const r = map.getContainer().getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const at = (fx, fy) => [Math.round(box.x + box.w * fx), Math.round(box.y + box.h * fy)];
  // точки, трек из кусков, маршрут по точкам, скрытый трек
  await ev(() => toggleMode('waypoint'));
  for (const [fx, fy] of [[0.3, 0.3], [0.45, 0.6], [0.6, 0.35]]) { await page.mouse.click(...at(fx, fy)); await page.waitForTimeout(120); }
  await ev(() => setMode('hand'));
  await ev(async () => { loadGPXTracks(await (await fetch('/_e2e/plan.gpx')).text(), 'plan.gpx', { silent: true }); });
  await ev(() => {
    createRouteFromPoints(waypoints.map(m => m.getLatLng()), 'Р', waypoints.map(m => m.wpData.name));
    createTrackFromPoints([{ lat: 59.92, lng: 30.30 }, { lat: 59.925, lng: 30.32 }].map(p => L.latLng(p.lat, p.lng)), 'Скрытый', { visible: false });
    document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m.id));
  });
  const norm = o => ({
    lines: o.lines.map(f => ({ ...f.properties, n: f.geometry.coordinates.length, first: f.geometry.coordinates[0].map(v => +v.toFixed(6)) })),
    points: o.points.map(f => ({ ...f.properties, at: f.geometry.coordinates.map(v => +v.toFixed(6)) })),
  });
  R.overlay = await ev(() => JSON.parse(JSON.stringify(window.TrophyNav3D.collectOverlay())));
  R.overlay = norm(R.overlay);
  R.button = await ev(() => { const a = document.querySelector('.tn3d-control a'); return a && { text: a.textContent, title: a.title, box: a.parentElement.className, corner: !!a.closest('.leaflet-top.leaflet-left') }; });
  // клик по «3D» до карты не доходит (без WebGL в этом окружении — только сообщение)
  await ev(() => { window.__mapClicks = 0; map.on('click', () => window.__mapClicks++); });
  { const [x, y] = await ev(() => { const r = document.querySelector('.tn3d-control a').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; }); await page.mouse.click(x, y); await page.waitForTimeout(300); }
  R.mapClicksAfter3d = await ev(() => window.__mapClicks);
} catch (e) { R.fatal = String(e.message || e).split('\n')[0]; }
R.errors = errors;
process.stdout.write(JSON.stringify(R, null, 1) + '\n');
await close();
if (R.fatal) process.exit(1);
