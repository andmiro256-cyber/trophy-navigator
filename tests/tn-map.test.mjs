// Фасад TnMap + Leaflet-адаптер (план MapLibre v3, R1, 0б.5): нейтральные значения наружу, мусор не доходит до движка.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }
const needDom = { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' };
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
// объекты из окна jsdom — другой realm: сравниваем по JSON
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);

function boot() {
  const dom = new JSDOM('<!doctype html><body><div id="map" style="width:800px;height:600px"></div></body>', { pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  // jsdom не считает раскладку — размер контейнера задаём явно
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return this.id === 'map' ? 800 : 0; } });
  Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return this.id === 'map' ? 600 : 0; } });
  for (const f of ['../ui/leaflet.js', '../ui/tn-geo.js', '../ui/tn-map.js', '../ui/tn-map-leaflet.js']) w.eval(read(f));
  const map = w.L.map('map', { zoomAnimation: false, fadeAnimation: false }).setView([55.75, 37.62], 10);
  const tn = w.TnMap.create(w.TnMapLeaflet.create(map));
  return { w, map, tn, close: () => w.close() };
}

test('адаптер без нужных методов не принимается', () => {
  const TnMap = require('../ui/tn-map.js');
  assert.throws(() => TnMap.create({ engine: 'x', getView() {} }), /не хватает/);
});

test('вид и камера: простые {lat,lng}, зум Z256; мусор — ошибка, карта не двигается', needDom, () => {
  const { tn, close } = boot();
  try {
    assert.equal(tn.engine, 'leaflet');
    const v = tn.getView();
    assert.equal(Object.keys(v.center).sort().join(), 'lat,lng');
    assert.equal(typeof v.center.distanceTo, 'undefined', 'не L.LatLng');
    tn.setView({ center: { lat: 0, lng: 0 }, zoom: 5 }, { animate: false });
    same(tn.getCenter(), { lat: 0, lng: 0 });
    assert.equal(tn.getZoom(), 5);
    assert.throws(() => tn.setView({ center: { lat: null, lng: 0 }, zoom: 5 }), /невалидная точка/);
    assert.throws(() => tn.setView({ center: { lat: 1, lng: 1 }, zoom: NaN }), /зум не число/);
    same(tn.getCenter(), { lat: 0, lng: 0 });
    tn.panTo({ lat: 10, lng: 20 }, { animate: false });
    // Leaflet сдвигает на целые пиксели — центр в пределах пикселя от цели
    const a = tn.project(tn.getCenter()), b = tn.project({ lat: 10, lng: 20 });
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) <= 1);
  } finally { close(); }
});

test('проекция без округления: туда-обратно точно, от latLngToContainerPoint < 0.5 px', needDom, () => {
  const { map, tn, close } = boot();
  try {
    for (const z of [3, 10.37, 17.2]) {
      tn.setView({ center: { lat: 59.93, lng: 30.31 }, zoom: z }, { animate: false });
      const p = { lat: 59.9312345, lng: 30.3154321 };
      const pt = tn.project(p);
      const back = tn.unproject(pt);
      assert.ok(Math.abs(back.lat - p.lat) < 1e-10 && Math.abs(back.lng - p.lng) < 1e-10);
      const ref = map.latLngToContainerPoint([p.lat, p.lng]);
      // Leaflet округляет каждую ось до целого — до 0.5 px по оси
      assert.ok(Math.abs(ref.x - pt.x) <= 0.5 + 1e-9 && Math.abs(ref.y - pt.y) <= 0.5 + 1e-9, `z${z}`);
    }
  } finally { close(); }
});

test('fitBounds по списку точек или паре углов; getBounds — [sw, ne] простыми точками', needDom, () => {
  const { tn, close } = boot();
  try {
    const pts = [{ lat: 55.0, lng: 37.0 }, { lat: 55.2, lng: 37.6 }, { lat: 54.9, lng: 37.3 }];
    tn.fitBounds(pts, { padding: 20, animate: false });
    const [sw, ne] = tn.getBounds();
    for (const p of pts) assert.ok(p.lat >= sw.lat && p.lat <= ne.lat && p.lng >= sw.lng && p.lng <= ne.lng);
    // трек из двух точек «не по порядку» — та же рамка, что и у пары углов
    const two = [{ lat: 55.2, lng: 37.0 }, { lat: 55.0, lng: 37.6 }];
    tn.fitBounds(two, { animate: false });
    const [sw2, ne2] = tn.getBounds();
    assert.ok(sw2.lat <= 55.0 && ne2.lat >= 55.2 && sw2.lng <= 37.0 && ne2.lng >= 37.6);
    assert.throws(() => tn.fitBounds([], {}), /пустая рамка/);
    same(require('../ui/tn-map.js').boundsOf([{ lat: 1, lng: 5 }, { lat: 3, lng: 2 }], 't'), [{ lat: 1, lng: 2 }, { lat: 3, lng: 5 }]);
  } finally { close(); }
});

test('события: нейтральная нагрузка, отписка; неизвестное событие — ошибка', needDom, () => {
  const { map, tn, close, w } = boot();
  try {
    const got = [];
    const off = tn.on('click', e => got.push(e));
    map.fire('click', { latlng: w.L.latLng(1, 2), containerPoint: w.L.point(3, 4), originalEvent: { type: 'click' } });
    same(got[0].latlng, { lat: 1, lng: 2 });
    same(got[0].point, { x: 3, y: 4 });
    off();
    map.fire('click', { latlng: w.L.latLng(1, 2) });
    assert.equal(got.length, 1);
    assert.throws(() => tn.on('nonsense', () => {}), /неизвестное событие/);
    let moved = 0;
    tn.on('moveend', () => moved++);
    tn.setView({ center: { lat: 1, lng: 1 }, zoom: 4 }, { animate: false });
    assert.ok(moved >= 1);
  } finally { close(); }
});
