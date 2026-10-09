// GPX из nakarte: трек из нескольких trkseg (Андрей 09.10, план Максима) — куски не склеиваются прямыми через карту.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
// Помощники «трек из кусков» — из index.html как есть
const h0 = html.indexOf('function isTrackSegStart(t, i)');
const h1 = html.indexOf('function createTrackPolylineLayer(', h0);
const { isTrackSegStart, trackLatLngs } = new Function(html.slice(h0, h1) + '\nreturn { isTrackSegStart, trackLatLngs };')();
const P = (lat, lng) => ({ lat, lng });

test('трек без разрывов — одна линия как раньше; с разрывами — куски без прямых между ними', () => {
  const pts = [P(54, 40), P(54, 40.01), P(54.1, 40.5), P(54.1, 40.51), P(54.2, 40.6)];
  assert.equal(trackLatLngs({ points: pts, pointsData: pts.map(() => ({})) }), pts);
  const t = { points: pts, pointsData: [{}, {}, { seg: 1 }, {}, { seg: 1 }] };
  assert.deepEqual(trackLatLngs(t), [[pts[0], pts[1]], [pts[2], pts[3]], [pts[4]]]);
  assert.equal(isTrackSegStart(t, 2), true);
  assert.equal(isTrackSegStart(t, 0), false, 'первая точка — не разрыв');
  assert.equal(isTrackSegStart({ points: pts, pointsData: [{ seg: 1 }] }, 0), false);
});

test('GPX: все trkseg трека — один трек, начало куска помечено; скорость через разрыв не считается', () => {
  assert.match(html, /const segNodes = xmlDescendantsByLocalName\(trk, 'trkseg'\);/);
  assert.match(html, /flat\.pointsData\.push\(si > 0 && k === 0 && flat\.points\.length \? \{ \.\.\.seg\.pointsData\[k\], seg: 1 \} : seg\.pointsData\[k\]\);/);
  assert.doesNotMatch(html, /chainTrackSegments|— часть \$\{/);
  assert.match(html, /t\.pointsData = pointsData;\n    if \(t\.polyline\) t\.polyline\.setLatLngs\(trackLatLngs\(t\)\);/);
  assert.match(html, /pointsData\[i\]\.speed == null && !pointsData\[i\]\.seg/);
});

test('отрисовка, длина и выгрузка в GPX учитывают разрывы', () => {
  assert.doesNotMatch(html, /polyline\.setLatLngs\((t|track)\.points\)/, 'все обновления линии трека — через trackLatLngs');
  assert.match(html, /if \(!isTrackSegStart\(t, i\)\) d \+= t\.points\[i-1\]\.distanceTo\(t\.points\[i\]\);/);
  assert.equal((html.match(/if \(isTrackSegStart\(t, i\)\) gpx \+= /g) || []).length, 3, 'три выгрузки GPX рвут trkseg');
});

test('кнопки окна переносятся на следующую строку, а не уезжают за край (редактор трека, Андрей 09.10)', () => {
  assert.match(html, /\.btn-row \{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; justify-content: flex-end; \}/);
});

test('своя ручка размера окна (Linux: за уголок CSS resize не ухватиться, Андрей 09.10)', () => {
  assert.match(html, /function tndAddResizeGrip\(el\)/);
  assert.match(html, /ids\.filter\(el => el\.classList\.contains\('modal'\)\)\.forEach\(tndAddResizeGrip\);/);
  assert.match(html, /\.tnd-grip \{ position: absolute; right: 0; bottom: 0; width: 22px; height: 22px; z-index: 20; cursor: nwse-resize;/);
  assert.match(html, /el\.style\.resize = 'none';/);
});

test('клик по треку в списке — карта переходит к нему, окно не закрывает трек (Андрей 09.10)', () => {
  assert.match(html, /onclick="selectTrackById\(\$\{t\.id\}\);focusTrackOnMap\(\$\{t\.id\}\)"/);
  assert.match(html, /function focusTrackOnMap\(id\)/);
  assert.match(html, /map\.fitBounds\(L\.latLngBounds\(t\.points\), \{ paddingTopLeft: \[left, 30\], paddingBottomRight: \[right, 30\], maxZoom: 16 \}\)/);
});
