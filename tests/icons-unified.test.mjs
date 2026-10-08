// Единый стиль значков: кнопки рисуют линейные SVG из ui/tn-icons.js (currentColor), а не эмодзи —
// в Linux цветные эмодзи рисуются квадратами шрифта и не берут цвет темы.
// DOM-проверки окна TrophyNav Maps идут в jsdom (NODE_PATH=…/node_modules); без него пропускаются.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const html = read('../ui/index.html');
const mapsJs = read('../ui/trophynav-maps.js');
const d3Js = read('../ui/trophynav-3d.js');
const widgetsJs = read('../ui/tn-widgets.js');
const iconsJs = read('../ui/tn-icons.js');
const require = createRequire(import.meta.url);
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* jsdom не установлен */ }
const needDom = { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' };

const NAMES = JSON.parse(iconsJs.match(/window\.TN_ICON_NAMES = (\[[^\]]*\]);/)[1]);
// Пиктограммы-эмодзи и символы-стрелки, которые шрифт может нарисовать цветным квадратом
const PICTO = /\p{Extended_Pictographic}|[←-⇿⬀-⯿⏩-⏺▶◀〜]/u;
const stripTags = s => s.replace(/<[^>]*>/g, '').replace(/\$\{[^}]*\}/g, '');

test('спрайт: каждый значок, который просит код, есть в наборе, и у каждого имени есть <symbol>', () => {
  const used = new Set();
  for (const src of [html, mapsJs, d3Js, widgetsJs]) {
    for (const m of src.matchAll(/\b(?:tnIcon|ico)\(\s*'([a-z0-9-]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/\b(?:tnIcon|ico)\(\s*[^'()]*\?\s*'([a-z0-9-]+)'\s*:\s*'([a-z0-9-]+)'/g)) { used.add(m[1]); used.add(m[2]); }
    for (const m of src.matchAll(/href="#tn-i-([a-z0-9-]+)"/g)) used.add(m[1]);
  }
  // значки слоёв выбирает getLayerIcon()
  const layerFn = html.slice(html.indexOf('function getLayerIcon('), html.indexOf('function fallbackLayerMaxZoom('));
  for (const m of layerFn.matchAll(/return '([a-z0-9-]+)'/g)) used.add(m[1]);
  assert.ok(used.size > 40, `найдено мало значков: ${used.size}`);
  const missing = [...used].filter(n => !NAMES.includes(n));
  assert.deepEqual(missing, [], 'значки, которых нет в TN_ICON_NAMES');
  for (const n of NAMES) assert.match(iconsJs, new RegExp(`<symbol id=\\\\"tn-i-${n}\\\\"`), `нет <symbol> для ${n}`);
});

test('заголовок «Карта и слои»: кнопки-значки svg.tn-ico, без эмодзи', () => {
  const start = html.indexOf('<div class="modal" id="modal-layers-win"');
  const header = html.slice(start, html.indexOf('<div class="modal-body">', start));
  assert.doesNotMatch(stripTags(header), PICTO);
  assert.match(header, /<span class="modal-title"><svg class="tn-ico"[^>]*><use href="#tn-i-layers"\/><\/svg>Карта и слои<\/span>/);
  assert.match(header, /<button type="button" class="tn-icon-btn"[^>]*showHiddenLayersManager\(\)[^>]*title="Показать скрытые карты"[^>]*><svg class="tn-ico"[^>]*><use href="#tn-i-eye"\/>/);
  assert.match(header, /<button type="button" class="tn-icon-btn"[^>]*refreshTileCatalog\(\)[^>]*title="Обновить каталог с сервера"[^>]*><svg class="tn-ico"[^>]*><use href="#tn-i-cloud-sync"\/>/);
  assert.match(header, /class="modal-close"[^>]*aria-label="Закрыть"><svg class="tn-ico"[^>]*><use href="#tn-i-close"\/>/);
  // строки слоёв: значок из набора, «Скрыть» — кнопка-значок
  assert.doesNotMatch(html, /getLayerEmoji|layerEmoji/);
  assert.match(html, /\$\{tnIcon\(getLayerIcon\(row\.label\), 'tn-ico-t tn-ico-m'\)\}/);
  assert.match(html, /class="tn-icon-btn tn-icon-btn-s" data-layer-key="[^"]*"[^>]*title="Скрыть из списка"[^>]*>\$\{tnIcon\('eye-off'\)\}<\/button>/);
});

