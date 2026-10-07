import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import '../ui/trophynav-maps-core.js';

const Core = globalThis.TrophyNavMapsCore;
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const template = read('../ui/vector/style-liberty.json');
const topo = JSON.parse(read('../ui/vector/theme-topo.json'));
const contrast = JSON.parse(read('../ui/vector/theme-contrast.json'));
const BASE = 'tnmap://localhost';

// ─── VectorPoiFilterTest (Android) ───
test('all icons shown leaves the style alone', () => {
  assert.equal(Core.poiCondition(Core.parsePoi('all')), null);
  assert.equal(Core.poiCondition(Core.parsePoi(null)), null);
});

test('icon pref round trip', () => {
  assert.equal(Core.formatPoi(Core.POI_ALL), 'all');
  assert.equal(Core.formatPoi([]), 'none');
  assert.equal(Core.formatPoi(['water', 'auto']), 'auto,water');
  assert.deepEqual([...Core.parsePoi('auto,water,junk')], ['auto', 'water']);
});

test('selected groups become a class filter; «other» means not in any group', () => {
  assert.deepEqual(Core.poiCondition(['auto', 'water']),
    ['in', 'class', 'fuel', 'car', 'parking', 'bicycle', 'drinking_water', 'toilets']);
  const c = Core.poiCondition(['stay', 'other']);
  assert.equal(c[0], 'any');
  assert.equal(c[2][0], '!in');
  assert.equal(Core.poiCondition(['other'])[0], '!in');
  assert.deepEqual(Core.poiCondition([]), ['==', 'class', '\u0000none']);
});

test('combine keeps the layer filter', () => {
  const layer = ['all', ['==', '$type', 'Point'], ['>=', 'rank', 20]];
  const out = Core.combineFilter(layer, Core.poiCondition([]));
  assert.equal(out[0], 'all');
  assert.deepEqual(out[1], layer);
});

// ─── VectorTheme.applyThemeLayers ───
test('theme patches, removes and inserts layers in Android order', () => {
  const base = [{ id: 'a', paint: { x: 1 } }, { id: 'b' }, { id: 'c', layout: { v: 1 } }];
  const out = Core.applyThemeLayers(base, {
    layers: { a: { x: 2, y: 3 }, c: { layout: { v: 2 }, filter: ['==', 'k', 1], minzoom: 9 } },
    remove: ['b'],
    add_layers: [{ id: 'after-a' }], add_after: 'a',
    add_top: [{ id: 'top' }],
    add: [{ id: 'before-c', before: 'c' }, { id: 'tail', before: 'missing' }],
  });
  assert.deepEqual(out.map(l => l.id), ['a', 'after-a', 'before-c', 'c', 'top', 'tail']);
  assert.deepEqual(out[0].paint, { x: 2, y: 3 });
  assert.deepEqual(out[3].layout, { v: 2 });
  assert.equal(out[3].minzoom, 9);
  assert.equal('before' in out[2], false);
  // база не меняется: повторная смена темы не копит правки
  assert.deepEqual(base[0].paint, { x: 1 });
});

// ─── рельеф ───
test('relief strength scales numbers, stops and interpolate outputs with a cap', () => {
  assert.equal(Core.scalePaint(0.5, 1.5, 1), 0.75);
  assert.equal(Core.scalePaint(0.9, 1.5, 1), 1);
  assert.deepEqual(Core.scalePaint({ stops: [[8, 0.2], [12, 0.6]] }, 0.5, 1), { stops: [[8, 0.1], [12, 0.3]] });
  assert.deepEqual(Core.scalePaint(['interpolate', ['linear'], ['zoom'], 8, 0.2, 12, 0.6], 2, 1),
    ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 1]);
});

const map = (extra = {}) => ({ id: 'murmansk', modified: 1700000000, ...extra });
const dem = { minZoom: 8, maxZoom: 12, modified: 1 };
const slope = { minZoom: 10, maxZoom: 13, modified: 2 };

