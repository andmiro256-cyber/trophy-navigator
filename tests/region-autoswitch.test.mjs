import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../ui/trophynav-maps.js', import.meta.url), 'utf8');
function setup() {
  const prefs = new Map(), switches = [], messages = [], nodes = [], timers = [];
  const node = () => ({ dataset: {}, listeners: {}, remove() { this.removed = true; }, setAttribute() {},
    addEventListener(k, fn) { this.listeners[k] = fn; },
    querySelector(k) { return this.children[k] ||= node(); }, children: {} });
  const ctx = { console, Date, setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; },
      createElement: node, body: { appendChild(el) { nodes.push(el); } } },
    localStorage: { getItem: k => prefs.get(k) ?? null, setItem: (k, v) => prefs.set(k, v) },
    L: { Layer: { extend: p => p }, DomEvent: { disableClickPropagation() {}, disableScrollPropagation() {} } },
    currentBaseLayerName: 'tnmap:len', offlineBaseModeActive: false, hasActiveOfflineMaps: () => false,
    map: { getZoom: () => 8, getCenter: () => ({ lat: 59, lng: 33 }), hasLayer: () => true },
    showToast: msg => messages.push(msg),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source.replace('window.TrophyNavMaps = {',
    'window.__test = { auto, checkAutoRegion, scheduleAutoRegion }; window.TrophyNavMaps = {'), ctx);
  const api = ctx.TrophyNavMaps, state = api._state;
  const len = { id: 'len', name: 'Ленинградская', bounds: [29, 59, 32, 61], size: 1024 ** 2 };
  const nov = { id: 'nov', name: 'Новгородская', bounds: [31, 58, 34, 60], size: 2 * 1024 ** 2 };
  state.local = [len, nov]; state.catalog = { maps: [len, nov] }; state.activeLayer = { mapId: 'len' };
  ctx.setLayer = (name, el, opts) => { switches.push({ name, opts }); ctx.currentBaseLayerName = name; state.activeLayer = { mapId: name.slice(6) }; };
  return { ctx, api, state, prefs, switches, messages, nodes, timers, ...ctx.__test };
}

test('bounds: область по точке, текущая побеждает на стыке, каталог только по запросу', () => {
  const { api, state } = setup();
  assert.equal(api.regionAt(59, 33), 'nov');
  assert.equal(api.regionAt(59.5, 31.5, 'nov'), 'nov');
  assert.equal(api.regionAt(59.5, 31.5, 'len', true), 'len');
  assert.equal(api.regionAt(0, 0), null);
  state.local.pop();
  assert.equal(api.regionAt(59, 33), null);
  assert.equal(api.regionAt(59, 33, 'len', true), 'nov');
  state.catalog.maps.unshift({ id: 'russia', kind: 'overview', bounds: [-180, -90, 180, 90] });
  assert.equal(api.regionAt(0, 0, 'len', true), null, 'обзорная карта не является областью');
});

test('Z6+: тихое переключение скачанной области и короткий тост', async () => {
  const { ctx, switches, messages, checkAutoRegion } = setup();
  ctx.map.getZoom = () => 6;
  await checkAutoRegion();
  assert.equal(switches.length, 1);
  assert.equal(switches[0].name, 'tnmap:nov');
  assert.equal(switches[0].opts.quiet, true);
  assert.deepEqual(messages, ['Карта: Новгородская']);
});

test('Z<6, сторонняя подложка, офлайн-карта, отключённая настройка и движение не переключают', async () => {
  for (const disable of [
    s => { s.ctx.map.getZoom = () => 5; },
    s => { s.ctx.currentBaseLayerName = 'OpenStreetMap'; },
    s => { s.ctx.offlineBaseModeActive = true; },
    s => { s.ctx.hasActiveOfflineMaps = () => true; },
    s => { s.prefs.set('tnd-tnmaps-autoswitch', 'false'); },
    s => { s.auto.moving = true; },
  ]) {
    const s = setup(); disable(s); await s.checkAutoRegion();
    assert.equal(s.switches.length, 0); assert.equal(s.nodes.length, 0);
  }
});

