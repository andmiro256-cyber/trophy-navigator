// Выпуск 0.9.37 (перенос файлов Mac/MSI на сайт); проверки 0.9.36 — темы векторных карт с сервера (пакет стиля, src-tauri/src/style_pack.rs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../ui/trophynav-maps-core.js';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../ui/index.html');
const Core = globalThis.TrophyNavMapsCore;

test('версия 0.9.37 везде одна', () => {
  assert.match(read('../src-tauri/tauri.conf.json'), /"version": "0\.9\.37"/);
  assert.match(read('../src-tauri/Cargo.toml'), /^version = "0\.9\.37"$/m);
  assert.match(read('../src-tauri/Cargo.lock'), /name = "trophy-navigator-desktop"\nversion = "0\.9\.37"/);
  assert.match(html, /<title>🧭 Trophy Navigator Desktop v0\.9\.37<\/title>/);
  assert.match(html, /id="app-version-label" class="app-version">Trophy Navigator · v0\.9\.37</);
  assert.match(html, /let appDisplayVersion = '0\.9\.37';/);
  assert.match(html, /id="about-version"[^>]*>0\.9\.37</);
  assert.doesNotMatch(html, /v0\.9\.36|'0\.9\.36'/);
});

test('описание выпуска 0.9.37 в манифесте обновлений и GitHub Release', () => {
  const wf = read('../.github/workflows/build.yml');
  assert.match(wf, /"notes": "Обновления для Mac и для установки через MSI теперь скачиваются с trophynav\.ru\."/);
  assert.match(wf, /### Изменено в 0\.9\.37[\s\S]*### Новое в 0\.9\.36/);
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
  assert.match(js, /addEventListener\('online', checkServer\)/);
});

test('новые версии карт: кружок на «Карта и слои» и «Карты областей», строка внизу открывает окно', () => {
  const js = read('../ui/trophynav-maps.js');
  assert.match(html, /id="tnmaps-open-link"/);
  assert.match(js, /getElementById\('btn-map-layer'\), document\.getElementById\('tnmaps-open-link'\)/);
  assert.match(js, /classList\.toggle\('tn-upd-dot', ids\.length > 0\)/);
  assert.match(js, /updateState\(m, catalogEntry\(m\.id\)\) === 'update'/);
  assert.match(js, /Новая версия карты: /);
  assert.match(js, /onclick = \(\) => openWindow\(\)/);
  // Без сети каталог не трогается и метки не гаснут
  assert.match(js, /async function checkServer\(\) \{\n    if \(navigator\.onLine === false\) return;/);
});

test('оформление: внизу видно только настоящее скачивание, пустая проверка молчит', () => {
  const js = read('../ui/trophynav-maps.js');
  const rs = read('../src-tauri/src/style_pack.rs');
  assert.match(js, /listen\?\.\('tnmaps-stylepack', onStylePackEvent\)/);
  assert.match(js, /Оформление карт: обновление…/);
  assert.match(js, /✓ Оформление карт обновлено/);
  assert.match(rs, /const EVENT: &str = "tnmaps-stylepack";/);
  // Событие start — только после should_install
  assert.match(rs, /if !should_install\(&remote, current, &app_version\) \{\n\s+return Ok\(false\);\n\s+\}\n\s+on_start\(remote\.version\);/);
});

// ─── поведение в настоящем DOM (jsdom через NODE_PATH, иначе пропуск) ───
import { createRequire } from 'node:module';
import vm from 'node:vm';
let JSDOM = null;
try { ({ JSDOM } = createRequire(import.meta.url)('jsdom')); } catch { /* нет jsdom */ }

function loadInDom() {
  const dom = new JSDOM(`<!doctype html><body>
    <button id="btn-map-layer">Карта</button>
    <div id="modal-layers"><button id="tnmaps-open-link" class="tnmaps-link">Карты областей</button></div>
    <div id="statusbar"><span id="app-version-label">v</span></div></body>`);
  const timers = [];
  const ctx = {
    console, document: dom.window.document, CSS: { escape: s => s }, MutationObserver: dom.window.MutationObserver,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    localStorage: { getItem: () => null, setItem() {} },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    L: { Layer: { extend: p => { function C(id) { this.initialize(id); } C.prototype = p; return C; } } },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('../ui/trophynav-maps-core.js'), ctx);
  vm.runInContext(read('../ui/trophynav-maps.js').replace('window.TrophyNavMaps = {',
    'window.__t = { state, renderUpdateMarks, onStylePackEvent }; window.TrophyNavMaps = {'), ctx);
  return { doc: dom.window.document, timers, ...ctx.__t };
}

test('DOM: новая версия области — кружки на кнопках и строка внизу; обновлённая — всё гаснет', { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' }, () => {
  const { doc, state, renderUpdateMarks } = loadInDom();
  const sha = 'a'.repeat(64);
  state.local = [{ id: 'ryazan', size: 100, sha256: 'b'.repeat(64) }, { id: 'penza', size: 50, sha256: sha }];
  state.catalog = { maps: [{ id: 'ryazan', name: 'Рязанская область', size: 120, sha256: sha }, { id: 'penza', size: 50, sha256: sha }] };
  renderUpdateMarks();
  assert.ok(doc.getElementById('btn-map-layer').classList.contains('tn-upd-dot'));
  assert.ok(doc.getElementById('tnmaps-open-link').classList.contains('tn-upd-dot'));
  const note = doc.getElementById('sb-maps-upd');
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /Новая версия карты: ryazan|Новая версия карты: Рязан/);
  // Строка — перед номером версии, внутри строки состояния
  assert.equal(note.nextElementSibling.id, 'app-version-label');
  // Качается — метки нет; скачалась (sha совпала) — тоже нет
  state.downloads.ryazan = { phase: 'download', done: 1, total: 2 };
  renderUpdateMarks();
  assert.equal(doc.getElementById('btn-map-layer').classList.contains('tn-upd-dot'), false);
  delete state.downloads.ryazan;
  state.local[0] = { id: 'ryazan', size: 120, sha256: sha };
  renderUpdateMarks();
  assert.equal(doc.getElementById('tnmaps-open-link').classList.contains('tn-upd-dot'), false);
  assert.equal(doc.getElementById('sb-maps-upd').hidden, true);
  // Без каталога (ещё не пришёл) — ничего не утверждаем
  state.catalog = null; state.local[0] = { id: 'ryazan', size: 1 };
  renderUpdateMarks();
  assert.equal(doc.getElementById('sb-maps-upd').hidden, true);
});

test('DOM: оформление — строка «обновление…», затем «обновлено» и сама гаснет; ошибка — сразу гаснет', { skip: !JSDOM && 'jsdom не найден (NODE_PATH)' }, () => {
  const { doc, timers, onStylePackEvent } = loadInDom();
  onStylePackEvent({ payload: { phase: 'start', version: 20 } });
  const el = doc.getElementById('sb-stylepack');
  assert.equal(el.hidden, false);
  assert.match(el.textContent, /Оформление карт: обновление/);
  onStylePackEvent({ payload: { phase: 'done', version: 20 } });
  assert.match(el.textContent, /обновлено/);
  assert.equal(timers.at(-1).ms, 6000);
  timers.at(-1).fn();
  assert.equal(el.hidden, true);
  onStylePackEvent({ payload: { phase: 'start', version: 21 } });
  onStylePackEvent({ payload: { phase: 'error', version: 21 } });
  assert.equal(el.hidden, true);
});
