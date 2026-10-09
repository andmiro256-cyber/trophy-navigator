// GPX из nakarte: трек из нескольких trkseg (Андрей 09.10, план Максима) — куски не склеиваются прямыми через карту.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
const a = html.indexOf('function chainTrackSegments(');
const b = html.indexOf('\n}\n', a) + 3;
// точки — {lat,lng} с distanceTo (метры, равнопромежуточная проекция — для теста достаточно)
const P = (lat, lng) => ({ lat, lng, distanceTo(o) { const k = Math.PI / 180, x = (o.lng - lng) * Math.cos(lat * k) * 111320, y = (o.lat - lat) * 110540; return Math.hypot(x, y); } });
const chainTrackSegments = new Function(html.slice(a, b) + '\nreturn chainTrackSegments;')();
const seg = (...pts) => ({ points: pts.map(([la, lo]) => P(la, lo)), pointsData: pts.map((_, i) => ({ i })) });

test('куски, продолжающие друг друга, — одна линия в любом порядке в файле; общая точка стыка одна', () => {
  const s1 = seg([54.0, 40.0], [54.0, 40.01]);
  const s2 = seg([54.0, 40.01], [54.0, 40.02]);
  const s3 = seg([54.0, 40.0201], [54.0, 40.03]);  // стык ~7 м
  const out = chainTrackSegments([s2, s3, s1]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].points.map(p => p.lng), [40.0, 40.01, 40.02, 40.0201, 40.03]);
  assert.equal(out[0].pointsData.length, out[0].points.length);
});

test('разрыв больше 50 м и развилка — отдельные части, без прямой между ними', () => {
  const s1 = seg([54.0, 40.0], [54.0, 40.01]);
  const far = seg([54.1, 40.5], [54.1, 40.51]);
  const branch = seg([54.0, 40.0], [53.99, 40.0]);  // из того же начала в другую сторону
  const out = chainTrackSegments([s1, far, branch]);
  assert.equal(out.length, 3);
  for (const part of out) for (let i = 1; i < part.points.length; i++) assert.ok(part.points[i - 1].distanceTo(part.points[i]) < 2000);
});

test('loadGPXTracks собирает точки по trkseg и даёт частям имена «— часть N»', () => {
  assert.match(html, /const segNodes = xmlDescendantsByLocalName\(trk, 'trkseg'\);/);
  assert.match(html, /const parts = chainTrackSegments\(segs\)\.filter\(part => part\.points\.length >= 2\);/);
  assert.match(html, /`\$\{name\} — часть \$\{partIndex \+ 1\}`/);
});