test('moveend: дебаунс одна секунда', () => {
  const { scheduleAutoRegion, timers } = setup();
  scheduleAutoRegion(); assert.equal(timers.at(-1).ms, 1000);
});

test('предложение: Не сейчас действует только в этой сессии', async () => {
  const s = setup(); s.state.local.pop();
  await s.checkAutoRegion();
  const prompt = s.nodes[0];
  assert.match(prompt.innerHTML, /Скачать Новгородская \(2 МБ\)/);
  prompt.querySelector('[data-dismiss]').listeners.click();
  await s.checkAutoRegion();
  assert.equal(s.nodes.length, 1); assert.equal(prompt.removed, true);
  assert.equal(s.auto.dismissed.has('nov'), true); assert.equal(s.prefs.size, 0);
  const fresh = setup(); fresh.state.local.pop(); await fresh.checkAutoRegion();
  assert.equal(fresh.nodes.length, 1);
});

test('скачать: авто-показ после завершения, смена подложки во время скачивания сохраняется', async () => {
  for (const leave of [false, true]) {
    const s = setup(); const nov = s.state.local.pop();
    let release;
    s.ctx.__TAURI_INTERNALS__ = { invoke: async cmd => {
      if (cmd === 'tnmaps_download') return new Promise(r => { release = () => { s.state.local.push(nov); r(); }; });
      if (cmd === 'tnmaps_local') return { maps: s.state.local, partial: {}, dir: '' };
    } };
    await s.checkAutoRegion();
    const pending = s.nodes[0].querySelector('[data-download]').listeners.click();
    if (leave) s.ctx.currentBaseLayerName = 'OpenStreetMap';
    release(); await pending;
    assert.equal(s.switches.length, leave ? 0 : 1);
  }
});

test('сбой каталога: повтор через минуту, без подавления области; поздний ответ не меняет подложку', async () => {
  const s = setup(); s.state.catalog = null; s.state.local.pop();
  s.ctx.__TAURI_INTERNALS__ = { invoke: async () => { throw new Error('offline'); } };
  await s.checkAutoRegion();
  assert.equal(s.auto.dismissed.size, 0); assert.equal(s.timers.at(-1).ms, 60000);
  s.auto.retryAt = 0;
  const nov = { id: 'nov', bounds: [31, 58, 34, 60], size: 1 };
  s.ctx.__TAURI_INTERNALS__.invoke = async () => {
    s.ctx.currentBaseLayerName = 'OpenStreetMap'; return { catalog: { maps: [nov] } };
  };
  await s.checkAutoRegion(); assert.equal(s.nodes.length, 0); assert.equal(s.switches.length, 0);
});

test('ручной выбор держится внутри bounds выбранной области', async () => {
  const s = setup();
  s.ctx.map.getCenter = () => ({ lat: 59.5, lng: 31.5 });
  await s.checkAutoRegion();
  assert.equal(s.switches.length, 0); assert.equal(s.nodes.length, 0);
});

test('без лицензии предложения нет; неудачное скачивание гасит предложение до перезапуска', async () => {
  const s = setup(); s.state.local.pop();
  s.ctx.isPremiumAvailable = () => false;
  await s.checkAutoRegion(); await s.checkAutoRegion();
  assert.equal(s.nodes.length, 0);

  const f = setup(); f.state.local.pop();
  f.ctx.__TAURI_INTERNALS__ = { invoke: async cmd => {
    if (cmd === 'tnmaps_download') throw new Error('сеть недоступна');
    if (cmd === 'tnmaps_local') return { maps: f.state.local, partial: {}, dir: '' };
  } };
  await f.checkAutoRegion();
  await f.nodes[0].querySelector('[data-download]').listeners.click();
  assert.equal(f.auto.dismissed.has('nov'), true);
  await f.checkAutoRegion(); await f.checkAutoRegion();
  assert.equal(f.nodes.length, 1);
  assert.equal(f.switches.length, 0);
});
