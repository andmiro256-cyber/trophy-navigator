// 09.10: прогресс скачивания карт в строке состояния; полноэкранный режим (F11, меню, запоминается).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
const mapsSrc = fs.readFileSync(new URL('../ui/trophynav-maps.js', import.meta.url), 'utf8');
const caps = JSON.parse(fs.readFileSync(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8'));

test('строка состояния: прогресс скачивания карты и кнопка «остановить»', () => {
  const made = {};
  const el = () => ({ hidden: false, innerHTML: '', id: '', className: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, f) { this.on = f; } });
  const bar = { inserted: [], insertBefore(n) { this.inserted.push(n); made[n.id] = n; } };
  const calls = [];
  const ctx = { console, setTimeout, clearTimeout, queueMicrotask: f => f(), CSS: { escape: s => s },
    document: { readyState: 'loading', addEventListener() {}, createElement: el, querySelector: () => null,
      getElementById: id => (id === 'statusbar' ? bar : made[id] || null) },
    localStorage: { getItem: () => null, setItem() {} }, L: { Layer: { extend: p => p } },
    __TAURI_INTERNALS__: { invoke: async (c, a) => { calls.push([c, a]); return { maps: [], partial: {}, dir: '' }; } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(mapsSrc.replace('window.TrophyNavMaps = {', 'window.__t = { onDownloadEvent, renderStatusDownloads }; window.TrophyNavMaps = {'), ctx);
  const st = ctx.TrophyNavMaps._state;
  st.catalog = { maps: [{ id: 'leningrad', name: 'Ленинградская', size: 260 * 1048576 }] };
  ctx.__t.onDownloadEvent({ payload: { id: 'leningrad', phase: 'download', done: 120 * 1048576, total: 260 * 1048576 } });
  const sb = made['sb-download'];
  assert.ok(sb && !sb.hidden);
  assert.match(sb.innerHTML, /Ленинградская: 46% · 120 МБ из 260 МБ/);
  assert.match(sb.innerHTML, /data-sb-cancel="leningrad"/);
  sb.on({ target: { closest: () => ({ dataset: { sbCancel: 'leningrad' } }) } });
  assert.equal(JSON.stringify(calls[0]), JSON.stringify(['tnmaps_cancel', { id: 'leningrad' }]));
  ctx.__t.onDownloadEvent({ payload: { id: 'leningrad', phase: 'done' } });
  assert.equal(sb.hidden, true, 'скачалось — строка прячется');
});

test('полный экран: F11 и пункт меню, выбор запоминается, права окна выданы', () => {
  assert.match(html, /id="menu-fullscreen" onclick="closeToolbarMore\(\);toggleFullscreen\(\)"/);
  assert.match(html, /if \(e\.key !== 'F11' \|\| e\.ctrlKey \|\| e\.altKey \|\| e\.metaKey\) return;/);
  assert.match(html, /localStorage\.getItem\(TND_FS_KEY\) === '1'\) setTimeout\(\(\) => setFullscreen\(true, \{ remember: false \}\)/);
  assert.ok(caps.permissions.includes('core:window:allow-set-fullscreen'));
  assert.ok(caps.permissions.includes('core:window:allow-is-fullscreen'));
});
