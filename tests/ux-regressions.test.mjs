import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');

test('toolbar list actions, modal closes and tabs use keyboard controls', () => {
  assert.doesNotMatch(html, /<(?:span|div) class="(?:modal-close|tab-btn|tb-group-label)/);
  assert.equal((html.match(/<button type="button" class="modal-close"/g) || []).length, 20);
  assert.equal((html.match(/class="modal-close"[^>]+aria-label="Закрыть"/g) || []).length, 20);
  assert.equal((html.match(/<button type="button" class="tb-group-label"/g) || []).length, 3);
  assert.equal((html.match(/role="tablist"/g) || []).length, 2);
  assert.equal((html.match(/role="tab" aria-selected=/g) || []).length, 7); // + «Виджеты» (0.9.30)
  assert.match(html, /id="search-clear" class="search-clear-btn"[^>]+aria-label="Очистить поиск"/);
});

test('compact toolbar keeps hidden desktop tools in an accessible overflow menu', () => {
  assert.match(html, /id="btn-more-tools"[^>]+aria-haspopup="menu"[^>]+aria-expanded="false"/);
  assert.match(html, /id="toolbar-more-menu" role="menu"[^>]+hidden/);
  assert.equal((html.match(/class="toolbar-more-item" role="menuitem"/g) || []).length, 7);
  assert.match(html, /\.desktop-overflow-tool,\s*\.tools-sep \{ display: none !important; \}/);
  assert.match(html, /#btn-more-tools \{ display: flex; \}/);
  assert.doesNotMatch(html, /#btn-(?:ruler|routing) \{ display: none; \}/);
});

test('primary desktop targets do not shrink below the agreed compact size', () => {
  assert.match(html, /\.modal-close \{[\s\S]*?width: 32px; height: 32px;/);
  assert.match(html, /\.tb-group-label \{[\s\S]*?min-height: 36px;/);
  assert.match(html, /\.tab-btn \{[^}]*min-height:34px;/);
  assert.match(html, /\.btn-primary \{[^}]*min-height:34px;/);
  assert.match(html, /\.btn-secondary \{[^}]*min-height:34px;/);
  // плитки панели в стиле Android: не меньше 38px на 1024 px и 36px на узких экранах
  assert.match(html, /@media \(max-width: 1210px\) \{[\s\S]*?\.tb-btn, \.tb-group-label, \.tb-tag \{[^}]*height: 38px;/);
  assert.match(html, /@media \(max-width: 950px\) \{[\s\S]*?\.tb-tag \{ width: 36px; height: 36px;/);
});

// Контраст цветов темы проверяет tests/theme-tokens.test.mjs (по значениям токенов theme.css).

test('focus treatment and persisted theme switching remain explicit', () => {
  assert.match(html, /:where\(button, input, select, textarea, \[role="button"\]\):focus-visible/);
  assert.match(html, /\.toolbar-search-box:focus-within/);
  assert.match(html, /function setTheme\(theme\)[\s\S]*?localStorage\.setItem\('tnd-theme', theme\)/);
  assert.match(html, /const modalReturnFocus = new WeakMap\(\)/);
  // фокус при открытии — на «Закрыть», даже если перед ней в заголовке есть кнопки-значки
  assert.match(html, /requestAnimationFrame\(\(\) => \(overlay\.querySelector\('\.modal-close'\) \|\| overlay\.querySelector\('button, input, select, textarea'\)\)/);
});

test('«Обзор» (hand mode) lives on the map under +/−/Z, not in the top bar', () => {
  const toolbar = html.slice(html.indexOf('<div id="toolbar"'), html.indexOf('id="toolbar-more-menu"'));
  assert.doesNotMatch(toolbar, /id="btn-hand"/);
  assert.match(html, /new ZoomDisplay\(\)\.addTo\(map\);\s*[\s\S]{0,200}const HandModeControl = L\.Control\.extend\(\{\s*options: \{ position: 'topleft' \}/);
  assert.match(html, /a\.id = 'btn-hand';\s*a\.href = '#';\s*a\.title = 'Обзор \(H\) — двигать карту';/);
  assert.match(html, /L\.DomEvent\.on\(a, 'click', ev => \{ L\.DomEvent\.preventDefault\(ev\); requestHandMode\(\); \}\);/);
  assert.match(html, /hand:'Обзор',/);
  assert.match(html, /id="sb-mode">Обзор</);
  assert.match(html, /\['H \/ Пробел', 'Обзор \(двигать карту\)'\]/);
  assert.doesNotMatch(html, /showToast\('Навигация'\)|Навигация \(H\)|Навигация \(рука\)/);
});