test('style uses only local tnmap:// addresses (no CDN)', () => {
  const style = Core.buildStyle({ template, map: map({ dem, slope }), base: BASE, theme: topo });
  const text = JSON.stringify(style);
  assert.equal(style.sources.openmaptiles.tiles[0], `${BASE}/vector/murmansk/{z}/{x}/{y}.pbf?v=1700000000`);
  assert.equal(style.glyphs, `${BASE}/assets/fonts/{fontstack}/{range}.pbf`);
  assert.equal(style.sprite, `${BASE}/assets/sprites/osm-liberty`);
  assert.equal(style.sources.dem.encoding, 'terrarium');
  assert.match(style.sources.slope.tiles[0], /^tnmap:\/\/localhost\/extra\/murmansk\.slope\//);
  const urls = [...text.matchAll(/"(?:tiles|sprite|glyphs|url)":\s*(?:\[\s*)?"([^"]+)"/g)].map(m => m[1]);
  assert.ok(urls.length >= 4);
  urls.forEach(u => assert.match(u, /^tnmap:\/\/localhost\//));
  assert.doesNotMatch(text, /\{\{(TILES|BASE)\}\}/);
});

test('a map without relief files opens: hillshade/slope layers are dropped, contours stay', () => {
  const style = Core.buildStyle({ template, map: map(), base: BASE, theme: topo });
  const ids = style.layers.map(l => l.id);
  assert.equal('dem' in style.sources, false);
  assert.equal(ids.includes('topo_hillshade'), false);
  assert.equal(ids.includes('topo_slope'), false);
  assert.ok(ids.includes('topo_contour'));
  style.layers.forEach(l => assert.ok(!l.source || l.source in style.sources, l.id));
});

test('relief prefs: off drops terrain, contours can be hidden alone, strength scales shading', () => {
  const off = Core.buildStyle({ template, map: map({ dem, slope }), base: BASE, theme: topo, relief: { on: false } });
  assert.equal('dem' in off.sources || 'slope' in off.sources, false);
  assert.equal(off.layers.some(l => l.id.startsWith('topo_contour')), false);

  const noContours = Core.buildStyle({ template, map: map({ dem, slope }), base: BASE, theme: topo, relief: { contours: false } });
  assert.ok(noContours.layers.some(l => l.id === 'topo_hillshade'));
  assert.equal(noContours.layers.some(l => l.id.startsWith('topo_contour')), false);

  const full = Core.buildStyle({ template, map: map({ dem, slope }), base: BASE, theme: topo });
  const half = Core.buildStyle({ template, map: map({ dem, slope }), base: BASE, theme: topo, relief: { strength: 5 } });
  const shade = s => JSON.stringify(s.layers.find(l => l.id === 'topo_hillshade').paint['hillshade-exaggeration']);
  assert.notEqual(shade(full), shade(half));
});

test('three themes build; the icon filter reaches the POI layers; buildings are flat', () => {
  for (const theme of [null, contrast, topo]) {
    const style = Core.buildStyle({ template, map: map(), base: BASE, theme, poi: 'auto' });
    const poi = style.layers.filter(l => Core.POI_LAYERS.has(l.id));
    assert.ok(poi.length > 0);
    poi.forEach(l => assert.equal(JSON.stringify(l.filter).includes('"fuel"'), true));
    style.layers.filter(l => l.type === 'fill-extrusion').forEach(l => assert.equal(l.layout.visibility, 'none'));
  }
  const topoStyle = Core.buildStyle({ template, map: map(), base: BASE, theme: topo });
  const images = Core.requiredAppImages(topoStyle);
  assert.ok(images.includes('topo-bog-pattern'));
});

test('normal theme is the base style itself', () => {
  const style = Core.buildStyle({ template, map: map(), base: BASE, theme: null });
  assert.equal(style.layers.length, JSON.parse(template).layers.length);
  assert.equal(Core.normalizeTheme('junk'), 'contrast');
});

// ─── интеграция с index.html и правила Desktop ───
test('index.html only gets small hooks for TrophyNav Maps', () => {
  const html = read('../ui/index.html');
  assert.match(html, /<script src="trophynav-maps\.js"><\/script>/);
  assert.match(html, /function makeBaseLayer\(name\) \{\n[^\n]*\n\s+if \(window\.TrophyNavMaps\?\.isLayerName\(name\)\) return window\.TrophyNavMaps\.makeLayer\(name\);/);
  assert.match(html, /<div id="tnmaps-layers"><\/div>/);
  assert.doesNotMatch(html, /maplibre-gl\.js/, 'MapLibre грузится лениво из trophynav-maps.js');
});

test('new map UI has no hard-coded colours and no CDN', () => {
  const js = read('../ui/trophynav-maps.js');
  const css = js.slice(js.indexOf('st.textContent = `'), js.indexOf('document.head.appendChild(st)'));
  assert.ok(css.length > 500);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  assert.doesNotMatch(js, /https?:\/\/(?!trophynav\.ru|tnmap\.localhost)/);
  assert.match(js, /TrophyNav Maps/);
  assert.doesNotMatch(js, /\bКП\b/);
});

// ─── 3D-вид (путь B) ───
const wheel = (o) => Object.assign({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, shiftKey: false }, o);

test('3D wheel rule: pinch zooms, touchpad two fingers tilt and rotate, mouse wheel zooms, Shift+wheel tilts', () => {
  // щипок тачпада приходит как wheel с ctrlKey
  assert.equal(Core.wheelGesture(wheel({ deltaY: -4, ctrlKey: true }), {}, 0).kind, 'zoom');
  assert.ok(Core.wheelGesture(wheel({ deltaY: -4, ctrlKey: true }), {}, 0).dZoom > 0);
  // два пальца: мелкие шаги, есть горизонталь
  const v = Core.wheelGesture(wheel({ deltaY: 6 }), {}, 0);
  assert.equal(v.kind, 'orbit');
  assert.ok(v.dPitch > 0);
  assert.equal(v.dBearing, 0);
  const h = Core.wheelGesture(wheel({ deltaX: -8, deltaY: 1 }), {}, 0);
  assert.equal(h.kind, 'orbit');
  assert.ok(h.dBearing < 0);
  // колесо мыши: щелчок ±100 (пиксели) или строки
  const m = Core.wheelGesture(wheel({ deltaY: 100 }), {}, 0);
  assert.equal(m.kind, 'zoom');
  assert.ok(m.dZoom < 0);
  assert.equal(Core.wheelGesture(wheel({ deltaY: 3, deltaMode: 1 }), {}, 0).kind, 'zoom');
  assert.equal(Core.wheelGesture(wheel({ deltaY: 53 }), {}, 0).kind, 'zoom');
  // Shift+колесо — наклон, даже если WebView переложил прокрутку в deltaX
  const s = Core.wheelGesture(wheel({ deltaX: 100, shiftKey: true }), {}, 0);
  assert.equal(s.kind, 'tilt');
  assert.ok(s.dPitch > 0);
  assert.equal(s.dBearing, 0);
});

test('3D wheel rule keeps the decision for the whole gesture and caps steps', () => {
  const st = {};
  assert.equal(Core.wheelGesture(wheel({ deltaY: 4 }), st, 1000).kind, 'orbit');
  // быстрый свайп тачпадом даёт большой шаг — внутри жеста он остаётся наклоном, не масштабом
  const big = Core.wheelGesture(wheel({ deltaY: 120 }), st, 1100);
  assert.equal(big.kind, 'orbit');
  assert.ok(Math.abs(big.dPitch) <= 10);
  // пауза — новый жест, щелчок колеса снова масштаб
  assert.equal(Core.wheelGesture(wheel({ deltaY: 100 }), st, 1100 + Core.GESTURE_HOLD_MS + 1).kind, 'zoom');
  // щипок не «залипает» как масштаб для следующих двух пальцев
  const st2 = {};
  Core.wheelGesture(wheel({ deltaY: -3, ctrlKey: true }), st2, 0);
  assert.equal(Core.wheelGesture(wheel({ deltaY: 5 }), st2, 50).kind, 'orbit');
});

test('3D style: terrain from DEM on its own source, buildings raised, sky; no DEM — still opens', () => {
  const base2d = Core.buildStyle({ template, map: map({ dem, slope }), base: BASE, theme: topo });
  const s3 = Core.to3dStyle(base2d, map({ dem, slope }), BASE, 9);
  assert.equal(s3.terrain.source, 'terrain');
  assert.equal(s3.terrain.exaggeration, Core.EXAGGERATION_MAX);
  assert.equal(s3.sources.terrain.encoding, 'terrarium');
  assert.notEqual(s3.sources.terrain, s3.sources.dem);
  assert.ok(s3.layers.some(l => l.source === 'dem' && l.type === 'hillshade'));
  s3.layers.filter(l => l.type === 'fill-extrusion').forEach(l => {
    assert.equal(l.layout.visibility, 'visible');
    assert.deepEqual(l.paint['fill-extrusion-height'], ['coalesce', ['get', 'render_height'], ['get', 'height'], 6]);
  });
  assert.ok(s3.sky);
  // 2D-стиль не испорчен (копия)
  base2d.layers.filter(l => l.type === 'fill-extrusion').forEach(l => assert.equal(l.layout.visibility, 'none'));

  const flat = Core.to3dStyle(Core.buildStyle({ template, map: map(), base: BASE, theme: topo }), map(), BASE);
  assert.equal('terrain' in flat, false);
  assert.equal('terrain' in flat.sources, false);
  assert.equal(Core.normalizeExaggeration(undefined), Core.EXAGGERATION_DEFAULT);
  assert.equal(Core.normalizeExaggeration('0.2'), Core.EXAGGERATION_MIN);
});

test('3D view UI: theme variables only, Esc/2D exit, hint text, index hook', () => {
  const js = read('../ui/trophynav-3d.js');
  const css = js.slice(js.indexOf('st.textContent = `'), js.indexOf('document.head.appendChild(st)'));
  assert.ok(css.length > 500);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b(?!-)|rgba?\(/i);
  assert.match(js, /Два пальца и щипок — масштаб, наклон — ползунком или Shift\+два пальца/);  // 0.9.29: наклон зафиксирован по умолчанию
  assert.match(js, /e\.key === 'Escape'/);
  assert.match(js, /scrollZoom: false/);
  assert.doesNotMatch(js, /https?:\/\//);
  assert.match(read('../ui/index.html'), /<script src="trophynav-3d\.js"><\/script>/);
});
