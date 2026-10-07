/*
 * TrophyNav Maps на десктопе (путь A): векторная карта области как базовый слой Leaflet через
 * maplibre-gl-leaflet. Маркеры, треки, маршруты и редакторы остаются слоями Leaflet поверх.
 *
 * - слой «tnmap:<id>» отдаёт makeBaseLayer() в index.html — выбор карты, сохранение и восстановление
 *   сессии работают как у растровых карт;
 * - тайлы, рельеф и стиль идут по протоколу tnmap:// (Rust, src-tauri/src/vector_maps.rs);
 * - MapLibre (800 КБ) грузится только при первом показе векторной карты;
 * - нет WebGL — понятное сообщение и остаётся (или возвращается) растровая карта.
 *
 * Логика стиля — trophynav-maps-core.js, значки «Топо» — trophynav-symbols.js.
 */
(function () {
  'use strict';

  const Core = window.TrophyNavMapsCore;
  const LAYER_PREFIX = 'tnmap:';
  const FALLBACK_LAYER = 'OpenStreetMap';
  const LS_THEME = 'tnd-tnmaps-theme';
  const LS_RELIEF = 'tnd-tnmaps-relief';
  const LS_POI = 'tnd-tnmaps-poi';
  const ATTRIBUTION = '© OpenMapTiles © OpenStreetMap contributors';

  const state = {
    local: [],          // tnmaps_local().maps
    partial: {},        // id → байт в .part
    dir: '',
    catalog: null,      // {maps:[…]}
    catalogFromCache: false,
    catalogSavedAt: null,
    catalogError: '',
    downloads: {},      // id → {phase, done, total}
    filter: '',
    activeLayer: null,  // TnVectorLayer на карте
  };

  // ─── мелочи ───
  const invoke = (cmd, args) => {
    const fn = window.__TAURI_INTERNALS__?.invoke;
    if (typeof fn !== 'function') return Promise.reject(new Error('Tauri IPC недоступен'));
    return fn(cmd, args || {});
  };
  const toast = (msg, type) => { if (typeof window.showToast === 'function') window.showToast(msg, type); else console.log(msg); };
  const lsGet = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const lsSet = (key, value) => { try { localStorage.setItem(key, value); } catch { /* приватный режим */ } };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function formatSize(bytes) {
    const b = Number(bytes) || 0;
    if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(1).replace('.', ',') + ' ГБ';
    if (b >= 1024 ** 2) return Math.round(b / 1024 ** 2) + ' МБ';
    return Math.max(1, Math.round(b / 1024)) + ' КБ';
  }
  // map, currentBaseLayerName — глобальные const/let основного скрипта index.html (не свойства window)
  /* global map, currentBaseLayerName */
  const leafletMap = () => (typeof map !== 'undefined' ? map : null);
  const currentLayerName = () => (typeof currentBaseLayerName !== 'undefined' ? currentBaseLayerName : '');
  const isLayerName = name => typeof name === 'string' && name.startsWith(LAYER_PREFIX);
  const idOf = name => String(name).slice(LAYER_PREFIX.length);

  function nativeBase() {
    const conv = window.__TAURI_INTERNALS__?.convertFileSrc;
    // Linux/macOS: tnmap://localhost/…, Windows: http://tnmap.localhost/…
    return typeof conv === 'function' ? conv('', 'tnmap').replace(/\/$/, '') : 'tnmap://localhost';
  }
  /** В стиле адреса всегда tnmap://localhost/… — их ловит addProtocol и запрашивает в основном потоке. */
  const STYLE_BASE = 'tnmap://localhost';

  function catalogEntry(id) {
    return (state.catalog?.maps || []).find(m => m.id === id) || null;
  }
  function localEntry(id) {
    return state.local.find(m => m.id === id) || null;
  }
  function regionName(id) {
    const c = catalogEntry(id);
    if (c?.name) return c.name;
    const l = localEntry(id);
    // Имя в metadata бывает дефолтом сборщика («OpenMapTiles…») — тогда id
    if (l?.name && !/openmaptiles/i.test(l.name)) return l.name;
    return id;
  }
  function labelFor(name) {
    return isLayerName(name) ? `TrophyNav Maps · ${regionName(idOf(name))}` : name;
  }

  // ─── настройки (как на Android: тема у каждой карты своя) ───
  const themeFor = id => Core.normalizeTheme(lsGet(`${LS_THEME}:${id}`) || lsGet(LS_THEME) || Core.DEFAULT_THEME);
  function readRelief() {
    try { return Core.normalizeRelief(JSON.parse(lsGet(LS_RELIEF) || '{}')); } catch { return Core.normalizeRelief({}); }
  }
  const readPoi = () => lsGet(LS_POI) || 'all';

  // ─── WebGL и библиотеки ───
  let webglChecked = null;
  function hasWebGL() {
    if (webglChecked !== null) return webglChecked;
    try {
      const c = document.createElement('canvas');
      webglChecked = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { webglChecked = false; }
    return webglChecked;
  }

  let libsPromise = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = resolve;
      s.onerror = () => reject(new Error('не загрузился ' + src));
      document.head.appendChild(s);
    });
  }
  function ensureLibs() {
    if (libsPromise) return libsPromise;
    libsPromise = (async () => {
      if (!document.querySelector('link[data-tnmaps-css]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = 'lib/maplibre/maplibre-gl.css'; link.dataset.tnmapsCss = '1';
        document.head.appendChild(link);
      }
      if (!window.maplibregl) await loadScript('lib/maplibre/maplibre-gl.js');
      if (!L.maplibreGL) await loadScript('lib/maplibre/leaflet-maplibre-gl.js');
      registerProtocol();
    })();
    libsPromise.catch(() => { libsPromise = null; });
    return libsPromise;
  }

  /** tnmap:// → fetch к протоколу Rust из основного потока (не из воркера — так одинаково на всех WebView). */
  function registerProtocol() {
    const base = nativeBase();
    window.maplibregl.addProtocol('tnmap', async (params, abortController) => {
      const url = base + params.url.slice(STYLE_BASE.length);
      const resp = await fetch(url, { signal: abortController.signal });
      // 204: у рельефа здесь нет тайла (ровная местность, край области) — не рисовать
      if (resp.status === 204) throw new TnNoTile();
      if (!resp.ok) throw new Error(`tnmap ${resp.status}: ${params.url}`);
      if (params.type === 'json') return { data: await resp.json() };
      if (params.type === 'string') return { data: await resp.text() };
      return { data: await resp.arrayBuffer() };
    });
  }
  class TnNoTile extends Error { constructor() { super('no tile'); this.name = 'TnNoTile'; } }

  const assetCache = {};
  async function fetchAsset(name) {
    if (assetCache[name] !== undefined) return assetCache[name];
    const resp = await fetch(`${nativeBase()}/assets/${name}`);
    if (resp.status === 404) { assetCache[name] = null; return null; }
    if (!resp.ok) throw new Error(`${name}: HTTP ${resp.status}`);
    assetCache[name] = await resp.text();
    return assetCache[name];
  }

  async function refreshLocal() {
    const res = await invoke('tnmaps_local');
    state.local = res.maps || [];
    state.partial = res.partial || {};
    state.dir = res.dir || '';
    return state.local;
  }

  async function buildStyleFor(id) {
    let map = localEntry(id);
    if (!map) { await refreshLocal(); map = localEntry(id); }
    if (!map) throw new Error('карта области не скачана');
    if (map.error) throw new Error(map.error);
    const template = await fetchAsset('style-liberty.json');
    if (!template) throw new Error('нет файла стиля');
    const themeId = themeFor(id);
    // «Обычная» — базовый стиль без файла темы
    const themeText = themeId === 'normal' ? null : await fetchAsset(`theme-${themeId}.json`);
    const theme = themeText ? JSON.parse(themeText) : null;
    return Core.buildStyle({ template, map, base: STYLE_BASE, theme, relief: readRelief(), poi: readPoi() });
  }

  // ─── слой Leaflet ───
  const TnVectorLayer = L.Layer.extend({
    initialize(id) {
      this.mapId = id;
      this._gl = null;
      this._token = 0;
    },
    onAdd(map) {
      this._map = map;
      state.activeLayer = this;
      document.dispatchEvent(new CustomEvent('tnmaps:active', { detail: { id: this.mapId } }));
      this._build(++this._token);
    },
    onRemove(map) {
      this._token++;
      if (this._gl) {
        // Слой, у которого не поднялся WebGL, снимается с ошибкой — карта при этом должна смениться
        try { map.removeLayer(this._gl); } catch (e) { console.warn('TrophyNav Maps: снятие слоя', e); }
        this._gl = null;
      }
      if (state.activeLayer === this) {
        state.activeLayer = null;
        document.dispatchEvent(new CustomEvent('tnmaps:active', { detail: { id: null } }));
      }
      renderLayerSection();
    },
    getAttribution() { return ATTRIBUTION; },
    glMap() { return this._gl?.getMaplibreMap?.() || null; },

    async _build(token) {
      try {
        await ensureLibs();
        const style = await buildStyleFor(this.mapId);
        if (token !== this._token || !this._map) return;
        const gl = L.maplibreGL({ style, interactive: false, pane: 'tilePane', attributionControl: false });
        this._gl = gl;
        gl.addTo(this._map);
        const mlMap = gl.getMaplibreMap();
        if (!mlMap) throw new Error('WebGL недоступен');
        mlMap.on('styleimagemissing', e => addTopoImage(mlMap, e.id));
        mlMap.on('error', e => {
          if (e?.error instanceof TnNoTile || e?.error?.name === 'TnNoTile') return;
          console.warn('TrophyNav Maps:', e?.error?.message || e);
        });
        mlMap.getCanvas().addEventListener('webglcontextlost', ev => {
          // MapLibre сам «теряет» контекст при remove() — когда карту сменили или убрали. Это не сбой:
          // реагировать только пока этот слой на экране
          if (token !== this._token || state.activeLayer !== this) return;
          ev.preventDefault();
          fallbackToRaster('Видеокарта сбросила векторную карту (WebGL). Показана растровая карта.');
        }, { once: true });
        renderLayerSection();
      } catch (e) {
        if (token !== this._token) return;
        console.warn('TrophyNav Maps: не открылась', e);
        fallbackToRaster(`⚠ TrophyNav Maps не открылась: ${e?.message || e}. Показана растровая карта.`);
      }
    },

    /** Пересобрать стиль после смены темы, рельефа или значков — без пересоздания WebGL. */
    async reloadStyle() {
      const mlMap = this.glMap();
      if (!mlMap) return;
      const token = this._token;
      try {
        const style = await buildStyleFor(this.mapId);
        if (token !== this._token) return;
        mlMap.setStyle(style, { diff: false });
      } catch (e) {
        toast(`⚠ Не удалось применить настройки карты: ${e?.message || e}`);
      }
    },
  });

  let topoImageCache = null;
  function addTopoImage(mlMap, id) {
    if (!id || !id.startsWith('topo-') || !window.TrophyNavSymbols) return;
    const pr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    if (!topoImageCache) topoImageCache = window.TrophyNavSymbols.topoImages(pr);
    const img = topoImageCache[id];
    if (img && !mlMap.hasImage(id)) mlMap.addImage(id, img, { pixelRatio: pr });
  }

  function fallbackToRaster(message) {
    // Только если на экране всё ещё векторная карта: пользователь мог уже выбрать другую
    if (typeof window.setLayer === 'function' && isLayerName(currentLayerName())) window.setLayer(FALLBACK_LAYER);
    // После setLayer: его тост «Карта: …» не должен затереть объяснение
    toast(message, 'warning');
  }

  /** Вызывается из makeBaseLayer(). null — карту показать нельзя (останется текущая). */
  function makeLayer(name) {
    const id = idOf(name);
    if (!hasWebGL()) {
      toast('⚠ Векторные TrophyNav Maps недоступны: в этой системе нет WebGL (видеодрайвер). Остаётся растровая карта.', 'warning');
      return null;
    }
    return new TnVectorLayer(id);
  }

  /** Выбор карты в списке: перелететь в область, если смотрим в другое место. */
  async function showRegion(id, el) {
    if (typeof window.setLayer !== 'function') return;
    if (!localEntry(id)) await refreshLocal().catch(() => {});
    window.setLayer(LAYER_PREFIX + id, el);
    const b = catalogEntry(id)?.bounds || localEntry(id)?.bounds;
    const lmap = leafletMap();
    if (Array.isArray(b) && b.length === 4 && lmap?.getCenter) {
      const c = lmap.getCenter();
      const inside = c.lng >= b[0] && c.lng <= b[2] && c.lat >= b[1] && c.lat <= b[3];
      if (!inside) lmap.setView([(b[1] + b[3]) / 2, (b[0] + b[2]) / 2], Math.max(8, Math.min(lmap.getZoom(), 12)));
    }
  }

  function activeId() {
    return state.activeLayer && leafletMap()?.hasLayer?.(state.activeLayer) ? state.activeLayer.mapId : null;
  }

  // ─── настройки активной карты ───
  function setTheme(themeId) {
    const id = activeId();
    if (!id) return;
    lsSet(`${LS_THEME}:${id}`, Core.normalizeTheme(themeId));
    lsSet(LS_THEME, Core.normalizeTheme(themeId));
    state.activeLayer.reloadStyle();
    renderLayerSection();
  }
  function setRelief(patch) {
    lsSet(LS_RELIEF, JSON.stringify(Object.assign(readRelief(), patch)));
    state.activeLayer?.reloadStyle();
    renderLayerSection();
  }
  function setPoi(selected) {
    lsSet(LS_POI, Core.formatPoi(selected));
    state.activeLayer?.reloadStyle();
    renderLayerSection();
  }

  // ─── стили (только переменные темы приложения) ───
  function injectCss() {
    if (document.getElementById('tnmaps-style')) return;
    const st = document.createElement('style');
    st.id = 'tnmaps-style';
    st.textContent = `
      .tnmaps-title-row { display:flex; justify-content:space-between; align-items:center; }
      .tnmaps-link { font-size:12px; cursor:pointer; color:var(--accent-blue); background:none; border:none; padding:0; text-transform:none; letter-spacing:0; }
      .tnmaps-empty { font-size:11px; color:var(--text-muted); padding:4px 2px 6px; }
      .tnmaps-size { margin-left:auto; font-size:10px; color:var(--text-muted); }
      .tnmaps-controls { background:var(--bg-sunken); border:1px solid var(--border-normal); border-radius:6px; padding:8px; margin:4px 0 6px; display:flex; flex-direction:column; gap:6px; }
      .tnmaps-row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:11px; color:var(--text-secondary); }
      .tnmaps-row > .tnmaps-label { min-width:64px; color:var(--text-muted); }
      .tnmaps-chip { font-size:11px; padding:3px 9px; border-radius:12px; border:1px solid var(--border-normal); background:var(--bg-interactive); color:var(--text-primary); cursor:pointer; }
      .tnmaps-chip.active { background:var(--bg-selected); border-color:var(--border-bright); }
      .tnmaps-chip:disabled { opacity:.45; cursor:default; }
      .tnmaps-row input[type=range] { flex:1; min-width:90px; }
      .tnmaps-row label { display:flex; align-items:center; gap:4px; cursor:pointer; color:var(--text-primary); }
      .tnmaps-hint { font-size:10px; color:var(--text-muted); }
      #modal-tnmaps-win { top:70px; left:calc(50% - 250px); width:500px; max-height:calc(100vh - 110px); display:flex; flex-direction:column; }
      #modal-tnmaps .modal-body { display:flex; flex-direction:column; gap:8px; }
      .tnmaps-status { font-size:11px; color:var(--text-muted); }
      .tnmaps-status.warn { color:var(--text-warning); }
      .tnmaps-search { width:100%; padding:6px 8px; border-radius:5px; border:1px solid var(--input-border); background:var(--input-bg); color:var(--text-primary); font-size:12px; }
      .tnmaps-list { display:flex; flex-direction:column; gap:4px; overflow-y:auto; max-height:calc(100vh - 290px); }
      .tnmaps-group { font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:var(--text-muted); padding:6px 0 2px; }
      .tnmaps-item { display:flex; align-items:center; gap:8px; padding:7px 8px; border:1px solid var(--row-border); border-radius:6px; background:var(--bg-elevated); }
      .tnmaps-item.downloaded { border-color:var(--border-normal); background:var(--bg-surface); }
      .tnmaps-item-main { flex:1; min-width:0; }
      .tnmaps-item-name { font-size:12px; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .tnmaps-item-sub { font-size:10px; color:var(--text-muted); margin-top:2px; }
      .tnmaps-item-sub .ok { color:var(--accent-green); }
      .tnmaps-item-sub .upd { color:var(--accent-amber); }
      .tnmaps-item-sub .err { color:var(--accent-red); }
      .tnmaps-item-actions { display:flex; gap:4px; flex-shrink:0; }
      .tnmaps-btn { min-height:28px; font-size:11px; padding:4px 9px; border-radius:5px; cursor:pointer; border:1px solid var(--border-normal); background:var(--bg-interactive); color:var(--text-primary); white-space:nowrap; }
      .tnmaps-btn:hover { border-color:var(--border-bright); }
      .tnmaps-btn.primary { background:var(--accent-blue); border-color:var(--border-bright); color:var(--text-on-solid); }
      .tnmaps-btn.danger { color:var(--accent-red); border-color:var(--border-danger); background:var(--bg-interactive); }
      .tnmaps-progress { height:4px; border-radius:2px; background:var(--bg-sunken); margin-top:4px; overflow:hidden; }
      .tnmaps-progress > div { height:100%; background:var(--accent-blue); width:0; transition:width .2s; }
      .tnmaps-foot { font-size:10px; color:var(--text-muted); display:flex; justify-content:space-between; gap:8px; align-items:center; }
      .tnmaps-poi { display:flex; flex-direction:column; gap:3px; padding:4px 0; }
      .tnmaps-poi[hidden] { display:none; }
    `;
    document.head.appendChild(st);
  }

  // ─── раздел в окне «Карта и слои» ───
  function renderLayerSection() {
    const box = document.getElementById('tnmaps-layers');
    if (!box) return;
    const current = currentLayerName();
    const act = activeId();
    const items = state.local.filter(m => !m.error).map(m => {
      const name = LAYER_PREFIX + m.id;
      const extras = (m.dem ? 1 : 0) + (m.slope ? 1 : 0);
      return `<div class="base-layer${name === current ? ' active' : ''}" data-layer="${esc(name)}" data-tnmaps-show="${esc(m.id)}">
        🧭 ${esc(regionName(m.id))}<span class="tnmaps-size">${formatSize(m.size + (m.dem?.size || 0) + (m.slope?.size || 0))}${extras ? ' · рельеф' : ''}</span></div>`;
    }).join('');
    let controls = '';
    if (act) {
      const theme = themeFor(act);
      const r = readRelief();
      const m = localEntry(act) || {};
      const hasDem = !!m.dem, hasSlope = !!m.slope;
      const poi = Core.parsePoi(readPoi());
      controls = `<div class="tnmaps-controls">
        <div class="tnmaps-row"><span class="tnmaps-label">3D</span>
          <button type="button" class="tnmaps-chip" data-tnmaps-3d>⛰ Открыть 3D-вид</button>
        </div>
        <div class="tnmaps-row"><span class="tnmaps-label">Тема</span>
          ${Core.THEMES.map(t => `<button type="button" class="tnmaps-chip${t.id === theme ? ' active' : ''}" data-tnmaps-theme="${t.id}">${t.title}</button>`).join('')}
        </div>
        <div class="tnmaps-row"><span class="tnmaps-label">Рельеф</span>
          <label><input type="checkbox" data-tnmaps-relief="on" ${r.on ? 'checked' : ''}> показывать</label>
          <label><input type="checkbox" data-tnmaps-relief="contours" ${r.contours ? 'checked' : ''} ${r.on ? '' : 'disabled'}> горизонтали</label>
          <label title="${hasSlope ? '' : 'У этой области нет файла крутизны'}"><input type="checkbox" data-tnmaps-relief="slope" ${r.slope ? 'checked' : ''} ${r.on && hasSlope ? '' : 'disabled'}> крутизна</label>
        </div>
        <div class="tnmaps-row"><span class="tnmaps-label">Отмывка</span>
          <input type="range" min="0" max="15" step="1" value="${r.strength}" data-tnmaps-strength ${r.on && (hasDem || hasSlope) ? '' : 'disabled'}>
          <span>${r.strength * 10}%</span>
        </div>
        ${theme !== 'topo' ? '<div class="tnmaps-hint">Отмывка, крутизна и горизонтали рисуются в теме «Топо».</div>'
          : hasDem || hasSlope ? '' : '<div class="tnmaps-hint">У этой области нет файлов рельефа — горизонтали только из самой карты.</div>'}
        <div class="tnmaps-row"><span class="tnmaps-label">Значки</span>
          <button type="button" class="tnmaps-chip" data-tnmaps-poi-toggle>Значки на карте: ${Core.poiSummary(poi)} ▾</button>
        </div>
        <div class="tnmaps-poi" data-tnmaps-poi-list hidden>
          ${Core.POI_GROUPS.map(g => `<label class="tnmaps-row"><input type="checkbox" data-tnmaps-poi="${g.id}" ${poi.has(g.id) ? 'checked' : ''}> ${esc(g.title)}</label>`).join('')}
          <div class="tnmaps-row"><button type="button" class="tnmaps-chip" data-tnmaps-poi-all>Все / ни одного</button></div>
        </div>
      </div>`;
    }
    const hint = state.local.length ? '' : '<div class="tnmaps-empty">Нет скачанных областей. Векторные карты работают без интернета.</div>';
    const poiOpen = box.querySelector('[data-tnmaps-poi-list]')?.hidden === false;
    box.innerHTML = items + controls + hint;
    if (poiOpen) { const l = box.querySelector('[data-tnmaps-poi-list]'); if (l) l.hidden = false; }
  }

  function onLayerSectionEvent(e) {
    const t = e.target;
    const show = t.closest?.('[data-tnmaps-show]');
    if (show && e.type === 'click') { showRegion(show.dataset.tnmapsShow, show); return; }
    if (t.closest?.('[data-tnmaps-3d]') && e.type === 'click') {
      if (typeof window.closeModal === 'function') window.closeModal('modal-layers');
      window.TrophyNav3D?.open();
      return;
    }
    const th = t.closest?.('[data-tnmaps-theme]');
    if (th && e.type === 'click') { setTheme(th.dataset.tnmapsTheme); return; }
    if (t.matches?.('[data-tnmaps-relief]') && e.type === 'change') { setRelief({ [t.dataset.tnmapsRelief]: t.checked }); return; }
    if (t.matches?.('[data-tnmaps-strength]')) {
      if (e.type === 'input') t.nextElementSibling.textContent = `${t.value * 10}%`;
      if (e.type === 'change') setRelief({ strength: Number(t.value) });
      return;
    }
    if (t.closest?.('[data-tnmaps-poi-toggle]') && e.type === 'click') {
      const list = document.querySelector('#tnmaps-layers [data-tnmaps-poi-list]');
      if (list) list.hidden = !list.hidden;
      return;
    }
    if (t.matches?.('[data-tnmaps-poi]') && e.type === 'change') {
      const sel = [...document.querySelectorAll('#tnmaps-layers [data-tnmaps-poi]')].filter(cb => cb.checked).map(cb => cb.dataset.tnmapsPoi);
      setPoi(sel);
      return;
    }
    if (t.closest?.('[data-tnmaps-poi-all]') && e.type === 'click') {
      const cur = Core.parsePoi(readPoi());
      setPoi(cur.size < Core.POI_ALL.length ? Core.POI_ALL : []);
    }
  }

  // ─── окно «TrophyNav Maps по областям» ───
  function ensureWindow() {
    let overlay = document.getElementById('modal-tnmaps');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-tnmaps';
    overlay.innerHTML = `
      <div class="modal" id="modal-tnmaps-win" role="dialog" aria-label="TrophyNav Maps по областям">
        <div class="modal-header" data-tnmaps-drag>
          🧭 TrophyNav Maps по областям
          <span style="display:flex;align-items:center;gap:6px">
            <button type="button" class="tnmaps-link" data-tnmaps-act="reload" title="Обновить список с сервера">🔄</button>
            <button type="button" class="modal-close" data-tnmaps-act="close" aria-label="Закрыть">✕</button>
          </span>
        </div>
        <div class="modal-body">
          <div class="tnmaps-status" data-tnmaps-status>Загрузка списка…</div>
          <input class="tnmaps-search" type="search" placeholder="Поиск области" data-tnmaps-search>
          <div class="tnmaps-list" data-tnmaps-list></div>
          <div class="tnmaps-foot"><span data-tnmaps-dir></span>
            <button type="button" class="tnmaps-link" data-tnmaps-act="folder">Открыть папку</button></div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-tnmaps-drag]').addEventListener('mousedown', e => {
      if (e.target.closest('button')) return;
      if (typeof window.startDrag === 'function') window.startDrag(e, 'modal-tnmaps-win');
    });
    overlay.addEventListener('click', onWindowClick);
    overlay.querySelector('[data-tnmaps-search]').addEventListener('input', e => { state.filter = e.target.value; renderWindow(); });
    return overlay;
  }

  function updateAvailable(local, remote) {
    if (!local || !remote) return false;
    return local.size !== remote.size || (!!local.sha256 && local.sha256 !== String(remote.sha256 || '').toLowerCase())
      || (remote.terrain || []).some(t => {
        const l = local[t.kind];
        return !l || l.size !== t.size || (!!l.sha256 && l.sha256 !== String(t.sha256 || '').toLowerCase());
      });
  }

  const progressPct = dl => (dl.total ? Math.min(100, Math.floor(dl.done / dl.total * 100)) : 0);
  const progressText = (dl, total) => (dl.phase === 'start' ? 'Подключение к серверу карт…'
    : dl.phase === 'verify' ? 'Проверка контрольной суммы…'
    : `Скачивание ${progressPct(dl)}% · ${formatSize(dl.done)} из ${formatSize(dl.total || total)}`);

  function itemHtml(id) {
    const remote = catalogEntry(id);
    const local = localEntry(id);
    const dl = state.downloads[id];
    const total = remote ? remote.size + (remote.terrain || []).reduce((s, t) => s + (t.size || 0), 0) : (local?.size || 0);
    const parts = [];
    let actions = '';
    if (dl && (dl.phase === 'download' || dl.phase === 'verify' || dl.phase === 'start')) {
      const pct = progressPct(dl);
      parts.push(progressText(dl, total));
      actions = `<button type="button" class="tnmaps-btn" data-tnmaps-act="cancel" data-id="${esc(id)}">Остановить</button>`;
      return `<div class="tnmaps-item${local ? ' downloaded' : ''}" data-tnmaps-item="${esc(id)}">
        <div class="tnmaps-item-main"><div class="tnmaps-item-name">${esc(regionName(id))}</div>
        <div class="tnmaps-item-sub" data-tnmaps-progress-text>${parts.join(' · ')}</div>
        <div class="tnmaps-progress"><div data-tnmaps-progress-bar style="width:${pct}%"></div></div></div>
        <div class="tnmaps-item-actions">${actions}</div></div>`;
    }
    if (local) {
      if (local.error) parts.push(`<span class="err">${esc(local.error)}</span>`);
      else parts.push(`<span class="ok">✓ скачана</span> · ${formatSize(local.size + (local.dem?.size || 0) + (local.slope?.size || 0))}`);
      if (local.dem || local.slope) parts.push('рельеф');
      if (remote?.built) parts.push(`сборка ${esc(remote.built)}`);
      const upd = updateAvailable(local, remote);
      if (upd) parts.push(`<span class="upd">есть новая версия</span>`);
      actions = (local.error ? '' : `<button type="button" class="tnmaps-btn primary" data-tnmaps-act="show" data-id="${esc(id)}">Показать</button>`)
        + (upd ? `<button type="button" class="tnmaps-btn" data-tnmaps-act="download" data-id="${esc(id)}">⟳ Обновить</button>` : '')
        + `<button type="button" class="tnmaps-btn danger" data-tnmaps-act="delete" data-id="${esc(id)}" title="Удалить карту области">Удалить</button>`;
    } else {
      const part = state.partial[id];
      parts.push(formatSize(total));
      if ((remote?.terrain || []).length) parts.push('с рельефом');
      if (remote?.built) parts.push(`сборка ${esc(remote.built)}`);
      if (part) parts.push(`<span class="upd">скачано ${Math.min(99, Math.floor(part / (remote?.size || part) * 100))}%</span>`);
      if (dl?.phase === 'error') parts.push(`<span class="err">${esc(dl.message || 'ошибка')}</span>`);
      actions = `<button type="button" class="tnmaps-btn primary" data-tnmaps-act="download" data-id="${esc(id)}">${part ? '⬇ Докачать' : '⬇ Скачать'}</button>`;
    }
    if (local && dl?.phase === 'error') parts.push(`<span class="err">${esc(dl.message || 'ошибка')}</span>`);
    return `<div class="tnmaps-item${local ? ' downloaded' : ''}">
      <div class="tnmaps-item-main"><div class="tnmaps-item-name">${esc(regionName(id))}</div>
      <div class="tnmaps-item-sub">${parts.join(' · ')}</div></div>
      <div class="tnmaps-item-actions">${actions}</div></div>`;
  }

  function renderWindow() {
    const overlay = document.getElementById('modal-tnmaps');
    if (!overlay) return;
    const status = overlay.querySelector('[data-tnmaps-status]');
    if (state.catalogError && !state.catalog) {
      status.textContent = `Список карт недоступен: ${state.catalogError}`;
      status.className = 'tnmaps-status warn';
    } else if (state.catalog) {
      const when = state.catalogSavedAt ? new Date(state.catalogSavedAt * 1000).toLocaleString('ru-RU') : '';
      status.textContent = state.catalogFromCache
        ? `Нет связи с сервером — список от ${when}. Скачанные карты работают без интернета.`
        : `${(state.catalog.maps || []).length} областей на сервере. Карта области работает без интернета.`;
      status.className = 'tnmaps-status' + (state.catalogFromCache ? ' warn' : '');
    }
    const q = state.filter.trim().toLowerCase();
    const ids = new Set([...(state.catalog?.maps || []).map(m => m.id), ...state.local.map(m => m.id)]);
    const match = id => !q || regionName(id).toLowerCase().includes(q) || id.includes(q);
    const byName = (a, b) => regionName(a).localeCompare(regionName(b), 'ru');
    const mine = [...ids].filter(id => (localEntry(id) || state.downloads[id]?.phase === 'download' || state.downloads[id]?.phase === 'verify') && match(id)).sort(byName);
    const rest = [...ids].filter(id => !mine.includes(id) && match(id)).sort(byName);
    overlay.querySelector('[data-tnmaps-list]').innerHTML =
      (mine.length ? `<div class="tnmaps-group">На этом компьютере</div>${mine.map(itemHtml).join('')}` : '')
      + (rest.length ? `<div class="tnmaps-group">Можно скачать</div>${rest.map(itemHtml).join('')}` : '')
      + (!mine.length && !rest.length ? '<div class="tnmaps-empty">Ничего не найдено</div>' : '');
    overlay.querySelector('[data-tnmaps-dir]').textContent = state.dir ? `Папка: ${state.dir}` : '';
  }

  async function loadCatalog() {
    try {
      const res = await invoke('tnmaps_catalog');
      state.catalog = res.catalog;
      state.catalogFromCache = !!res.fromCache;
      state.catalogSavedAt = res.savedAt;
      state.catalogError = '';
    } catch (e) {
      state.catalogError = String(e?.message || e);
    }
  }

  async function openWindow() {
    injectCss();
    const overlay = ensureWindow();
    if (typeof window.openModal === 'function') window.openModal('modal-tnmaps');
    else overlay.classList.add('open');
    renderWindow();
    await Promise.all([refreshLocal().catch(() => {}), loadCatalog()]);
    renderWindow();
    renderLayerSection();
  }

  async function startDownload(id) {
    if (typeof window.isPremiumAvailable === 'function' && !window.isPremiumAvailable()) {
      toast('⚠ Скачивание TrophyNav Maps — по лицензии или в триал-периоде', 'warning');
      return;
    }
    state.downloads[id] = { phase: 'start', done: 0, total: 0 };
    renderWindow();
    try {
      await invoke('tnmaps_download', { id });
      await refreshLocal();
      toast(`✓ ${regionName(id)}: карта скачана`);
      // Обновлённая карта на экране — перечитать (тот же стиль, новые тайлы)
      if (activeId() === id) state.activeLayer.reloadStyle();
    } catch (e) {
      const msg = String(e?.message || e);
      if (!/остановлена/i.test(msg)) toast(`⚠ ${regionName(id)}: ${msg}`);
      await refreshLocal().catch(() => {});
    } finally {
      if (state.downloads[id] && state.downloads[id].phase !== 'error') delete state.downloads[id];
      renderWindow();
      renderLayerSection();
    }
  }

  async function deleteRegion(id) {
    const ask = typeof window.tndConfirmDanger === 'function' ? window.tndConfirmDanger : window.tndConfirm;
    const ok = typeof ask === 'function'
      ? await ask(`Удалить карту «${regionName(id)}» с этого компьютера? Вместе с ней удалятся файлы рельефа этой области.`, 'Удаление карты')
      : window.confirm(`Удалить карту «${regionName(id)}»?`);
    if (!ok) return;
    if (activeId() === id && typeof window.setLayer === 'function') window.setLayer(FALLBACK_LAYER);
    try {
      await invoke('tnmaps_delete', { id });
      toast(`Карта «${regionName(id)}» удалена`);
    } catch (e) {
      toast(`⚠ ${e?.message || e}`);
    }
    await refreshLocal().catch(() => {});
    renderWindow();
    renderLayerSection();
  }

  function onWindowClick(e) {
    const btn = e.target.closest('[data-tnmaps-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.tnmapsAct) {
      case 'close': if (typeof window.closeModal === 'function') window.closeModal('modal-tnmaps'); break;
      case 'reload': state.catalog = null; openWindow(); break;
      case 'download': startDownload(id); break;
      case 'cancel': invoke('tnmaps_cancel', { id }); break;
      case 'delete': deleteRegion(id); break;
      case 'show': showRegion(id); break;
      case 'folder': {
        const opener = window.__TAURI__?.opener;
        if (state.dir && opener?.openPath) opener.openPath(state.dir).catch(() => toast('Не удалось открыть папку'));
        break;
      }
    }
  }

  function onDownloadEvent(ev) {
    const p = ev?.payload;
    if (!p?.id) return;
    if (p.phase === 'done') delete state.downloads[p.id];
    else if (p.phase === 'cancelled') { delete state.downloads[p.id]; toast(`Загрузка «${regionName(p.id)}» остановлена — её можно докачать`); }
    else {
      const prev = state.downloads[p.id];
      state.downloads[p.id] = { phase: p.phase, done: p.done, total: p.total, message: p.message };
      // Прогресс — на месте, без перерисовки списка: иначе кнопка «Остановить» пересоздаётся
      // каждые 250 мс и клик по ней теряется
      const item = document.querySelector(`#modal-tnmaps [data-tnmaps-item="${CSS.escape(p.id)}"]`);
      if (item && prev && prev.phase === p.phase && (p.phase === 'download' || p.phase === 'verify')) {
        item.querySelector('[data-tnmaps-progress-text]').textContent = progressText(state.downloads[p.id], p.total);
        item.querySelector('[data-tnmaps-progress-bar]').style.width = `${progressPct(state.downloads[p.id])}%`;
        return;
      }
    }
    renderWindow();
  }

  // ─── запуск ───
  function init() {
    injectCss();
    const box = document.getElementById('tnmaps-layers');
    if (box) ['click', 'change', 'input'].forEach(t => box.addEventListener(t, onLayerSectionEvent));
    // Окно «Карта и слои» открылось — обновить список скачанных
    const layersModal = document.getElementById('modal-layers');
    if (layersModal) {
      new MutationObserver(() => {
        if (layersModal.classList.contains('open')) refreshLocal().then(renderLayerSection).catch(() => {});
      }).observe(layersModal, { attributes: true, attributeFilter: ['class'] });
    }
    window.__TAURI__?.event?.listen?.('tnmaps-download', onDownloadEvent);
    if (window.__TAURI_INTERNALS__) {
      refreshLocal().then(renderLayerSection).catch(() => {});
      // Названия областей для списка и строки состояния (тихо, без окна)
      loadCatalog().then(() => { renderLayerSection(); window.updateBaseLayerStatusText?.(); });
    }
  }

  /** Скачанная область, в которую попадает точка (для 3D с растровой карты на экране). */
  function regionAt(lat, lng, prefer) {
    const inside = m => {
      if (!m || m.error) return false;
      const b = catalogEntry(m.id)?.bounds || m.bounds;
      return Array.isArray(b) && b.length === 4 && lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
    };
    // Границы областей пересекаются — сначала та, что уже на экране
    if (prefer && inside(localEntry(prefer))) return prefer;
    return state.local.find(inside)?.id || null;
  }

  window.TrophyNavMaps = {
    isLayerName, labelFor, makeLayer, openWindow, showRegion, renderLayerSection, hasWebGL,
    // для 3D-вида (ui/trophynav-3d.js)
    activeId, regionAt, regionName, localEntry, refreshLocal, ensureLibs, buildStyleFor, addTopoImage,
    STYLE_BASE,
    _state: state,
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
