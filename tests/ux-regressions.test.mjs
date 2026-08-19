import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255);
  const linear = channels.map(value => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('toolbar list actions, modal closes and tabs use keyboard controls', () => {
  assert.doesNotMatch(html, /<(?:span|div) class="(?:modal-close|tab-btn|tb-group-label)/);
  assert.equal((html.match(/<button type="button" class="modal-close"/g) || []).length, 20);
  assert.equal((html.match(/class="modal-close"[^>]+aria-label="Закрыть"/g) || []).length, 20);
  assert.equal((html.match(/<button type="button" class="tb-group-label"/g) || []).length, 3);
  assert.equal((html.match(/role="tablist"/g) || []).length, 2);
  assert.equal((html.match(/role="tab" aria-selected=/g) || []).length, 6);
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
  assert.match(html, /@media \(max-width: 1210px\) \{[\s\S]*?\.tb-btn \{[^}]*height: 34px;/);
  assert.match(html, /@media \(max-width: 950px\) \{[\s\S]*?\.tb-tag \{ width: 34px; height: 34px;/);
});

test('corrected theme color pairs meet 4.5 to 1 text contrast', () => {
  assert.ok(contrast('#174f8f', '#dceafb') >= 4.5, 'light create buttons');
  assert.ok(contrast('#a61b1b', '#e8ecf0') >= 4.5, 'light danger button');
  assert.ok(contrast('#ffffff', '#2f6fb8') >= 4.5, 'primary button');
});

test('focus treatment and persisted theme switching remain explicit', () => {
  assert.match(html, /:where\(button, input, select, textarea, \[role="button"\]\):focus-visible/);
  assert.match(html, /\.toolbar-search-box:focus-within/);
  assert.match(html, /function setTheme\(theme\)[\s\S]*?localStorage\.setItem\('tnd-theme', theme\)/);
  assert.match(html, /const modalReturnFocus = new WeakMap\(\)/);
  assert.match(html, /requestAnimationFrame\(\(\) => overlay\.querySelector\('\.modal-close, button, input, select, textarea'\)/);
});
