// Выпуск 0.9.36: темы векторных карт с сервера (пакет стиля, src-tauri/src/style_pack.rs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../ui/trophynav-maps-core.js';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../ui/index.html');
const Core = globalThis.TrophyNavMapsCore;

test('версия 0.9.36 везде одна', () => {
  assert.match(read('../src-tauri/tauri.conf.json'), /"version": "0\.9\.36"/);
  assert.match(read('../src-tauri/Cargo.toml'), /^version = "0\.9\.36"$/m);
  assert.match(read('../src-tauri/Cargo.lock'), /name = "trophy-navigator-desktop"\nversion = "0\.9\.36"/);
  assert.match(html, /<title>🧭 Trophy Navigator Desktop v0\.9\.36<\/title>/);
  assert.match(html, /id="app-version-label" class="app-version">Trophy Navigator · v0\.9\.36</);
  assert.match(html, /let appDisplayVersion = '0\.9\.36';/);
  assert.match(html, /id="about-version"[^>]*>0\.9\.36</);
  assert.doesNotMatch(html, /v0\.9\.35|'0\.9\.35'/);
});

test('описание выпуска 0.9.36 в манифесте обновлений и GitHub Release', () => {
  const wf = read('../.github/workflows/build.yml');
  assert.match(wf, /"notes": "Темы векторных карт теперь приходят с сервера/);
  assert.match(wf, /### Новое в 0\.9\.36[\s\S]*### Исправлено в 0\.9\.35/);
});

test('встроенный пакет стиля: манифест сходится с файлами', async () => {
  const { createHash } = await import('node:crypto');
  const m = JSON.parse(read('../ui/vector/manifest.json'));
  assert.ok(m.version >= 19);
  for (const [p, f] of Object.entries(m.files)) {
    const b = fs.readFileSync(new URL(`../ui/vector/${p}`, import.meta.url));
    assert.equal(b.length, f.size, p);
    assert.equal(createHash('sha256').update(b).digest('hex'), f.sha256, p);
  }
  assert.ok(m.themes.some(t => t.id === 'offroad'));
});

test('список тем из пакета: новые темы добавляются, мусор отбрасывается, «Базовая» остаётся', () => {
  const saved = Core.THEMES.map(t => ({ ...t }));
  try {
    assert.equal(Core.setThemes(null), false);
    assert.equal(Core.setThemes([{ id: '../x', title: 'Плохо' }, { id: 'topo' }]), false);
    assert.equal(Core.THEMES.length, saved.length);
    assert.equal(Core.setThemes([{ id: 'topo', title: 'Топо' }, { id: 'winter', title: 'Зима', relief: true }, { id: 'topo', title: 'дубль' }]), true);
    assert.deepEqual(Core.THEMES.map(t => t.id), ['normal', 'topo', 'winter']);
    assert.equal(Core.normalizeTheme('winter'), 'winter');
    assert.ok(Core.RELIEF_THEMES.has('winter'));
    assert.equal(Core.normalizeTheme('offroad'), Core.DEFAULT_THEME === 'offroad' ? 'offroad' : Core.DEFAULT_THEME);
  } finally {
    Core.setThemes(saved);
    Core.RELIEF_THEMES.delete('winter');
  }
});

test('стиль сначала из пакета с сервера, потом встроенный; проверка не мешает работе без сети', () => {
  const rs = read('../src-tauri/src/vector_maps.rs');
  assert.match(rs, /style_pack::read_asset\(&rel\)[\s\S]*asset_resolver\(\)\.get\(format!\("vector\/\{rel\}"\)\)/);
  const js = read('../ui/trophynav-maps.js');
  assert.match(js, /navigator\.onLine === false/);
  assert.match(js, /addEventListener\('online', checkStylePack\)/);
});
