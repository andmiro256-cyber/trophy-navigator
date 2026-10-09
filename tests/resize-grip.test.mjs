// Ручка размера окна (tndAddResizeGrip, Андрей 09.10): настоящее перетаскивание указателем в jsdom.
// Ревью Тома 2714 — проверка поведения, а не текста кода.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }
const needDom = { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' };
const a = html.indexOf('function tndAddResizeGrip(el) {');
const src = html.slice(a, html.indexOf('\nfunction tndModalSizes()', a));

function setup({ left = 100, top = 50, width = 380, height = 400, minW = 200, minH = 120, right = null } = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w, 'innerWidth', { value: 1600, configurable: true });
  Object.defineProperty(w, 'innerHeight', { value: 900, configurable: true });
  const el = w.document.createElement('div');
  el.className = 'modal';
  el.style.minWidth = minW + 'px'; el.style.minHeight = minH + 'px';
  if (right != null) el.style.right = right + 'px';
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height });
  w.document.body.appendChild(el);
  w.eval(src);
  w.tndAddResizeGrip(el);
  const grip = el.querySelector('.tnd-grip');
  const fire = (type, x, y) => grip.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
  const size = () => [parseFloat(el.style.width), parseFloat(el.style.height)];
  return { dom, el, grip, fire, size, gx: left + width - 5, gy: top + height - 5 };
}

test('тянется вправо-вниз и влево-вверх: размер = исходный + сдвиг указателя', needDom, () => {
  const t = setup();
  try {
    t.fire('pointerdown', t.gx, t.gy);
    t.fire('pointermove', t.gx + 120, t.gy + 60);
    assert.deepEqual(t.size(), [500, 460]);
    t.fire('pointermove', t.gx - 100, t.gy - 50);
    assert.deepEqual(t.size(), [280, 350]);
    t.fire('pointerup', t.gx - 100, t.gy - 50);
  } finally { t.dom.window.close(); }
});

test('упор в минимум и обратно: окно растёт, когда курсор вернулся к краю (край под курсором, как у окон ОС)', needDom, () => {
  const t = setup({ width: 380, minW: 200 });
  try {
    t.fire('pointerdown', t.gx, t.gy);
    t.fire('pointermove', t.gx - 200, t.gy);      // 380−200 = 180 → минимум 200
    assert.equal(t.size()[0], 200);
    t.fire('pointermove', t.gx - 180, t.gy);      // курсор дошёл до края (380−180 = 200) — всё ещё 200
    assert.equal(t.size()[0], 200);
    t.fire('pointermove', t.gx - 160, t.gy);      // дальше край идёт за курсором
    assert.equal(t.size()[0], 220);
  } finally { t.dom.window.close(); }
});

test('не шире и не выше окна программы; после отпускания движение не меняет размер', needDom, () => {
  const t = setup({ left: 1200, width: 350 });
  try {
    t.fire('pointerdown', t.gx, t.gy);
    t.fire('pointermove', t.gx + 500, t.gy + 900);
    assert.deepEqual(t.size(), [1600 - 1200 - 8, 900 - 50 - 8]);
    t.fire('pointerup', t.gx + 500, t.gy + 900);
    const s = t.size();
    t.fire('pointermove', t.gx - 100, t.gy - 100);
    assert.deepEqual(t.size(), s);
  } finally { t.dom.window.close(); }
});

test('окно, прижатое справа или по центру, на захвате переходит к левому верхнему углу; родной resize выключен', needDom, () => {
  const t = setup({ right: 10 });
  try {
    assert.equal(t.el.style.resize, 'none');
    t.fire('pointerdown', t.gx, t.gy);
    assert.equal(t.el.style.left, '100px');
    assert.equal(t.el.style.right, 'auto');
    assert.equal(t.el.style.transform, 'none');
  } finally { t.dom.window.close(); }
});
