// Выпуск 0.9.33 (включает 0.9.31 и 0.9.32): номер версии везде один.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../ui/index.html');

test('версия 0.9.33 везде одна', () => {
  assert.match(read('../src-tauri/tauri.conf.json'), /"version": "0\.9\.33"/);
  assert.match(read('../src-tauri/Cargo.toml'), /^version = "0\.9\.33"$/m);
  assert.match(read('../src-tauri/Cargo.lock'), /name = "trophy-navigator-desktop"\nversion = "0\.9\.33"/);
  assert.match(html, /<title>🧭 Trophy Navigator Desktop v0\.9\.33<\/title>/);
  assert.match(html, /id="app-version-label" class="app-version">Trophy Navigator · v0\.9\.33</);
  assert.match(html, /let appDisplayVersion = '0\.9\.33';/);
  assert.match(html, /id="about-version"[^>]*>0\.9\.33</);
  assert.doesNotMatch(html, /v0\.9\.30|'0\.9\.30'/);
});

test('описание выпуска 0.9.33 в манифесте обновлений и GitHub Release', () => {
  const wf = read('../.github/workflows/build.yml');
  assert.match(wf, /"notes": "Поиск мест и голосовой поиск без интернета/);
  assert.match(wf, /### Новое в 0\.9\.33/);
  assert.doesNotMatch(wf, /"notes": "Автообновление теперь работает и для DEB/);
});