test('ни одна кнопка и пункт меню в разметке не рисует значок эмодзи (кроме цветных точек «старт/финиш»)', () => {
  const offenders = [];
  for (const [name, src] of [['index.html', html], ['trophynav-maps.js', mapsJs], ['trophynav-3d.js', d3Js]]) {
    for (const m of src.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
      if (PICTO.test(stripTags(m[1]))) offenders.push(`${name}: ${m[0].slice(0, 120)}`);
    }
    for (const m of src.matchAll(/<(div|span)\b[^>]*\bonclick="[^"]*"[^>]*>([^<]*)/g)) {
      if (/routefrom|routeto/.test(m[0])) continue; // 🟢/🔴 — цвет старта и финиша, как на карте
      if (PICTO.test(m[2])) offenders.push(`${name}: ${m[0].slice(0, 120)}`);
    }
  }
  assert.deepEqual(offenders, []);
  // подписи, которые меняет JS
  assert.doesNotMatch(html, /\.textContent = [^;\n]*['`](?:🔄|⬇|🌐|⏳|🗑|✂|✓ Сохранить'|✓ Готово'|✓ Вкл|◯ Выкл|▶'|◀')/);
});

test('«О программе»: «Проверить обновление» — SVG 16 px + текст', () => {
  const btn = html.slice(html.indexOf('id="btn-check-update"'), html.indexOf('</button>', html.indexOf('id="btn-check-update"')));
  assert.match(btn, /<svg class="tn-ico tn-ico-t"[^>]*><use href="#tn-i-cloud-sync"\/><\/svg>Проверить обновление/);
  assert.doesNotMatch(stripTags(btn), PICTO);
  assert.match(html, /setUpdateButtonLabel\(btn, 'cloud-sync', 'Проверить обновление'\)/);
  assert.match(html, /\.tn-ico\.tn-ico-t \{ width: 16px; height: 16px;/);
  assert.match(html, /\.tn-icon-btn:hover \{ color: var\(--primary\); \}/);
});

test('окно TrophyNav Maps и строка области: кнопки со значками svg.tn-ico, без эмодзи', needDom, () => {
  const dom = new JSDOM('<!doctype html><body><div id="map"></div><div id="tnmaps-layers"></div></body>',
    { url: 'https://review.invalid/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  try {
    w.eval(read('../ui/leaflet.js'));
    w.eval('var map = L.map("map"); var currentBaseLayerName = "OpenStreetMap";');
    w.eval(iconsJs);
    w.eval(read('../ui/trophynav-maps-core.js'));
    w.eval(mapsJs.replace('window.TrophyNavMaps = {', 'window.__t = { state, ensureWindow, itemHtml }; window.TrophyNavMaps = {'));
    const { state, ensureWindow, itemHtml } = w.__t;
    const overlay = ensureWindow();
    const header = overlay.querySelector('.modal-header');
    assert.doesNotMatch(header.textContent, PICTO);
    assert.equal(header.querySelector('[data-tnmaps-act="reload"] svg.tn-ico use').getAttribute('href'), '#tn-i-cloud-sync');
    assert.equal(header.querySelector('[data-tnmaps-act="close"] svg.tn-ico use').getAttribute('href'), '#tn-i-close');

    const sha = 'a'.repeat(64);
    state.catalog = { maps: [
      { id: 'upd', name: 'Карелия', size: 10, sha256: sha },
      { id: 'ver', name: 'Ленобласть', size: 10, sha256: sha },
      { id: 'new', name: 'Псковская', size: 10, sha256: sha },
    ] };
    state.local = [{ id: 'upd', size: 9, sha256: sha }, { id: 'ver', size: 10 }];
    state.partial = {};
    const row = id => { const box = w.document.createElement('div'); box.innerHTML = itemHtml(id); return box; };
    const expect = { upd: ['Обновить', 'cloud-download'], ver: ['Проверить', 'cloud-check'], new: ['Скачать', 'download'] };
    for (const [id, [label, icon]] of Object.entries(expect)) {
      const box = row(id);
      const btn = [...box.querySelectorAll('button[data-tnmaps-act="download"]')].find(b => b.textContent.trim() === label);
      assert.ok(btn, `${id}: нет кнопки «${label}»`);
      assert.equal(btn.querySelector('svg.tn-ico.tn-ico-t use').getAttribute('href'), `#tn-i-${icon}`);
      for (const b of box.querySelectorAll('button')) assert.doesNotMatch(b.textContent, PICTO, `${id}: ${b.textContent}`);
    }
  } finally { dom.window.close(); }
});
