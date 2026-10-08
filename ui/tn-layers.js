/*
 * Слои карты поверх основной («Карта и слои» → «Слои поверх»): спутник с затемнением, поверх — векторная
 * TrophyNav Maps «только дороги и подписи» или полупрозрачная растровая карта; до 3 слоёв сразу.
 *
 * Модель (чистые функции, без DOM — tests/layer-mixing.test.mjs) переносится на будущий MapLibre
 * (контракт R9 плана перехода): стабильный id экземпляра, источник, enabled, порядок, opacity, настройки
 * растра (яркость/контраст/насыщенность, нейтраль 0) и режим TrophyNav Maps. toR9() отдаёт MapStack R9.
 *
 * Отрисовка на Leaflet: у каждого слоя свой pane (z-index по порядку, все ниже пользовательских
 * объектов), opacity — setOpacity у растров и opacity холста у векторной карты, яркость/контраст/
 * насыщенность — CSS filter на pane этого слоя. Основа (tilePane и офлайн-карты) может получить свою
 * яркость. Оверлеи каталога («Яндекс Подписи», WayMarkedTrails…) — элементы этого же стека.
 *
 * Правило проекции (план v3, K3): Leaflet держит одну проекцию на карту. Слой в другой проекции, чем
 * основа (Яндекс 3395 против всех остальных 3857), временно не показывается — с подсказкой, без потери
 * настроек; при смене основы возвращается сам.
 *
 * Глобальные переменные основного скрипта (map, currentBaseLayerName, tileCatalog…) читаются лениво:
 * в общем лексическом окружении скриптов страницы они видны, в тестах — нет (host подменяется).
 */
