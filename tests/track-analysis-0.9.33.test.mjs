// 0.9.33: анализ трека (ui/tn-track-analysis.js) — ряды высоты/скорости/уклона, полная статистика,
// остановки, отрезки по километрам, раскраска, панель с графиком и действия с участком.
// DOM-проверки — jsdom (NODE_PATH=…/node_modules).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const js = read('../ui/tn-track-analysis.js');
const html = read('../ui/index.html');
const require = createRequire(import.meta.url);
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }
const needDom = { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' };
const wait = ms => new Promise(r => setTimeout(r, ms));
const opened = [];
test.after(() => { for (const w of opened) try { w.close(); } catch { /* уже закрыто */ } });

async function boot(globals = '') {
  const dom = new JSDOM('<!doctype html><body><div id="map" style="width:1200px;height:700px"></div></body>',
    { url: 'https://review.invalid/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  opened.push(w);
  w.eval(read('../ui/tn-icons.js'));
  if (globals) w.eval(globals);
  w.eval(js);
  await wait(10);
  return w;
}
const J = x => JSON.parse(JSON.stringify(x));

// Фикстура: на север по меридиану, точка каждые 0.001° (111.2 м) за 30 с = 13.3 км/ч;
// после 10-й точки стоянка 3 мин (та же точка, время идёт); высота +1 м на точку, затем спуск.
const T0 = Date.parse('2026-10-08T08:00:00Z');
function fixture() {
  const pts = [], pd = [];
  let t = T0, lat = 60;
  for (let i = 0; i < 31; i++) {
    if (i > 0) { lat += 0.001; t += 30000; }
    pts.push({ lat, lng: 30 });
    pd.push({ time: new Date(t).toISOString(), ele: 100 + (i <= 20 ? i : 40 - i) });
    if (i === 10) { // стоянка: 6 точек на месте по 30 с
      for (let k = 0; k < 6; k++) { t += 30000; pts.push({ lat, lng: 30 }); pd.push({ time: new Date(t).toISOString(), ele: 110 }); }
    }
  }
  return { pts, pd };
}
const STEP = 111.195; // м на 0.001° широты

test('ряды и статистика: время в движении и на стоянке, скорости, высоты, крутизна, остановки', needDom, async () => {
  const w = await boot();
  const C = w.TnTrackAnalysis.calc;
  const { pts, pd } = fixture();
  const S = C.series(pts, pd);
  assert.equal(S.n, 37);
  assert.ok(S.hasTime && S.hasEle);
  assert.ok(Math.abs(S.dist[S.n - 1] - 30 * STEP) < 0.5);
  // скорость на ровном ходу 13.3 км/ч, на стоянке 0
  assert.ok(Math.abs(S.speed[3] - STEP / 30 * 3.6) < 0.1, `speed ${S.speed[3]}`);
  assert.ok(S.speed[13] < 0.5, `стоянка ${S.speed[13]}`);
  // уклон: +1 м на 111 м = +0.9 %, на спуске −0.9 %
  assert.ok(Math.abs(S.slope[5] - 100 / STEP) < 0.05, `slope ${S.slope[5]}`);
  assert.ok(Math.abs(S.slope[33] + 100 / STEP) < 0.05, `slope ${S.slope[33]}`);
  const s = C.stats(S);
  assert.equal(s.totalMs, 36 * 30000);
  assert.equal(s.stoppedMs, 6 * 30000);
  assert.equal(s.movingMs, 30 * 30000);
  assert.ok(Math.abs(s.movingKmh - STEP / 30 * 3.6) < 0.05);
  assert.ok(Math.abs(s.avgKmh - (30 * STEP / 1000) / (36 * 30 / 3600)) < 0.05);
  assert.ok(Math.abs(s.maxKmh - 13.34) < 0.2);
  deepEq(s, { eleMin: 100, eleMax: 120, up: 20, down: 10 });
  assert.ok(s.climbPct > 0.85 && s.descentPct < -0.85);
  assert.equal(s.stops.length, 1);
  assert.equal(s.stops[0].durMs, 180000);
  assert.equal(s.stops[0].startMs, T0 + 10 * 30000);
  // участок: только подъём 5..10 — 5 отрезков, +5 м, средний уклон +0.9 %
  const seg = C.stats(S, 5, 10);
  assert.ok(Math.abs(seg.distM - 5 * STEP) < 0.1);
  assert.equal(seg.totalMs, 150000);
  assert.equal(seg.up, 4); // гистерезис 2 м: 105→107→109, последний метр не набран
  assert.ok(Math.abs(seg.avgSlopePct - 100 / STEP) < 0.01);
  assert.equal(seg.stops.length, 0);
});
function deepEq(obj, part) { for (const [k, v] of Object.entries(part)) assert.equal(obj[k], v, k); }

test('по километрам, трек без времени и высот, ближайший индекс, деления, шкала раскраски', needDom, async () => {
  const w = await boot();
  const C = w.TnTrackAnalysis.calc;
  const { pts, pd } = fixture();
  const S = C.series(pts, pd);
  const km = J(C.kmSplits(S));
  assert.equal(km.length, 4); // 3336 м: три полных и хвост
  assert.equal(km[0].km, 1);
  assert.ok(Math.abs(km[0].durMs - 1000 / STEP * 30000) < 1000, `км 1: ${km[0].durMs}`);
  assert.ok(km[1].durMs > km[0].durMs + 170000, 'во втором километре стоянка 3 мин');
  assert.ok(km[3].toM - km[3].fromM < 1000);
  // без времени и высот: ряды пустые, статистика без времени, отрезки без длительности
  const bare = C.series(pts, []);
  assert.equal(bare.hasTime, false); assert.equal(bare.hasEle, false);
  const sb = J(C.stats(bare));
  assert.equal(sb.totalMs, null); assert.equal(sb.up, null); assert.equal(sb.maxKmh, null);
  assert.ok(C.kmSplits(bare).every(k => k.durMs === null));
  // записанная скорость (м/с) важнее вычисленной
  const withSpeed = pd.map((p, i) => (i === 3 ? { ...p, speed: 10 } : p));
  assert.equal(C.series(pts, withSpeed).speed[3], 36);
  assert.equal(C.nearestIndex([0, 10, 20, 30], 14), 1);
  assert.equal(C.nearestIndex([0, 10, 20, 30], 16), 2);
  assert.equal(C.nearestIndex([0, 10, 20, 30], 99), 3);
  assert.deepEqual(J(C.niceTicks(0, 100, 4)), [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(J(C.niceTicks(103, 187, 4)), [120, 140, 160, 180]);
  // шкала по 5–95 перцентилю: выброс 500 не растягивает её
  const r = J(C.rampRange([...Array(98).fill(0).map((_, i) => 10 + i % 10), 500, -400]));
  assert.ok(r[0] >= 10 && r[1] <= 19, JSON.stringify(r));
  assert.match(C.rampColor(0), /^hsl\(220,/);
  assert.match(C.rampColor(1), /^hsl\(0,/);
  // раскраска: отрезки одного цвета склеены
  const runs = C.coloredRuns(S, 'ele');
  assert.ok(runs.length > 2 && runs.length < S.n - 1, `runs ${runs.length}`);
  assert.equal(runs.reduce((n, x) => n + x.pts.length - 1, 0), S.n - 1, 'все отрезки на месте');
});

// ─── Панель в jsdom с заглушками приложения ───
const APP = `
  var undoStack = [];
  var map = { _layers: new Set(), on(ev, fn) { (this._h ||= {})[ev] = fn; }, getContainer() { return document.getElementById('map'); },
    hasLayer(l) { return this._layers.has(l); }, removeLayer(l) { this._layers.delete(l); }, panTo(p) { this.panned = p; },
    latLngToContainerPoint(p) { return { x: (p.lng - 30) * 100000, y: (60.1 - p.lat) * 100000 }; } };
  window.L = {
    circleMarker(p) { return { p, setLatLng(q) { this.p = q; }, addTo(m) { m._layers.add(this); return this; } }; },
    polyline(pts, o) { return { pts, o }; },
    layerGroup(ls) { return { ls, addTo(m) { m._layers.add(this); return this; } }; },
  };
  var trackCanvasRenderer = null;
  var tracks = [], selectedTrackId = null, nextId = 1;
  function mk(points, name, pointsData) {
    const t = { id: nextId++, name, points: points.map(p => ({ ...p })), pointsData: pointsData || [], width: 3, color: '#000000',  // theme-check: data
      polyline: { style: {}, setStyle(s) { Object.assign(this.style, s); } }, updatedAt: 'a' };
    tracks.push(t); return t;
  }
  function createTrackFromPoints(points, name) { return mk(points, name); }
  function removeTrackObject(t) { tracks = tracks.filter(x => x !== t); }
  function touchTrack(t) { t.updatedAt = 'b' + Math.random(); }
  function pushUndo(a) { undoStack.push(a); }
  function snapshotTrackGeometry(t) { return { points: t.points.slice(), pointsData: t.pointsData.slice() }; }
  function restoreTrackGeometry(t, s) { t.points = s.points.slice(); t.pointsData = s.pointsData.slice(); }
  function cloneTrackPointsData(a) { return a.map(o => ({ ...o })); }
  var toasts = []; function showToast(m) { toasts.push(m); }
  function updateTrackList() {} function saveState() {}`;

test('панель: открытие, статистика, график, выделение участка и действия с отменой', needDom, async () => {
  const w = await boot(APP);
  const { pts, pd } = fixture();
  const t = w.mk(pts, 'Утро', pd);
  const A = w.TnTrackAnalysis;
  A.open(t.id);
  const p = w.document.getElementById('tn-track-analysis');
  assert.equal(p.hidden, false);
  assert.ok(w.document.body.classList.contains('tna-open'));
  assert.match(p.querySelector('[data-tna="title"]').textContent, /Анализ: Утро/);
  const stats = p.querySelector('[data-tna="stats"]').textContent;
  assert.match(stats, /В движении15 мин/);
  assert.match(stats, /На стоянках3 мин/);
  assert.match(stats, /Набор \/ сброс\+20 \/ −10 м/);
  assert.match(stats, /Остановки: 1/);
  assert.match(stats, /По километрам: 4/);
  // переключатели
  p.querySelector('[data-tna-metric="speed"]').click();
  assert.equal(A._st.metric, 'speed');
  p.querySelector('[data-tna-axis="time"]').click();
  assert.equal(A._st.axis, 'time');
  // наведение на график → точка на карте
  A._setHover(5);
  const marker = [...w.map._layers].find(l => l.p);
  assert.equal(marker.p.lat, pts[5].lat);
  // выделение 5..10 → строка участка с действиями
  A._st.sel = [5, 10];
  p.querySelector('[data-tna-stop="0"]').click(); // клик по остановке выделяет её
  assert.deepEqual(J(A._st.sel), [10, 16]);
  A._st.sel = [5, 10];
  A._segmentAction('extract');
  assert.equal(w.tracks.length, 2);
  assert.equal(w.tracks[1].name, 'Утро — участок');
  assert.equal(w.tracks[1].points.length, 6);
  assert.equal(w.tracks[1].pointsData[0].ele, 105);
  assert.equal(w.undoStack.at(-1).type, 'createTrack');
  // обрезать по участку — геометрия трека с отменой
  A._st.sel = [5, 10];
  A._segmentAction('trim');
  assert.equal(t.points.length, 6);
  assert.equal(w.undoStack.at(-1).type, 'trackGeometry');
  assert.equal(w.undoStack.at(-1).snapshot.points.length, 37);
  // разрезать: участок в середине → три трека, анализ переходит на средний
  w.restoreTrackGeometry(t, w.undoStack.at(-1).snapshot);
  A.open(t.id);
  A._st.sel = [5, 10];
  A._segmentAction('split');
  const parts = w.tracks.filter(x => /^Утро \(\d\)$/.test(x.name));
  assert.deepEqual(J(parts.map(x => x.points.length)), [6, 6, 27]);
  assert.equal(w.undoStack.at(-1).type, 'splitTrack');
  assert.equal(A._st.trackId, parts[1].id);
  // весь трек выделен — обрезать нечего
  A._st.sel = [0, parts[1].points.length - 1];
  A._segmentAction('trim');
  assert.match(w.toasts.at(-1), /обрезать нечего/);
  // раскраска по высоте: слой поверх, исходная линия бледнее; закрытие всё убирает
  A._st.color = 'ele';
  A._applyColoring();
  const group = [...w.map._layers].find(l => l.ls);
  assert.ok(group && group.ls.length > 0);
  assert.equal(parts[1].polyline.style.opacity, 0.25);
  A.close();
  assert.equal(p.hidden, true);
  assert.equal(w.map._layers.has(group), false);
  assert.equal(parts[1].polyline.style.opacity, 0.85);
  assert.equal(w.document.body.classList.contains('tna-open'), false);
});

test('карта → график: курсор у трека двигает указатель, далеко — нет', needDom, async () => {
  const w = await boot(APP);
  const { pts, pd } = fixture();
  const t = w.mk(pts, 'Утро', pd);
  w.TnTrackAnalysis.open(t.id);
  w.map._h.mousemove({ latlng: { lat: pts[20].lat + 0.00005, lng: 30 } });
  await wait(40);
  assert.equal(w.TnTrackAnalysis._st.hover, 20);
  w.map._h.mousemove({ latlng: { lat: 61, lng: 31 } });
  await wait(40);
  assert.equal(w.TnTrackAnalysis._st.hover, -1);
});

test('index.html: модуль подключён, кнопка «Анализ трека», выбор трека переключает анализ, отмена «отдельно»', () => {
  assert.match(html, /<script src="tn-widgets\.js"><\/script>\n<script src="tn-track-analysis\.js"><\/script>/);
  assert.match(html, /id="btn-track-analysis" onclick="closeModal\('modal-tracks'\);window\.TnTrackAnalysis\?\.open\(selectedTrackId\)"/);
  assert.match(html, /updateTrackList\(\);\n {2}window\.TnTrackAnalysis\?\.onSelect\(id\);/);
  assert.match(html, /action\.type === 'createTrack'\) \{[\s\S]{0,120}removeTrackObject\(action\.track\)/);
  assert.doesNotMatch(js, /\p{Extended_Pictographic}/u);
  assert.doesNotMatch(js, /cdn\.|https?:\/\//, 'без сети: графики своим canvas');
});

test('уклон: дрейф высоты GPS на стоянке не даёт «крутого подъёма» на ровном месте', needDom, async () => {
  const w = await boot();
  const C = w.TnTrackAnalysis.calc;
  const pts = [], pd = [];
  let lat = 60, t = T0;
  for (let i = 0; i < 30; i++) {
    lat += 0.0003; t += 10000; pts.push({ lat, lng: 30 }); pd.push({ time: new Date(t).toISOString(), ele: 100 });
    if (i === 15) for (let k = 0; k < 20; k++) { t += 10000; pts.push({ lat, lng: 30 }); pd.push({ time: new Date(t).toISOString(), ele: 100 + (k % 2 ? 6 : -6) }); }
  }
  const s = C.stats(C.series(pts, pd));
  assert.ok(Math.abs(s.climbPct) < 3 && Math.abs(s.descentPct) < 3, `climb ${s.climbPct} descent ${s.descentPct}`);
});

test('трек из кусков (GPX trkseg): расстояние без прыжка через разрыв (Андрей 09.10)', needDom, async () => {
  const w = await boot();
  const C = w.TnTrackAnalysis.calc;
  const pts = [{ lat: 60, lng: 30 }, { lat: 60.001, lng: 30 }, { lat: 61, lng: 30 }, { lat: 61.001, lng: 30 }];
  const S1 = C.series(pts, [{}, {}, {}, {}]);
  const S2 = C.series(pts, [{}, {}, { seg: 1 }, {}]);
  assert.ok(S1.dist[3] > 100000, 'без разрыва — со 111 км прыжка');
  assert.ok(Math.abs(S2.dist[3] - 2 * STEP) < 1, `с разрывом — только два отрезка по ~111 м, а не ${S2.dist[3]}`);
});
