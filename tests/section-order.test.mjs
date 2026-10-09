// Порядок разделов «Карта и слои» (Андрей 09.10): «Мои карты» и другие разделы перетаскиваются за заголовок.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
const src = fs.readFileSync(new URL('../ui/tn-section-order.js', import.meta.url), 'utf8');
const S = require('../ui/tn-section-order.js');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }
const needDom = { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' };

test('модель: сохранённый порядок дополняется новыми разделами, мусор отбрасывается', () => {
  assert.deepEqual(S.normalize(null), S.DEFAULT);
  assert.deepEqual(S.normalize(['custom', 'zzz', 'custom']), ['custom', 'tnmaps', 'free', 'premium', 'overlay', 'offline']);
  assert.deepEqual(S.normalize(['free', 'tnmaps', 'custom']), ['free', 'tnmaps', 'custom', 'premium', 'overlay', 'offline']);
  assert.deepEqual(S.move(S.DEFAULT, 'custom', 'tnmaps', false), ['custom', 'tnmaps', 'free', 'premium', 'overlay', 'offline']);
  assert.deepEqual(S.move(S.DEFAULT, 'free', 'premium', true), ['tnmaps', 'premium', 'free', 'overlay', 'offline', 'custom']);
});

test('разметка: у каждого раздела заголовок с data-sec, модуль подключён', () => {
  for (const k of S.DEFAULT) assert.match(html, new RegExp(`data-sec="${k}"`), k);
  assert.match(html, /<script src="tn-section-order\.js"><\/script>/);
});

test('DOM: разделы обёрнуты и расставлены по сохранённому порядку; «Вернуть порядок разделов»', needDom, () => {
  const a = html.indexOf('<div class="modal-body">', html.indexOf('id="modal-layers"'));
  const b = html.indexOf('<!-- УВЕДОМЛЕНИЕ -->');
  const dom = new JSDOM(`<!doctype html><head></head><body><div id="modal-layers">${html.slice(a, b)}</div></body>`, { url: 'https://review.invalid/', runScripts: 'dangerously' });
  const w = dom.window;
  try {
    w.localStorage.setItem('tnd-section-order', JSON.stringify(['custom', 'premium']));
    w.eval(src);
    w.TnSectionOrder.init();  // в jsdom DOMContentLoaded уже прошёл — повторный вызов безопасен
    const body = w.document.querySelector('#modal-layers .modal-body');
    const secs = [...body.querySelectorAll(':scope > .tnd-sec')].map(n => n.dataset.sec);
    assert.deepEqual(secs, ['custom', 'premium', 'tnmaps', 'free', 'overlay', 'offline']);
    // «Слои поверх» остаются сверху, вне перестановки
    assert.equal(body.firstElementChild.id, 'tn-stack-section');
    // списки на месте внутри своих разделов
    assert.ok(body.querySelector('.tnd-sec[data-sec="custom"] #custom-layers-list'));
    assert.ok(body.querySelector('.tnd-sec[data-sec="free"] #catalog-free-layers'));
    assert.ok(body.querySelector('.tnd-sec[data-sec="offline"] #offline-layers-list'));
    assert.ok(body.querySelector(':scope > .tnd-sec-reset'));
    w.TnSectionOrder.reset();
    assert.deepEqual([...body.querySelectorAll(':scope > .tnd-sec')].map(n => n.dataset.sec), S.DEFAULT);
    assert.equal(w.localStorage.getItem('tnd-section-order'), null);
    assert.ok(!body.querySelector(':scope > .tnd-sec-reset'));
  } finally { dom.window.close(); }
});