(function (root) {
  'use strict';

  // ═══ Модель ═══
  const VERSION = 1;
  const MAX_ITEMS = 3;
  const LS_STACK = 'tnd-map-stack';
  const LS_PRESETS = 'tnd-map-stack-presets';
  const ADJ_KEYS = ['brightness', 'contrast', 'saturation'];
  const NEUTRAL = Object.freeze({ brightness: 0, contrast: 0, saturation: 0 });
  const TN_MODES = ['full', 'roads-labels'];
  const SOURCE_KINDS = ['map', 'tnmap', 'overlay', 'offline', 'custom'];
  // z-index pane'ов: основа — tilePane 200 и офлайн-карты 210; пользовательские объекты — от 400
  // (overlayPane: треки и маршруты), WP 430/640, маркеры 600. Слои поверх — строго между.
  const PANE_Z0 = 300;
  const PANE_STEP = 10;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = (v, def) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : def);
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const round2 = v => Math.round(v * 100) / 100;
  /** Непрозрачность 0..1 шагом 0.05 (как ползунок 0–100 % шагом 5). */
  const normOpacity = v => Math.round(clamp(num(v, 1), 0, 1) * 20) / 20;

  function normalizeAdjust(a) {
    const src = isObj(a) ? a : {};
    const out = {};
    ADJ_KEYS.forEach(k => { out[k] = round2(clamp(num(src[k], 0), -1, 1)); });
    return out;
  }
  const isNeutralAdjust = a => ADJ_KEYS.every(k => !normalizeAdjust(a)[k]);

  /** Множитель контраста/насыщенности как у MapLibre: x>0 → 1/(1−x), x<0 → 1+x. */
  const spread = x => (x > 0 ? 1 / (1 - Math.min(x, 0.95)) : 1 + x);
  /** CSS filter для pane растрового слоя; нейтральные значения — пустая строка (без лишней композиции). */
  function cssFilter(a) {
    const n = normalizeAdjust(a);
    if (isNeutralAdjust(n)) return '';
    const parts = [];
    if (n.brightness) parts.push(`brightness(${round2(1 + n.brightness)})`);
    if (n.contrast) parts.push(`contrast(${round2(spread(n.contrast))})`);
    if (n.saturation) parts.push(`saturate(${round2(spread(n.saturation))})`);
    return parts.join(' ');
  }
  /**
   * Те же настройки в paint-свойствах MapLibre (R9): яркость < 0 опускает верх диапазона, > 0 поднимает низ,
   * поэтому min ≤ max выполняется по построению.
   */
  function maplibreRasterPaint(a) {
    const n = normalizeAdjust(a);
    return {
      'raster-brightness-min': n.brightness > 0 ? n.brightness : 0,
      'raster-brightness-max': n.brightness < 0 ? round2(1 + n.brightness) : 1,
      'raster-contrast': n.contrast,
      'raster-saturation': n.saturation,
    };
  }

  /** «map:Google Спутник» → 'map'; «tnmap:lo», «overlay:…», «offline:<путь>», «custom:<имя>». */
  function sourceKind(source) {
    const m = /^([a-z]+):(.+)$/s.exec(String(source || ''));
    return m && SOURCE_KINDS.includes(m[1]) ? m[1] : null;
  }
  const sourceId = source => String(source).slice(String(source).indexOf(':') + 1);
  /** Источник основы по имени карты в currentBaseLayerName (там TrophyNav Maps и свои карты уже с префиксом). */
  const baseSourceFor = name => (/^(tnmap|custom):/.test(String(name || '')) ? String(name) : `map:${name || ''}`);

  function makeIid(taken = new Set()) {
    let iid;
    do iid = 'st_' + (Date.now() % 1e9).toString(36) + Math.floor(Math.random() * 46656).toString(36).padStart(3, '0');
    while (taken.has(iid));
    return iid;
  }

  function normalizeItem(raw, taken = new Set()) {
    if (!isObj(raw) || !sourceKind(raw.source)) return null;
    const kind = sourceKind(raw.source);
    let iid = typeof raw.iid === 'string' && /^st_[a-z0-9_]{1,24}$/.test(raw.iid) && !taken.has(raw.iid) ? raw.iid : makeIid(taken);
    taken.add(iid);
    const item = {
      iid,
      source: String(raw.source),
      label: String(raw.label || sourceId(raw.source)).slice(0, 200),
      enabled: raw.enabled !== false,
      opacity: normOpacity(raw.opacity),
      raster: normalizeAdjust(raw.raster),
    };
    if (kind === 'tnmap') {
      const tn = isObj(raw.tn) ? raw.tn : {};
      item.tn = { mode: TN_MODES.includes(tn.mode) ? tn.mode : 'roads-labels', poi: tn.poi === true };
    }
    return item;
  }

  function emptyStack() { return { version: VERSION, base: { raster: { ...NEUTRAL } }, items: [] }; }

  /** Стек из чего угодно (сессия, localStorage, пресет): один экземпляр на источник, не больше MAX_ITEMS. */
  function normalizeStack(raw) {
    const out = emptyStack();
    if (!isObj(raw)) return out;
    out.base.raster = normalizeAdjust(isObj(raw.base) ? raw.base.raster : null);
    const taken = new Set(), sources = new Set();
    (Array.isArray(raw.items) ? raw.items : []).forEach(r => {
      if (out.items.length >= MAX_ITEMS) return;
      const item = normalizeItem(r, taken);
      if (!item || sources.has(item.source)) return;
      sources.add(item.source);
      out.items.push(item);
    });
    return out;
  }
  const cloneStack = s => normalizeStack(JSON.parse(JSON.stringify(s)));
  const findItem = (stack, iid) => stack.items.find(i => i.iid === iid) || null;
  const findBySource = (stack, source) => stack.items.find(i => i.source === source) || null;

  /**
   * Добавить слой наверх. Тот же источник второй раз не добавляется (existed — строку подсветить),
   * больше MAX_ITEMS — full. opacity по умолчанию — 1 (у оверлеев каталога — их собственная).
   */
  function addItem(stack, { source, label, opacity, enabled, tn, raster } = {}) {
    const s = cloneStack(stack);
    const kind = sourceKind(source);
    if (!kind) return { stack: s, item: null, error: 'source' };
    const existing = findBySource(s, source);
    if (existing) return { stack: s, item: existing, existed: true };
    if (s.items.length >= MAX_ITEMS) return { stack: s, item: null, full: true };
    const item = normalizeItem({ source, label, opacity: opacity ?? 1, enabled, tn, raster }, new Set(s.items.map(i => i.iid)));
    s.items.push(item);
    return { stack: s, item };
  }
  function removeItem(stack, iid) {
    const s = cloneStack(stack);
    s.items = s.items.filter(i => i.iid !== iid);
    return s;
  }
  /** Сдвиг по стеку: +1 — выше (ближе к пользовательским объектам), −1 — ниже. */
  function moveItem(stack, iid, delta) {
    const s = cloneStack(stack);
    const from = s.items.findIndex(i => i.iid === iid);
    if (from < 0) return s;
    return moveItemTo(s, iid, from + Math.sign(delta || 0));
  }
  function moveItemTo(stack, iid, index) {
    const s = cloneStack(stack);
    const from = s.items.findIndex(i => i.iid === iid);
    if (from < 0) return s;
    const to = clamp(Math.round(num(index, from)), 0, s.items.length - 1);
    const [item] = s.items.splice(from, 1);
    s.items.splice(to, 0, item);
    return s;
  }
  /** enabled, opacity, tn {mode, poi} — остальное игнорируется. */
  function updateItem(stack, iid, patch = {}) {
    const s = cloneStack(stack);
    const item = findItem(s, iid);
    if (!item) return s;
    if ('enabled' in patch) item.enabled = !!patch.enabled;
    if ('opacity' in patch) item.opacity = normOpacity(patch.opacity);
    if (item.tn && isObj(patch.tn)) {
      if (TN_MODES.includes(patch.tn.mode)) item.tn.mode = patch.tn.mode;
      if ('poi' in patch.tn) item.tn.poi = !!patch.tn.poi;
    }
    return s;
  }
  /** target — 'base' (основная карта) или iid слоя. */
  function setAdjust(stack, target, patch = {}) {
    const s = cloneStack(stack);
    const holder = target === 'base' ? s.base : findItem(s, target);
    if (!holder) return s;
    holder.raster = normalizeAdjust({ ...holder.raster, ...patch });
    return s;
  }
  const resetAdjust = (stack, target) => setAdjust(stack, target, { ...NEUTRAL });

  /** Для сессии/localStorage: только сохраняемые поля, без runtime-состояния. */
  function serializeStack(stack) {
    const s = normalizeStack(stack);
    return JSON.parse(JSON.stringify(s));
  }

  // ─── Наборы (пресеты): заменяют стек целиком, основа — если указана ───
  function normalizePresets(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const seen = new Set();
    return list.filter(p => isObj(p) && typeof p.name === 'string' && p.name.trim()).map(p => ({
      id: typeof p.id === 'string' && p.id ? p.id : makeIid(),
      name: p.name.trim().slice(0, 80),
      baseLayer: typeof p.baseLayer === 'string' ? p.baseLayer : '',
      stack: serializeStack(p.stack),
    })).filter(p => !seen.has(p.id) && seen.add(p.id));
  }
  /** Тот же name — набор перезаписывается (id сохраняется). */
  function savePreset(presets, name, stack, baseLayer = '') {
    const list = normalizePresets(presets);
    const clean = String(name || '').trim().slice(0, 80);
    if (!clean) return list;
    const entry = { id: makeIid(new Set(list.map(p => p.id))), name: clean, baseLayer: String(baseLayer || ''), stack: serializeStack(stack) };
    const at = list.findIndex(p => p.name.toLowerCase() === clean.toLowerCase());
    if (at >= 0) { entry.id = list[at].id; list[at] = entry; } else list.push(entry);
    return list;
  }
  const deletePreset = (presets, id) => normalizePresets(presets).filter(p => p.id !== id);
  const presetStack = preset => normalizeStack(preset?.stack);

  /** MapStack R9 (план перехода на MapLibre): items[0] — основа, дальше слои снизу вверх. */
  function toR9(stack, baseSource) {
    const s = normalizeStack(stack);
    const raster = a => {
      const p = maplibreRasterPaint(a);
      return { brightnessMin: p['raster-brightness-min'], brightnessMax: p['raster-brightness-max'], contrast: p['raster-contrast'], saturation: p['raster-saturation'] };
    };
    const items = [];
    if (baseSource) items.push({ iid: 'st_base', source: baseSource, enabled: true, opacity: 1, raster: raster(s.base.raster) });
    s.items.forEach(i => {
      const out = { iid: i.iid, source: i.source, enabled: i.enabled, opacity: i.opacity };
      if (i.tn) out.tn = { mode: i.tn.mode, poi: i.tn.poi ? 'all' : 'none' };
      else out.raster = raster(i.raster);
      items.push(out);
    });
    return { version: 1, items };
  }

  /**
   * Почему слой не рисуется. null — рисуется.
   * resolved: {status:'ok'|'pending'|'missing'|'locked', crs}; baseSources — Set источников основы.
   */
  function suspendReason(item, { resolved, baseCrs, baseSources }) {
    if (!resolved || resolved.status !== 'ok') return resolved?.status || 'missing';
    if (baseSources && baseSources.has(item.source)) return 'base';
    if ((resolved.crs || 'EPSG3857') !== (baseCrs || 'EPSG3857')) return 'crs';
    if (!item.enabled) return 'off';
    return null;
  }
  const paneZ = index => PANE_Z0 + clamp(index, 0, 9) * PANE_STEP;

  const Model = {
    VERSION, MAX_ITEMS, NEUTRAL, TN_MODES, PANE_Z0, PANE_STEP, LS_STACK, LS_PRESETS,
    normalizeAdjust, isNeutralAdjust, cssFilter, maplibreRasterPaint, sourceKind, sourceId, baseSourceFor,
    makeIid, normalizeItem, emptyStack, normalizeStack, cloneStack, findItem, findBySource, addItem, removeItem,
    moveItem, moveItemTo, updateItem, setAdjust, resetAdjust, serializeStack,
    normalizePresets, savePreset, deletePreset, presetStack, toR9, suspendReason, paneZ, normOpacity,
  };

  // ═══ Связь с основным скриптом index.html ═══
  const g = fn => { try { return fn(); } catch { return undefined; } };
  /* global map, currentBaseLayerName, currentCRS, yandexLayers, tileCatalog, offlineMaps, customLayers,
     overlayLayers, makeBaseLayer, FREE_LAYER_KEYS, isPremiumAvailable, makeOfflineStackLayer, saveState */
  const FREE_FALLBACK = new Set(['OpenStreetMap', 'OpenTopoMap', 'CyclOSM', 'OSM Humanitarian']);
  const defaultHost = {
    map: () => g(() => map),
    L: () => root.L,
    baseName: () => g(() => currentBaseLayerName) || '',
    crs: () => g(() => currentCRS) || 'EPSG3857',
    isYandex3395: name => !!g(() => yandexLayers.has(name)),
    catalog: () => g(() => tileCatalog) || null,
    offlineMaps: () => g(() => offlineMaps) || {},
    customLayers: () => g(() => customLayers) || [],
    overlayProto: label => g(() => overlayLayers[label]) || null,
    makeBaseLayer: name => g(() => makeBaseLayer(name)) || null,
    makeOfflineLayer: (path, opts) => g(() => makeOfflineStackLayer(path, opts)) || Promise.reject(new Error('офлайн-карта недоступна')),
    isPremium: name => {
      if (FREE_FALLBACK.has(name)) return false;
      const entry = (g(() => tileCatalog.base) || []).find(e => e.label === name);
      return !(entry && g(() => FREE_LAYER_KEYS.has(entry.key)));
    },
    premiumAvailable: () => g(() => isPremiumAvailable()) !== false,
    tn: () => root.TrophyNavMaps || null,
    toast: (msg, type) => { if (typeof root.showToast === 'function') root.showToast(msg, type); },
    prompt: (msg, def, title) => (typeof root.tndPrompt === 'function' ? root.tndPrompt(msg, def, title) : Promise.resolve(null)),
    confirm: (msg, title) => (typeof root.tndConfirmDanger === 'function' ? root.tndConfirmDanger(msg, title) : Promise.resolve(true)),
    saveSession: () => g(() => saveState({ fileDelay: 1000 })),
    storage: () => g(() => root.localStorage) || null,
    doc: () => (typeof document !== 'undefined' ? document : null),
  };
  let host = { ...defaultHost };

  const lsGet = k => { try { return host.storage()?.getItem(k) ?? null; } catch { return null; } };
  const lsSet = (k, v) => { try { host.storage()?.setItem(k, v); } catch { /* приватный режим, квота */ } };

  /** Как показать источник: {status, crs, kind, label, make(pane) | makeAsync(pane)} */
  function resolveSource(source) {
    const kind = sourceKind(source);
    const id = kind ? sourceId(source) : '';
    if (kind === 'tnmap') {
      const tn = host.tn();
      if (!tn?.makeStackLayer) return { status: 'missing', reason: 'нет модуля TrophyNav Maps' };
      if (tn.hasWebGL && !tn.hasWebGL()) return { status: 'missing', reason: 'нет WebGL' };
      const st = tn._state || {};
      const known = (st.local || []).some(m => m.id === id && !m.error);
      if (!known && st.dir) return { status: 'missing', reason: 'область не скачана' };
      return { status: 'ok', kind, crs: 'EPSG3857', label: tn.labelFor ? tn.labelFor(source) : source };
    }
    if (kind === 'overlay') {
      const cat = host.catalog();
      const entry = (cat?.overlays || []).find(e => e.label === id);
      if (entry || host.overlayProto(id)) return { status: 'ok', kind, crs: 'EPSG3857', entry, defaultOpacity: entry?.opacity ?? host.overlayProto(id)?.options?.opacity ?? 0.7 };
      return cat ? { status: 'missing', reason: 'нет в каталоге' } : { status: 'pending' };
    }
    if (kind === 'offline') {
      const entry = host.offlineMaps()[id];
      if (!entry || entry.missing) return { status: 'missing', reason: 'нет файла' };
      return { status: 'ok', kind, crs: 'EPSG3857', async: true };
    }
    if (kind === 'custom') {
      const entry = host.customLayers().find(l => l.name === id);
      return entry ? { status: 'ok', kind, crs: 'EPSG3857', entry } : { status: 'missing', reason: 'карта удалена' };
    }
    if (kind === 'map') {
      if (host.isPremium(id) && !host.premiumAvailable()) return { status: 'locked', reason: 'нужна лицензия' };
      const crs = host.isYandex3395(id) ? 'EPSG3395' : 'EPSG3857';
      // Каталог ещё не загружен — карта из каталога появится позже
      const cat = host.catalog();
      const inCatalog = (cat?.base || []).some(e => e.label === id);
      if (!inCatalog && !FALLBACK_KNOWN.has(id)) return cat ? { status: 'missing', reason: 'нет в каталоге' } : { status: 'pending', crs };
      return { status: 'ok', kind, crs };
    }
    return { status: 'missing', reason: 'неизвестный источник' };
  }
  // Карты, которые makeBaseLayer умеет и без каталога (зашитые в index.html)
  const FALLBACK_KNOWN = new Set(['Яндекс Схема', 'Яндекс Гибрид', 'Яндекс Спутник', 'Спутник Bing', 'Гибрид Bing',
    'OpenStreetMap', 'OpenTopoMap', '2GIS', 'Спутник Google', 'Гибрид Google', 'Спутник ESRI', 'ESRI Clarity',
    'Космоснимки рельеф', 'Карты Google', 'Рельеф Google', 'CyclOSM', 'OSM Humanitarian', 'TF Outdoors', 'LoMaps',
    'TF Transport', 'TF Велосипед', 'MTB Map', 'Michelin', 'ГГЦ 250м', 'ГГЦ 500м', 'ГГЦ 1км', 'ГГЦ 2км', 'Генштаб 250м']);

  /** Leaflet-слой источника в своём pane. null — показать нельзя. */
  function buildLayer(item, resolved, pane, hooks) {
    const L = host.L();
    const kind = resolved.kind;
    const id = sourceId(item.source);
    if (kind === 'tnmap') {
      return host.tn().makeStackLayer(id, { pane, mode: item.tn?.mode || 'roads-labels', poi: !!item.tn?.poi, onError: hooks.onError, onReady: hooks.onReady });
    }
    if (kind === 'overlay') {
      const e = resolved.entry;
      if (e) return L.tileLayer(e.proxy || e.url, { maxZoom: 22, maxNativeZoom: e.maxZoom || 18, tms: !!e.tms, pane, opacity: item.opacity });
      const proto = host.overlayProto(id);
      return new proto.constructor(proto._url, { ...proto.options, pane, opacity: item.opacity });
    }
    if (kind === 'custom') {
      const e = resolved.entry;
      return L.tileLayer(e.url, { maxZoom: 22, maxNativeZoom: e.maxZoom || 18, tms: !!e.tms, subdomains: e.subdomains || 'abc', pane, opacity: item.opacity });
    }
    if (kind === 'map') {
      const layer = host.makeBaseLayer(id);
      if (!layer) return null;
      // pane читается в onAdd — достаточно выставить до добавления на карту (у «Гибрида» — каждому слою группы)
      eachTileLayer(layer, l => { l.options.pane = pane; });
      return layer;
    }
    return null;
  }
  function eachTileLayer(layer, fn) {
    if (!layer) return;
    if (typeof layer.eachLayer === 'function' && !layer.setOpacity) layer.eachLayer(l => eachTileLayer(l, fn));
    else fn(layer);
  }

  // ═══ Отрисовка на Leaflet ═══
  let stack = emptyStack();
  let presets = [];
  let previousStack = null;      // «Вернуть прежний набор» после применения набора
  const runtime = new Map();     // iid → { layer, sig, pane, view, health, token }
  let saveTimer = null;

  const paneName = iid => `tnst-${iid}`;
  function signature(item) {
    const tn = item.tn ? `:${item.tn.mode}:${item.tn.poi ? 1 : 0}` : '';
    return item.source + tn;
  }
  /** Источники, которые сейчас показаны основой: выбранная карта и включённые офлайн-карты. */
  function baseSources() {
    const set = new Set([baseSourceFor(host.baseName())]);
    const m = host.map();
    Object.entries(host.offlineMaps()).forEach(([path, e]) => {
      if (e?.layer && m?.hasLayer?.(e.layer)) set.add(`offline:${path}`);
    });
    return set;
  }

  function setHealth(rt, health) {
    if (rt.health === health) return;
    rt.health = health;
    updateRowNotes();
  }
  function watchTiles(rt, layer) {
    const stats = { ok: 0, err: 0 };
    eachTileLayer(layer, l => {
      if (typeof l.on !== 'function') return;
      l.on('loading', () => { stats.ok = 0; stats.err = 0; });
      l.on('tileload', () => { stats.ok++; setHealth(rt, 'ok'); });
      l.on('tileerror', () => { stats.err++; if (!stats.ok && stats.err >= 4) setHealth(rt, 'error'); });
    });
  }

  function dropLayer(m, rt) {
    rt.token = (rt.token || 0) + 1;
    if (rt.layer && m?.hasLayer?.(rt.layer)) m.removeLayer(rt.layer);
    rt.layer = null;
    rt.health = null;
    rt.pendingBuild = false;
  }
  function dropPane(m, iid) {
    const name = paneName(iid);
    const p = m?.getPane?.(name);
    if (p) { p.remove(); if (m._panes) delete m._panes[name]; }
  }

  function applyLook(rt, item, pane) {
    if (!pane) return;
    const isTn = sourceKind(item.source) === 'tnmap';
    if (isTn) pane.style.opacity = String(item.opacity);
    else {
      pane.style.opacity = '';
      if (rt.layer) eachTileLayer(rt.layer, l => l.setOpacity?.(item.opacity));
    }
    // Настройки растра — только на pane этого слоя; векторную карту не трогают
    pane.style.filter = isTn ? '' : cssFilter(item.raster);
  }
  function applyBaseLook(m) {
    const f = cssFilter(stack.base.raster);
    ['tilePane', 'offlineTiles'].forEach(name => { const p = m.getPane?.(name); if (p) p.style.filter = f; });
  }

  /** Привести карту к модели. Слои, которые не меняются, не пересоздаются. */
  function apply() {
    const m = host.map();
    if (!m || typeof m.getPane !== 'function') { renderPanel(); return; }
    applyBaseLook(m);
    const bases = baseSources();
    const baseCrs = host.crs();
    const alive = new Set();
    stack.items.forEach((item, index) => {
      alive.add(item.iid);
      let rt = runtime.get(item.iid);
      if (!rt) { rt = { layer: null, sig: '', token: 0, health: null, view: null }; runtime.set(item.iid, rt); }
      const name = paneName(item.iid);
      const pane = m.getPane(name) || m.createPane(name);
      pane.style.zIndex = String(paneZ(index));
      pane.style.pointerEvents = 'none';
      pane.classList?.add('tnst-pane');
      const resolved = resolveSource(item.source);
      const reason = suspendReason(item, { resolved, baseCrs, baseSources: bases });
      rt.view = { reason, detail: resolved.reason || '', crs: resolved.crs };
      const sig = signature(item);
      if (rt.layer && (reason || rt.sig !== sig)) dropLayer(m, rt);
      if (!reason && !rt.layer && !rt.pendingBuild) startBuild(m, rt, item, resolved, name);
      if (reason) { rt.pendingBuild = false; rt.token++; }
      applyLook(rt, item, pane);
    });
    [...runtime.keys()].forEach(iid => {
      if (alive.has(iid)) return;
      dropLayer(m, runtime.get(iid));
      dropPane(m, iid);
      runtime.delete(iid);
    });
    renderPanel();
  }

  function startBuild(m, rt, item, resolved, pane) {
    const token = ++rt.token;
    rt.sig = signature(item);
    rt.health = 'loading';
    const hooks = {
      onError: msg => { if (token === rt.token) { rt.error = String(msg || ''); setHealth(rt, 'error'); } },
      onReady: () => { if (token === rt.token) setHealth(rt, 'ok'); },
    };
    const attach = layer => {
      if (token !== rt.token) return;
      if (!layer) { rt.view = { ...(rt.view || {}), reason: 'missing', detail: 'карта не найдена' }; rt.health = null; renderPanel(); return; }
      rt.layer = layer;
      watchTiles(rt, layer);
      try { layer.addTo(m); } catch (e) { console.warn('Слой поверх не добавился:', e); setHealth(rt, 'error'); return; }
      const it = findItem(stack, item.iid);
      if (it) applyLook(rt, it, m.getPane(pane));
    };
    if (resolved.async) {
      rt.pendingBuild = true;
      Promise.resolve(host.makeOfflineLayer(sourceId(item.source), { pane, opacity: item.opacity }))
        .then(layer => { rt.pendingBuild = false; attach(layer); })
        .catch(e => { rt.pendingBuild = false; if (token === rt.token) { rt.error = e?.message || String(e); setHealth(rt, 'error'); } });
      return;
    }
    let layer = null;
    try { layer = buildLayer(item, resolved, pane, hooks); } catch (e) { console.warn('Слой поверх не создан:', e); }
    attach(layer);
  }

  // ─── изменения модели ───
  function persist() {
    lsSet(LS_STACK, JSON.stringify(serializeStack(stack)));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => host.saveSession(), 600);
  }
  function commit(next, { keepPrevious = false } = {}) {
    stack = normalizeStack(next);
    if (!keepPrevious) previousStack = null;
    persist();
    apply();
    syncOverlayControls();
  }

  // ═══ Панель «Слои поверх» ═══
  const ui = { open: new Set(), picker: false, flash: null };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (name, cls) => (typeof root.tnIcon === 'function' ? root.tnIcon(name, cls) : '');
  const pct = v => `${Math.round(v * 100)}%`;
  const signed = v => (v > 0 ? `+${Math.round(v * 100)}` : `${Math.round(v * 100)}`);

  function kindIcon(source, label) {
    const kind = sourceKind(source);
    if (kind === 'tnmap') return 'compass';
    if (kind === 'offline') return 'download';
    if (kind === 'overlay') return 'layers-o';
    return /Спутник|Гибрид|Satellite/i.test(label) ? 'satellite' : /Рельеф|Topo|Генштаб/i.test(label) ? 'terrain' : 'map';
  }
  function baseLabel() {
    const name = host.baseName();
    const tn = host.tn();
    if (tn?.isLayerName?.(name)) return tn.labelFor(name);
    return String(name).replace(/^custom:/, '');
  }
  function noteFor(item) {
    const rt = runtime.get(item.iid);
    const view = rt?.view;
    const reason = view?.reason;
    if (reason === 'missing') return { cls: 'warn', text: `Недоступен${view.detail ? ': ' + view.detail : ''}. Настройки сохранены.` };
    if (reason === 'locked') return { cls: 'warn', text: 'Недоступен: Premium-карта, нужна лицензия. Настройки сохранены.' };
    if (reason === 'pending') return { cls: '', text: 'Ждёт загрузки каталога карт…' };
    if (reason === 'base') return { cls: '', text: 'Эта карта сейчас основная — слой не дублируется.' };
    if (reason === 'crs') {
      return view.crs === 'EPSG3395'
        ? { cls: 'warn', text: 'Временно скрыт: карта Яндекса в своей проекции, с этой основой не совпадёт.' }
        : { cls: 'warn', text: 'Временно скрыт: основа — Яндекс в своей проекции, слой лёг бы со сдвигом.' };
    }
    if (reason === 'off') return null;
    if (rt?.health === 'error') return { cls: 'warn', text: rt.error ? `Ошибка: ${rt.error}` : 'Нет тайлов (сеть или источник) — нижние карты видны.' };
    return null;
  }

  function sliderRow(label, key, value, target) {
    return `<label class="tnst-adj-row"><span class="tnst-adj-label">${esc(label)}</span>
      <input type="range" min="-100" max="100" step="5" value="${Math.round(value * 100)}" data-adj="${key}" data-target="${esc(target)}" aria-label="${esc(label)}">
      <span class="tnst-pct" data-adj-val="${key}">${signed(value)}</span></label>`;
  }
  function adjustHtml(target, raster) {
    return `<div class="tnst-adjust" data-adjust-for="${esc(target)}">
      ${sliderRow('Яркость', 'brightness', raster.brightness, target)}
      ${sliderRow('Контраст', 'contrast', raster.contrast, target)}
      ${sliderRow('Насыщенность', 'saturation', raster.saturation, target)}
      <div class="tnst-adj-actions"><button type="button" class="tnst-link" data-act="reset" data-iid="${esc(target)}">${ico('undo', 'tn-ico-t')}Сбросить</button></div>
    </div>`;
  }
  function tnSettingsHtml(item) {
    const mode = item.tn.mode;
    const btn = (m, title) => `<button type="button" class="tnst-seg-btn${mode === m ? ' active' : ''}" data-act="tn-mode" data-mode="${m}" data-iid="${esc(item.iid)}" aria-pressed="${mode === m}">${title}</button>`;
    return `<div class="tnst-adjust" data-adjust-for="${esc(item.iid)}">
      <div class="tnst-seg" role="group" aria-label="Что показывать">${btn('full', 'Целиком')}${btn('roads-labels', 'Дороги и подписи')}</div>
      <label class="tnst-check${mode === 'full' ? ' off' : ''}"><input type="checkbox" data-act="tn-poi" data-iid="${esc(item.iid)}" ${item.tn.poi ? 'checked' : ''} ${mode === 'full' ? 'disabled' : ''}><span>Значки (заправки, ночлег…)</span></label>
      <div class="tnst-hint">Тема, рельеф и значки — как у этой области в TrophyNav Maps.</div>
    </div>`;
  }
  function rowHtml(item, index, total) {
    const note = noteFor(item);
    const open = ui.open.has(item.iid);
    const isTn = !!item.tn;
    const label = item.label || sourceId(item.source);
    // «TrophyNav Maps · Ленинградская область» в узкой строке — только область, вид карты показывает значок и метка
    const shown = isTn ? label.replace(/^TrophyNav Maps\s*·\s*/, '') : label;
    const top = index === total - 1, bottom = index === 0;
    return `<div class="tnst-row${item.enabled ? '' : ' disabled'}${ui.flash === item.iid ? ' flash' : ''}" data-iid="${esc(item.iid)}" data-reason="${esc(runtime.get(item.iid)?.view?.reason || '')}">
      <div class="tnst-line">
        <button type="button" class="tn-icon-btn tn-icon-btn-s tnst-drag" data-act="drag" data-iid="${esc(item.iid)}" title="Перетащите, чтобы поменять порядок" aria-label="Перетащить ${esc(label)}">${ico('swap-vert')}</button>
        <button type="button" class="tn-icon-btn tn-icon-btn-s" data-act="toggle" data-iid="${esc(item.iid)}" aria-pressed="${item.enabled}" title="${item.enabled ? 'Скрыть слой' : 'Показать слой'}" aria-label="${item.enabled ? 'Скрыть' : 'Показать'} ${esc(label)}">${ico(item.enabled ? 'eye' : 'eye-off')}</button>
        <span class="tnst-name" title="${esc(label)}">${ico(kindIcon(item.source, label), 'tn-ico-t tn-ico-m')}<span>${esc(shown)}</span>${isTn ? `<span class="tnst-badge">TN · ${item.tn.mode === 'full' ? 'целиком' : 'дороги'}</span>` : ''}</span>
        <button type="button" class="tn-icon-btn tn-icon-btn-s${open ? ' on' : ''}" data-act="settings" data-iid="${esc(item.iid)}" aria-expanded="${open}" title="Настроить" aria-label="Настроить ${esc(label)}">${ico('sliders')}</button>
        <button type="button" class="tn-icon-btn tn-icon-btn-s danger" data-act="remove" data-iid="${esc(item.iid)}" title="Убрать слой" aria-label="Убрать ${esc(label)}">${ico('delete')}</button>
      </div>
      <div class="tnst-line tnst-op">
        <span class="tnst-op-label">Прозрачность</span>
        <input type="range" min="0" max="100" step="5" value="${Math.round(item.opacity * 100)}" data-act="opacity" data-iid="${esc(item.iid)}" aria-label="Прозрачность ${esc(label)}">
        <span class="tnst-pct" data-opacity-val>${pct(item.opacity)}</span>
        <button type="button" class="tn-icon-btn tn-icon-btn-s" data-act="up" data-iid="${esc(item.iid)}" ${top ? 'disabled' : ''} title="Выше" aria-label="Поднять ${esc(label)}">${ico('chevron-up')}</button>
        <button type="button" class="tn-icon-btn tn-icon-btn-s" data-act="down" data-iid="${esc(item.iid)}" ${bottom ? 'disabled' : ''} title="Ниже" aria-label="Опустить ${esc(label)}">${ico('chevron-down')}</button>
      </div>
      <div class="tnst-note${note?.cls ? ' ' + note.cls : ''}" data-note${note ? '' : ' hidden'}>${esc(note?.text || '')}</div>
      ${open ? (isTn ? tnSettingsHtml(item) : adjustHtml(item.iid, item.raster)) : ''}
    </div>`;
  }

  /** Что можно добавить: те же карты, что в списках окна, кроме основы. */
  function listSources() {
    const doc = host.doc();
    const groups = [];
    const push = (title, items) => { if (items.length) groups.push({ title, items }); };
    const seen = new Set();
    const base = baseSources();
    const mk = (source, label) => {
      if (seen.has(source) || base.has(source)) return null;
      seen.add(source);
      return { source, label, added: !!findBySource(stack, source) };
    };
    const fromDom = (sel, premium) => (doc ? [...doc.querySelectorAll(sel)] : [])
      .map(el => el.dataset.layer).filter(Boolean)
      .filter(name => !premium || host.premiumAvailable())
      .map(name => mk(`map:${name}`, name)).filter(Boolean);
    const tn = host.tn();
    push('TrophyNav Maps', (tn?._state?.local || []).filter(m => !m.error)
      .map(m => mk(`tnmap:${m.id}`, tn.labelFor ? tn.labelFor(`tnmap:${m.id}`) : m.id)).filter(Boolean));
    push('Мои карты', host.customLayers().map(l => mk(`custom:${l.name}`, l.name)).filter(Boolean));
    push('Бесплатные карты', fromDom('#catalog-free-layers .base-layer[data-layer]', false));
    push('Premium карты', fromDom('#catalog-base-layers .base-layer[data-layer]', true));
    const cat = host.catalog();
    const overlayLabels = cat?.overlays?.length ? cat.overlays.map(e => e.label)
      : (doc ? [...doc.querySelectorAll('#catalog-overlay-layers input[data-overlay]')].map(i => i.dataset.overlay) : []);
    push('Оверлейные слои', overlayLabels.map(l => mk(`overlay:${l}`, l)).filter(Boolean));
    push('Скачанные карты', Object.entries(host.offlineMaps()).filter(([, e]) => e && !e.missing)
      .map(([path, e]) => mk(`offline:${path}`, String(e.name || path.split(/[\\/]/).pop()).replace(/\.(sqlitedb|mbtiles|rmap|db|sqlite)$/i, ''))).filter(Boolean));
    return groups;
  }

  function pickerHtml() {
    const groups = listSources();
    const opts = groups.map(gr => `<optgroup label="${esc(gr.title)}">${gr.items.map(it =>
      `<option value="${esc(it.source)}" data-label="${esc(it.label)}"${it.added ? ' disabled' : ''}>${esc(it.label)}${it.added ? ' — уже добавлен' : ''}</option>`).join('')}</optgroup>`).join('');
    return `<div class="tnst-picker">
      <select class="tnst-select" data-picker aria-label="Карта для слоя поверх">${opts || '<option disabled>Нет карт</option>'}</select>
      <button type="button" class="btn-primary tnst-btn" data-act="add">Добавить</button>
      <button type="button" class="btn-secondary tnst-btn" data-act="add-cancel">Отмена</button>
    </div>`;
  }
  function presetsHtml() {
    const opts = presets.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    return `<div class="tnst-presets">
      <span class="tnst-op-label">Наборы</span>
      <select class="tnst-select" data-preset aria-label="Сохранённые наборы"${presets.length ? '' : ' disabled'}>${opts || '<option>Нет сохранённых</option>'}</select>
      <button type="button" class="tn-icon-btn tn-icon-btn-s" data-act="preset-apply" ${presets.length ? '' : 'disabled'} title="Применить набор" aria-label="Применить набор">${ico('check')}</button>
      <button type="button" class="tn-icon-btn tn-icon-btn-s danger" data-act="preset-delete" ${presets.length ? '' : 'disabled'} title="Удалить набор" aria-label="Удалить набор">${ico('delete')}</button>
      <button type="button" class="tn-icon-btn tn-icon-btn-s" data-act="preset-save" title="Сохранить набор…" aria-label="Сохранить набор">${ico('save')}</button>
    </div>${previousStack ? '<button type="button" class="tnst-link" data-act="preset-undo">' + ico('undo', 'tn-ico-t') + 'Вернуть прежний набор</button>' : ''}`;
  }

  function panelHtml() {
    const total = stack.items.length;
    const rows = stack.items.map((item, i) => rowHtml(item, i, total)).reverse().join('');
    const baseOpen = ui.open.has('base');
    const full = total >= MAX_ITEMS;
    return `<div class="layer-section-title tnst-title"><span>Слои поверх</span><span class="tnst-count">${total} из ${MAX_ITEMS}</span></div>
      <div class="tnst-list" data-list>${rows || '<div class="tnst-empty">Сверху основной карты можно положить ещё до трёх: спутник под векторную карту, полупрозрачный топоплан, подписи.</div>'}</div>
      <div class="tnst-base">
        <div class="tnst-line"><span class="tnst-name">${ico('map', 'tn-ico-t tn-ico-m')}<span>Основа: ${esc(baseLabel())}</span></span>
          <button type="button" class="tn-icon-btn tn-icon-btn-s${baseOpen ? ' on' : ''}" data-act="settings" data-iid="base" aria-expanded="${baseOpen}" title="Яркость основной карты" aria-label="Настроить основную карту">${ico('sliders')}</button></div>
        ${baseOpen ? adjustHtml('base', stack.base.raster) : ''}
      </div>
      ${ui.picker ? pickerHtml() : `<button type="button" class="tnst-add" data-act="add-open" ${full ? 'disabled' : ''}>${ico('add-wp', 'tn-ico-t')}${full ? 'Не больше трёх слоёв' : 'Добавить слой'}</button>`}
      ${presetsHtml()}`;
  }

  function panelBox() { return host.doc()?.getElementById('tn-stack-section') || null; }
  function renderPanel() {
    const box = panelBox();
    if (!box) return;
    injectCss();
    const doc = host.doc();
    const act = doc.activeElement;
    const focusKey = act && box.contains(act) ? `${act.dataset.act || ''}|${act.dataset.iid || ''}|${act.dataset.adj || ''}` : null;
    const presetSel = box.querySelector('[data-preset]')?.value;
    const html = panelHtml();
    if (box.__tnstHtml === html) return;
    box.__tnstHtml = html;
    box.innerHTML = html;
    if (presetSel) { const s = box.querySelector('[data-preset]'); if (s && [...s.options].some(o => o.value === presetSel)) s.value = presetSel; }
    if (focusKey) {
      const [a, iid, adj] = focusKey.split('|');
      const find = (act, ad = '') => [...box.querySelectorAll('[data-act], [data-adj]')]
        .find(e => !e.disabled && (e.dataset.act || '') === act && (e.dataset.iid || '') === iid && (e.dataset.adj || '') === ad);
      // Слой дошёл до края — его стрелка стала недоступной: фокус на соседнюю, затем на «Настроить»
      const el = find(a, adj) || (a === 'up' || a === 'down' ? find(a === 'up' ? 'down' : 'up') || find('settings') : null);
      el?.focus({ preventScroll: true });
    }
  }
  /** Подсказки строк — без пересборки окна (тайлы грузятся, пока пользователь двигает ползунок). */
  function updateRowNotes() {
    const box = panelBox();
    if (!box) return;
    stack.items.forEach(item => {
      const row = box.querySelector(`.tnst-row[data-iid="${item.iid}"]`);
      const el = row?.querySelector('[data-note]');
      if (!el) return;
      const note = noteFor(item);
      el.hidden = !note;
      el.textContent = note?.text || '';
      el.className = 'tnst-note' + (note?.cls ? ' ' + note.cls : '');
    });
    box.__tnstHtml = null;
  }

  // ─── действия ───
  function addSource(source, label) {
    const resolved = resolveSource(source);
    const opacity = sourceKind(source) === 'overlay' ? normOpacity(resolved.defaultOpacity ?? 0.7) : 1;
    const res = addItem(stack, { source, label, opacity });
    if (res.full) { host.toast(`⚠ Не больше ${MAX_ITEMS} слоёв поверх — уберите один`, 'warning'); return false; }
    if (res.existed) { flash(res.item.iid); return true; }
    if (!res.item) return false;
    ui.picker = false;
    commit(res.stack);
    flash(res.item.iid);
    return true;
  }
  function flash(iid) {
    ui.flash = iid;
    renderPanel();
    setTimeout(() => { if (ui.flash === iid) { ui.flash = null; renderPanel(); } }, 1200);
  }

  async function onClick(e) {
    const btn = e.target.closest?.('[data-act]');
    if (!btn || btn.disabled || btn.tagName === 'INPUT') return;
    const act = btn.dataset.act, iid = btn.dataset.iid;
    if (act === 'drag') return;
    if (act === 'toggle') { const it = findItem(stack, iid); if (it) commit(updateItem(stack, iid, { enabled: !it.enabled })); return; }
    if (act === 'up' || act === 'down') { commit(moveItem(stack, iid, act === 'up' ? 1 : -1)); return; }
    if (act === 'settings') { if (ui.open.has(iid)) ui.open.delete(iid); else ui.open.add(iid); renderPanel(); return; }
    if (act === 'remove') { ui.open.delete(iid); commit(removeItem(stack, iid)); return; }
    if (act === 'reset') { commit(resetAdjust(stack, iid)); return; }
    if (act === 'tn-mode') { commit(updateItem(stack, iid, { tn: { mode: btn.dataset.mode } })); return; }
    if (act === 'add-open') { ui.picker = true; renderPanel(); panelBox()?.querySelector('[data-picker]')?.focus(); return; }
    if (act === 'add-cancel') { ui.picker = false; renderPanel(); panelBox()?.querySelector('[data-act="add-open"]')?.focus(); return; }
    if (act === 'add') {
      const sel = panelBox()?.querySelector('[data-picker]');
      const opt = sel?.selectedOptions?.[0];
      if (!opt || opt.disabled || !opt.value) return;
      addSource(opt.value, opt.dataset.label || opt.textContent);
      return;
    }
    if (act === 'preset-save') {
      const name = await host.prompt('Название набора (основа и слои поверх):', '', 'Сохранить набор');
      if (!name || !String(name).trim()) return;
      presets = savePreset(presets, name, stack, host.baseName());
      lsSet(LS_PRESETS, JSON.stringify(presets));
      host.toast(`✓ Набор «${String(name).trim()}» сохранён`);
      renderPanel();
      return;
    }
    const presetId = panelBox()?.querySelector('[data-preset]')?.value;
    const preset = presets.find(p => p.id === presetId);
    if (act === 'preset-apply' && preset) { applyPreset(preset); return; }
    if (act === 'preset-delete' && preset) {
      if (!(await host.confirm(`Удалить набор «${preset.name}»?`, 'Удалить'))) return;
      presets = deletePreset(presets, preset.id);
      lsSet(LS_PRESETS, JSON.stringify(presets));
      renderPanel();
      return;
    }
    if (act === 'preset-undo' && previousStack) {
      const prev = previousStack;
      previousStack = null;
      if (prev.baseLayer && prev.baseLayer !== host.baseName()) switchBase(prev.baseLayer);
      commit(prev.stack);
    }
  }
  function switchBase(name) {
    if (typeof root.setLayer !== 'function' || !name) return;
    if (/^custom:/.test(name)) {
      const l = host.customLayers().find(c => `custom:${c.name}` === name);
      if (l && typeof root.setCustomLayer === 'function') root.setCustomLayer(l.id);
      return;
    }
    root.setLayer(name);
  }
  function applyPreset(preset) {
    const prev = { stack: serializeStack(stack), baseLayer: host.baseName() };
    if (preset.baseLayer && preset.baseLayer !== host.baseName()) switchBase(preset.baseLayer);
    previousStack = prev;
    commit(presetStack(preset), { keepPrevious: true });
    host.toast(`Набор «${preset.name}» применён`);
  }

  function onInput(e) {
    const t = e.target;
    if (t.dataset.act === 'opacity') {
      const v = Number(t.value) / 100;
      stack = updateItem(stack, t.dataset.iid, { opacity: v });
      const rt = runtime.get(t.dataset.iid);
      const it = findItem(stack, t.dataset.iid);
      if (rt && it) applyLook(rt, it, host.map()?.getPane?.(paneName(it.iid)));
      const out = t.parentElement?.querySelector('[data-opacity-val]');
      if (out) out.textContent = pct(it?.opacity ?? v);
      panelBox() && (panelBox().__tnstHtml = null);
      persist();
      syncOverlayControls();
      return;
    }
    if (t.dataset.adj) {
      const target = t.dataset.target;
      stack = setAdjust(stack, target, { [t.dataset.adj]: Number(t.value) / 100 });
      const m = host.map();
      if (target === 'base') { if (m) applyBaseLook(m); } else {
        const rt = runtime.get(target), it = findItem(stack, target);
        if (rt && it) applyLook(rt, it, m?.getPane?.(paneName(target)));
      }
      const holder = target === 'base' ? stack.base : findItem(stack, target);
      const out = t.parentElement?.querySelector(`[data-adj-val="${t.dataset.adj}"]`);
      if (out && holder) out.textContent = signed(holder.raster[t.dataset.adj]);
      panelBox() && (panelBox().__tnstHtml = null);
      persist();
    }
  }
  function onChange(e) {
    const t = e.target;
    if (t.dataset.act === 'tn-poi') commit(updateItem(stack, t.dataset.iid, { tn: { poi: t.checked } }));
  }

  // ─── перетаскивание строк (pointer-события: HTML5 drag в WebView перехватывает приём файлов окна) ───
  let drag = null;
  function onPointerDown(e) {
    const handle = e.target.closest?.('[data-act="drag"]');
    if (!handle || (e.button != null && e.button !== 0)) return;
    const list = panelBox()?.querySelector('[data-list]');
    const row = handle.closest('.tnst-row');
    if (!list || !row) return;
    e.preventDefault();
    drag = { iid: row.dataset.iid, row, list, target: null, pointerId: e.pointerId };
    row.classList.add('dragging');
    try { handle.setPointerCapture?.(e.pointerId); } catch { /* jsdom */ }
  }
  function onPointerMove(e) {
    if (!drag) return;
    const rows = [...drag.list.querySelectorAll('.tnst-row')];
    rows.forEach(r => r.classList.remove('drop-before', 'drop-after'));
    // Строки показаны сверху вниз от верхнего слоя: позиция в списке → индекс в стеке
    let pos = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { pos = i; break; }
      pos = i + 1;
    }
    const fromPos = rows.indexOf(drag.row);
    let toPos = pos > fromPos ? pos - 1 : pos;
    toPos = clamp(toPos, 0, rows.length - 1);
    drag.target = rows.length - 1 - toPos;
    const mark = rows[clamp(pos, 0, rows.length - 1)];
    if (mark && mark !== drag.row) mark.classList.add(pos >= rows.length ? 'drop-after' : 'drop-before');
  }
  function onPointerUp() {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.row.classList.remove('dragging');
    d.list.querySelectorAll('.tnst-row').forEach(r => r.classList.remove('drop-before', 'drop-after'));
    const from = stack.items.findIndex(i => i.iid === d.iid);
    if (d.target != null && d.target !== from) commit(moveItemTo(stack, d.iid, d.target));
  }

  // ─── оверлеи каталога в старом списке «Оверлейные слои» — тот же стек ───
  function syncOverlayControls() {
    const doc = host.doc();
    if (!doc) return;
    doc.querySelectorAll('#catalog-overlay-layers .overlay-layer').forEach(row => {
      const cb = row.querySelector('input[type=checkbox][data-overlay]');
      if (!cb) return;
      const item = findBySource(stack, `overlay:${cb.dataset.overlay}`);
      cb.checked = !!item;
      const slider = row.querySelector('.opacity-slider');
      if (item && slider && Number(slider.value) !== Math.round(item.opacity * 100)) {
        slider.value = String(Math.round(item.opacity * 100));
        const out = slider.nextElementSibling;
        if (out) out.textContent = pct(item.opacity);
      }
    });
  }
  /** Галочка оверлея в списке. Возвращает итоговое состояние галочки. */
  function setOverlay(label, on, opacity) {
    const source = `overlay:${label}`;
    const existing = findBySource(stack, source);
    if (!on) { if (existing) commit(removeItem(stack, existing.iid)); return false; }
    if (existing) return true;
    const resolved = resolveSource(source);
    const res = addItem(stack, { source, label, opacity: opacity ?? normOpacity(resolved.defaultOpacity ?? 0.7) });
    if (res.full) { host.toast(`⚠ Не больше ${MAX_ITEMS} слоёв поверх — уберите один в «Слои поверх»`, 'warning'); return false; }
    commit(res.stack);
    return true;
  }
  function setOverlayOpacity(label, opacity) {
    const item = findBySource(stack, `overlay:${label}`);
    if (!item) return;
    stack = updateItem(stack, item.iid, { opacity });
    const rt = runtime.get(item.iid), it = findItem(stack, item.iid);
    if (rt && it) applyLook(rt, it, host.map()?.getPane?.(paneName(it.iid)));
    persist();
    if (panelBox()) { panelBox().__tnstHtml = null; renderPanel(); }
  }

  // ─── CSS (только токены theme.css) ───
  function injectCss() {
    const doc = host.doc();
    if (!doc || doc.getElementById('tnst-style')) return;
    const st = doc.createElement('style');
    st.id = 'tnst-style';
    st.textContent = `
      .tnst-title { display:flex; justify-content:space-between; align-items:center; }
      .tnst-count { font-weight:400; letter-spacing:0; text-transform:none; }
      .tnst-list { display:flex; flex-direction:column; gap:4px; }
      .tnst-empty { font-size:var(--fs-s); color:var(--text-muted); padding:2px 2px 6px; }
      .tnst-row, .tnst-base { background:var(--surface-variant); border-radius:var(--radius-m); padding:4px 6px 6px; }
      .tnst-row.disabled .tnst-name, .tnst-row.disabled .tnst-op { opacity:0.55; }
      .tnst-row.flash { box-shadow:0 0 0 2px var(--primary-ring); }
      .tnst-row.dragging { opacity:0.6; }
      .tnst-row.drop-before { box-shadow:0 -2px 0 0 var(--primary); }
      .tnst-row.drop-after { box-shadow:0 2px 0 0 var(--primary); }
      .tnst-base { margin-top:6px; }
      .tnst-line { display:flex; align-items:center; gap:2px; min-height:30px; }
      .tnst-name { flex:1; min-width:0; display:flex; align-items:center; gap:2px; font-size:var(--fs-m); color:var(--text-primary); }
      .tnst-name > span:not(.tnst-badge) { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .tnst-badge { flex:none; margin-left:6px; font-size:var(--fs-xs); color:var(--text-secondary); border:1px solid var(--border-normal); border-radius:var(--radius-pill); padding:0 6px; }
      .tnst-drag { cursor:grab; touch-action:none; }
      .tnst-row .tn-icon-btn.on, .tnst-base .tn-icon-btn.on { color:var(--primary); }
      .tnst-op { gap:8px; padding:0 4px 0 6px; }
      .tnst-op-label { font-size:var(--fs-xs); color:var(--text-muted); flex:none; }
      .tnst-op input[type=range] { flex:1; min-width:0; margin:0; }
      .tnst-pct { flex:0 0 38px; text-align:right; font-size:var(--fs-xs); font-variant-numeric:tabular-nums; color:var(--text-secondary); }
      .tnst-note { font-size:var(--fs-xs); color:var(--text-muted); padding:2px 6px 0; }
      .tnst-note.warn { color:var(--text-warning); }
      .tnst-adjust { margin-top:4px; padding:6px; border-top:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:2px; }
      .tnst-adj-row { display:flex; align-items:center; gap:8px; min-height:28px; font-size:var(--fs-s); color:var(--text-primary); }
      .tnst-adj-label { flex:0 0 92px; color:var(--text-secondary); }
      .tnst-adj-row input[type=range] { flex:1; min-width:0; margin:0; }
      .tnst-adj-actions { display:flex; justify-content:flex-end; }
      .tnst-link { appearance:none; background:none; border:0; padding:4px 2px; font:inherit; font-size:var(--fs-s); color:var(--primary-text); cursor:pointer; display:inline-flex; align-items:center; }
      .tnst-link:hover { text-decoration:underline; }
      .tnst-seg { display:grid; grid-template-columns:1fr 1fr; height:28px; border:1px solid var(--text-secondary); border-radius:var(--radius-pill); overflow:hidden; }
      .tnst-seg-btn { min-width:0; border:0; border-left:1px solid var(--text-secondary); background:transparent; color:var(--text-primary); font:inherit; font-size:var(--fs-s); cursor:pointer; }
      .tnst-seg-btn:first-child { border-left:0; }
      .tnst-seg-btn:hover { background:var(--hover); }
      .tnst-seg-btn.active { background:var(--primary); color:var(--on-primary); }
      .tnst-check { display:flex; align-items:center; gap:6px; min-height:28px; font-size:var(--fs-s); color:var(--text-primary); cursor:pointer; }
      .tnst-check.off { color:var(--text-muted); cursor:default; }
      .tnst-hint { font-size:var(--fs-xs); color:var(--text-muted); }
      .tnst-add { width:100%; margin-top:6px; min-height:32px; display:flex; align-items:center; justify-content:center; border:1px dashed var(--border-normal); border-radius:var(--radius-m); background:transparent; color:var(--primary-text); font:inherit; font-size:var(--fs-m); cursor:pointer; }
      .tnst-add:hover:not(:disabled) { background:var(--hover); }
      .tnst-add:disabled { color:var(--text-muted); cursor:default; }
      .tnst-picker { display:flex; gap:6px; align-items:center; margin-top:6px; }
      .tnst-select { flex:1; min-width:0; height:30px; padding:0 6px; border-radius:var(--radius-s); border:1px solid var(--input-border); background:var(--input-bg); color:var(--text-primary); font:inherit; font-size:var(--fs-s); }
      .tnst-btn { font-size:var(--fs-s); padding:0 10px; height:30px; flex:none; }
      .tnst-presets { display:flex; align-items:center; gap:4px; margin-top:6px; }
      .tnst-presets .tnst-op-label { margin-right:4px; }
    `;
    doc.head.appendChild(st);
  }

  // ─── запуск, сессия ───
  let inited = false;
  function init() {
    if (inited) return;
    inited = true;
    try { stack = normalizeStack(JSON.parse(lsGet(LS_STACK) || 'null')); } catch { stack = emptyStack(); }
    try { presets = normalizePresets(JSON.parse(lsGet(LS_PRESETS) || '[]')); } catch { presets = []; }
    const box = panelBox();
    if (box && !box.__tnstBound) {
      box.__tnstBound = true;
      box.addEventListener('click', e => { onClick(e).catch(err => console.warn('Слои поверх:', err)); });
      box.addEventListener('input', onInput);
      box.addEventListener('change', onChange);
      box.addEventListener('pointerdown', onPointerDown);
      box.addEventListener('pointermove', onPointerMove);
      box.addEventListener('pointerup', onPointerUp);
      box.addEventListener('pointercancel', onPointerUp);
    }
    apply();
    syncOverlayControls();
  }
  /** Стек из сессии (session.json / tnd-state). Старые сессии без map.stack текущий набор не трогают. */
  function restore(raw) {
    init();
    if (!isObj(raw)) return;
    stack = normalizeStack(raw);
    previousStack = null;
    lsSet(LS_STACK, JSON.stringify(serializeStack(stack)));
    apply();
    syncOverlayControls();
  }
  /** Основа, проекция, каталог или список офлайн-карт поменялись — пересчитать, что показывать. */
  function refresh() {
    if (!inited) return;
    apply();
    syncOverlayControls();
  }

  const api = {
    Model,
    init, restore, refresh,
    serialize: () => serializeStack(stack),
    getStack: () => serializeStack(stack),
    setStack: s => commit(s),
    toR9: () => toR9(stack, baseSourceFor(host.baseName())),
    getPresets: () => normalizePresets(presets),
    applyPreset: id => { const p = presets.find(x => x.id === id); if (p) applyPreset(p); },
    addSource, setOverlay, setOverlayOpacity, syncOverlayControls, listSources, resolveSource,
    _runtime: runtime,
    _setHost: overrides => { host = { ...defaultHost, ...(overrides || {}) }; inited = false; stack = emptyStack(); presets = []; previousStack = null; runtime.clear(); ui.open.clear(); ui.picker = false; },
  };
  root.TnLayers = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
