// Стопка холстов Leaflet (0.9.35): верхний холст без своего попадания отдаёт событие холсту ниже.
// Ошибка 0.9.34: пустой холст точек трека лежал поверх линий — клик/ПКМ по треку уходили карте.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
const Stack = require('../ui/tn-canvas-stack.js');

// Минимальный L.Canvas: исходные методы только записывают, кто и что получил
function fakeL() {
  const log = [];
  function Canvas(name) { this.name = name; this._drawFirst = null; this._hoveredLayer = null; }
  Canvas.prototype._initContainer = function () { this._container = { classes: new Set(), previousElementSibling: null }; };
  Canvas.prototype._onClick = function (e) { log.push(['click', this.name, e.type]); };
  Canvas.prototype._onMouseMove = function (e) { log.push(['move', this.name]); this._hoveredLayer = this._hit ? 'L' : null; };
  Canvas.prototype._handleMouseOut = function (e) { if (this._hoveredLayer) log.push(['out', this.name, e.type]); this._hoveredLayer = null; };
  const DomUtil = { addClass: (el, c) => el.classes.add(c), removeClass: (el, c) => el.classes.delete(c) };
  return { L: { Canvas, DomUtil }, log };
}

function stack(L, names) {
  const map = { dragging: { moving: () => false }, _animatingZoom: false, mouseEventToLayerPoint: () => ({ x: 0, y: 0 }) };
  let prev = null;
  return names.map(n => {
    const r = new L.Canvas(n);
    r._map = map;
    r._initContainer();
    r._container.previousElementSibling = prev;
    prev = r._container;
    r.setHit = hit => { r._hit = hit; r._drawFirst = hit ? { layer: { options: { interactive: true }, _containsPoint: () => true }, next: null } : null; };
    return r;
  });
}

test('index.html подключает стопку холстов сразу после leaflet.js, до создания карты', () => {
  const i = html.indexOf('<script src="leaflet.js"></script>');
  const j = html.indexOf('<script src="tn-canvas-stack.js"></script>');
  assert.ok(i > 0 && j > i, 'tn-canvas-stack.js после leaflet.js');
  assert.ok(j < html.indexOf("L.map('map'"), 'до L.map');
});

test('клик без попадания в верхний холст уходит в нижний; своё попадание остаётся у верхнего', () => {
  const { L, log } = fakeL();
  Stack.install(L);
  const [lines, points] = stack(L, ['lines', 'points']);
  lines.setHit(true); points.setHit(false);
  points._onClick({ type: 'contextmenu' });
  assert.deepEqual(log.pop(), ['click', 'lines', 'contextmenu']);
  points.setHit(true);
  points._onClick({ type: 'click' });
  assert.deepEqual(log.pop(), ['click', 'points', 'click']);
});

test('цепочка из трёх холстов; самый нижний без попадания отдаёт событие карте как обычно', () => {
  const { L, log } = fakeL();
  Stack.install(L);
  const [a, b, c] = stack(L, ['a', 'b', 'c']);
  a.setHit(false); b.setHit(false); c.setHit(false);
  c._onClick({ type: 'mousedown' });
  assert.deepEqual(log.pop(), ['click', 'a', 'mousedown']);
  b.setHit(true);
  c._onClick({ type: 'click' });
  assert.deepEqual(log.pop(), ['click', 'b', 'click']);
});

test('наведение: нижний подсвечен — верхний ставит курсор-руку; уход мыши гасит подсветку нижних', () => {
  const { L, log } = fakeL();
  Stack.install(L);
  const [lines, points] = stack(L, ['lines', 'points']);
  lines.setHit(true); points.setHit(false);
  points._onMouseMove({ type: 'mousemove' });
  assert.equal(lines._hoveredLayer, 'L');
  assert.ok(points._container.classes.has('leaflet-interactive'));
  // мышь попала на точку — подсветка линии снимается
  points.setHit(true);
  points._onMouseMove({ type: 'mousemove' });
  assert.equal(lines._hoveredLayer, null);
  assert.deepEqual(log.find(x => x[0] === 'out'), ['out', 'lines', 'mousemove']);
  // снова над линией, затем мышь ушла с карты
  points.setHit(false); points._hoveredLayer = null;
  points._onMouseMove({ type: 'mousemove' });
  points._handleMouseOut({ type: 'mouseout' });
  assert.equal(lines._hoveredLayer, null);
  assert.ok(!points._container.classes.has('leaflet-interactive'));
});

test('install идемпотентен и помечает контейнер своим холстом', () => {
  const { L, log } = fakeL();
  Stack.install(L); Stack.install(L);
  const [a, b] = stack(L, ['a', 'b']);
  assert.equal(b._container._tndCanvas, b);
  a.setHit(true); b.setHit(false);
  b._onClick({ type: 'click' });
  assert.equal(log.length, 1, 'одна доставка, без двойной обёртки');
});

test('флаг «ПКМ обработан объектом» сбрасывается в начале каждого contextmenu (фаза перехвата)', () => {
  // объекты на холсте останавливают всплытие — без сброса до них следующий ПКМ по пустой карте терялся
  const reset = html.indexOf("document.addEventListener('contextmenu', () => { ctxHandledByMarker = false; }, true);");
  const mapCtx = html.indexOf("tnMap.getContainer().addEventListener('contextmenu'"); // ветка MapLibre: контейнер через фасад
  assert.ok(reset > 0 && reset < mapCtx, 'сброс в capture на document стоит перед обработчиком меню карты');
  assert.match(html.slice(mapCtx, mapCtx + 300), /if \(ctxHandledByMarker\) \{ ctxHandledByMarker = false; return; \}/);
});
