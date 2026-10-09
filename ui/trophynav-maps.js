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
  const LS_AUTO = 'tnd-tnmaps-autoswitch';
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
    fetched: {},        // id → true: в текущей загрузке байты реально качались (иначе это была проверка)
    filter: '',
    activeLayer: null,  // TnVectorLayer на карте
    theme: {},          // id карты → выбранная тема (в памяти; localStorage — только между запусками)
    applyingTheme: null, // id карты, у которой тема ещё перерисовывается («Применяю тему…»)
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
  /** Значок из набора tn-icons.js (в тестах без DOM — пусто). */
  const ico = (name, cls) => (typeof window.tnIcon === 'function' ? window.tnIcon(name, cls) : '');
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
  /** Обзорная карта России — не область: не в списке областей, не «удалить», в bounds-поиске не участвует. */
  const OVERVIEW_ID = Core?.OVERVIEW_ID || 'russia-overview';
  const isOverview = m => !!m && (m.kind === 'overview' || m.id === OVERVIEW_ID || catalogEntry(m.id)?.kind === 'overview');
  /** Скачанная исправная обзорная карта или null. */
  function overviewLocal() {
    const m = localEntry(OVERVIEW_ID);
    return m && !m.error ? m : null;
  }
  function regionName(id) {
    const c = catalogEntry(id);
    if (c?.name) return c.name;
    if (id === OVERVIEW_ID) return 'Обзорная карта России';
    const l = localEntry(id);
    // Имя в metadata бывает дефолтом сборщика («OpenMapTiles…») — тогда id
    if (l?.name && !/openmaptiles/i.test(l.name)) return l.name;
    return id;
  }
  function labelFor(name) {
    return isLayerName(name) ? `TrophyNav Maps · ${regionName(idOf(name))}` : name;
  }

  // ─── настройки (как на Android: тема у каждой карты своя) ───
  /**
   * Тема карты: сначала выбор в этой сессии (память), localStorage — только то, что сохранено с прошлого
   * запуска. Перечитывать localStorage после await нельзя: потерянная или чужая запись вернула бы старую тему.
   */
  function themeFor(id) {
    if (state.theme[id]) return state.theme[id];
    const saved = Core.normalizeTheme(lsGet(`${LS_THEME}:${id}`) || lsGet(LS_THEME) || Core.DEFAULT_THEME);
    state.theme[id] = saved;
    return saved;
  }
  function readRelief() {
    try { return Core.normalizeRelief(JSON.parse(lsGet(LS_RELIEF) || '{}')); } catch { return Core.normalizeRelief({}); }
  }
  const readPoi = () => lsGet(LS_POI) || 'all';

  // ─── WebGL и библиотеки ───
  let webglChecked = null;
  /**
   * Мост MapLibre ↔ Leaflet рисует векторную основу в своём кадре: jumpTo только просит перерисовку
   * (следующий requestAnimationFrame), а сдвиг ещё и с throttle 32 мс. Точки, треки и маршруты Leaflet
   * двигаются сразу — при зуме и перетаскивании они «пляшут» относительно основы (Андрей 09.10).
   * Здесь: без throttle и синхронная перерисовка MapLibre в том же кадре, что и слои Leaflet.
   */
  function syncGl(gl) {
    const redraw = () => { const m = gl._glMap; if (m && typeof m.redraw === 'function') m.redraw(); };
    const upd = gl._update, pinch = gl._pinchZoom;
    gl._update = function (e) { upd.call(this, e); if (!this._zooming) redraw(); };
    gl._pinchZoom = function (e) { pinch.call(this, e); redraw(); };
    gl._throttledUpdate = gl._update; // getEvents() берёт его на addTo
    return gl;
  }

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

  /**
   * Стиль карты. Тему, рельеф и значки фиксируем до первого await: применяется ровно тот выбор,
   * ради которого стиль собирают (opts.theme — явно от вызывающего).
   */
  async function buildStyleFor(id, opts = {}) {
    const themeId = Core.normalizeTheme(opts.theme || themeFor(id));
    const relief = readRelief();
    const poi = readPoi();
    let map = localEntry(id);
    if (!map) { await refreshLocal(); map = localEntry(id); }
    if (!map) throw new Error('карта области не скачана');
    if (map.error) throw new Error(map.error);
    const template = await fetchAsset('style-liberty.json');
    if (!template) throw new Error('нет файла стиля');
    // «Обычная» — базовый стиль без файла темы
    const themeText = themeId === 'normal' ? null : await fetchAsset(`theme-${themeId}.json`);
    const theme = themeText ? JSON.parse(themeText) : null;
    // Обзорная карта под областью: при отдалении и за краем области не белый лист (не в «слое поверх»)
    const overview = opts.overview === false ? null : overviewLocal();
    return Core.buildStyle({ template, map, base: STYLE_BASE, theme, relief, poi, overview });
  }

  // ─── слой Leaflet ───
  const TnVectorLayer = L.Layer.extend({
    initialize(id) {
      this.mapId = id;
      this._gl = null;
      this._token = 0;     // жизненный цикл слоя: снят с карты — старые ответы не применяются
      this._styleSeq = 0;  // номер последнего запроса стиля: применяется только самый свежий выбор
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
      renderWindow();
    },
    getAttribution() { return ATTRIBUTION; },
    glMap() { return this._gl?.getMaplibreMap?.() || null; },

    async _build(token) {
      try {
        await ensureLibs();
        // Тему/рельеф/значки могли поменять, пока собирался стиль: собрать заново по последнему выбору
        let style, seq;
        do {
          seq = this._styleSeq;
          style = await buildStyleFor(this.mapId, { theme: themeFor(this.mapId) });
          if (token !== this._token || !this._map) return;
        } while (seq !== this._styleSeq);
        // padding 0.05: холст больше окна на 5% с каждой стороны (было 10%) — меньше пикселей на кадр
        const gl = L.maplibreGL({ style, interactive: false, pane: 'tilePane', attributionControl: false, padding: 0.05 });
        this._gl = gl;
        syncGl(gl);
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
        renderWindow();
      } catch (e) {
        if (token !== this._token) return;
        console.warn('TrophyNav Maps: не открылась', e);
        fallbackToRaster(`⚠ TrophyNav Maps не открылась: ${e?.message || e}. Показана растровая карта.`);
      }
    },

    /**
     * Пересобрать стиль после смены темы, рельефа или значков — без пересоздания WebGL.
     * theme — явно (по умолчанию — выбор в памяти на момент вызова, до любых await).
     */
    async reloadStyle(theme = themeFor(this.mapId)) {
      // Номер запроса — до любых await: поздний ответ прежнего выбора (тема «Топо» грузится дольше
      // «Обычной») не должен лечь поверх последнего. Пока слой строится, _build сам увидит новый номер.
      const seq = ++this._styleSeq;
      const mlMap = this.glMap();
      if (!mlMap) { this._themeApplied(seq); return; }
      const token = this._token;
      const current = () => token === this._token && seq === this._styleSeq;
      try {
        const style = await buildStyleFor(this.mapId, { theme });
        if (!current()) return;
        // diff:true — у тем одни и те же источники, спрайт и шрифты, меняются слои и paint: MapLibre
        // правит только изменённые слои, тайлы не грузятся заново. Если разница не выражается
        // операциями diff, MapLibre сам пересобирает стиль целиком (Unable to perform style diff).
        mlMap.setStyle(style, { diff: true });
        if (typeof mlMap.once === 'function') {
          mlMap.once('idle', () => { if (current()) this._themeApplied(seq); });
          // idle может не прийти (слой сняли, контекст потерян) — индикатор всё равно убрать
          setTimeout(() => { if (current()) this._themeApplied(seq); }, 20000);
        } else this._themeApplied(seq);
      } catch (e) {
        if (current()) {
          this._themeApplied(seq);
          toast(`⚠ Не удалось применить настройки карты: ${e?.message || e}`);
        }
      }
    },
    /** Перерисовка по последнему выбору закончилась — убрать «Применяю тему…». */
    _themeApplied(seq) {
      if (seq !== this._styleSeq || state.applyingTheme !== this.mapId) return;
      state.applyingTheme = null;
      renderLayerSection();
      renderWindow();
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

  /**
   * Векторная карта области слоем поверх другой карты (ui/tn-layers.js, «Слои поверх»): свой экземпляр
   * моста в своём pane, не основная карта — state.activeLayer, тема/рельеф основы и откат на растр не
   * трогаются. mode 'roads-labels' — стиль без фона, заливок и рельефа (Core.roadsLabelsStyle),
   * poi — значки в этом режиме. Ошибки — в opts.onError (строка слоя показывает причину, нижние карты на месте).
   */
  const TnStackLayer = L.Layer.extend({
    initialize(id, opts) {
      this.mapId = id;
      this.opts = opts || {};
      this._gl = null;
      this._token = 0;
    },
    onAdd(map) {
      this._map = map;
      this._build(++this._token);
    },
    onRemove(map) {
      this._token++;
      if (this._gl) {
        try { map.removeLayer(this._gl); } catch (e) { console.warn('TrophyNav Maps (слой поверх): снятие', e); }
        this._gl = null;
      }
    },
    getAttribution() { return ATTRIBUTION; },
    glMap() { return this._gl?.getMaplibreMap?.() || null; },
    async _build(token) {
      const fail = msg => { if (token === this._token) this.opts.onError?.(msg); };
      try {
        if (!hasWebGL()) throw new Error('нет WebGL');
        await ensureLibs();
        let style = await buildStyleFor(this.mapId, { theme: themeFor(this.mapId), overview: false });
        if (this.opts.mode === 'roads-labels') style = Core.roadsLabelsStyle(style, { poi: !!this.opts.poi });
        if (token !== this._token || !this._map) return;
        const gl = L.maplibreGL({ style, interactive: false, pane: this.opts.pane || 'tilePane', attributionControl: false, padding: 0.05 });
        this._gl = gl;
        syncGl(gl);
        gl.addTo(this._map);
        const mlMap = gl.getMaplibreMap();
        if (!mlMap) throw new Error('WebGL недоступен');
        mlMap.on('styleimagemissing', e => addTopoImage(mlMap, e.id));
        mlMap.on('error', e => {
          if (e?.error instanceof TnNoTile || e?.error?.name === 'TnNoTile') return;
          console.warn('TrophyNav Maps (слой поверх):', e?.error?.message || e);
        });
        mlMap.getCanvas().addEventListener('webglcontextlost', ev => {
          if (token !== this._token) return;
          ev.preventDefault();
          fail('видеокарта сбросила векторную карту (WebGL)');
        }, { once: true });
        if (typeof mlMap.once === 'function') mlMap.once('idle', () => { if (token === this._token) this.opts.onReady?.(); });
      } catch (e) {
        console.warn('TrophyNav Maps (слой поверх): не открылась', e);
        fail(e?.message || String(e));
      }
    },
  });
  function makeStackLayer(id, opts) { return new TnStackLayer(id, opts); }

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
    if (id === OVERVIEW_ID) return; // вся страна: камеру не трогать
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

  // ─── автоподгрузка областей (bounds — запасной способ без обзорной карты) ───
  const auto = { timer: null, busy: false, moving: false, retryAt: 0, dismissed: new Set(), prompt: null };
  const autoEnabled = () => lsGet(LS_AUTO) !== 'false';
  function clearRegionPrompt() {
    auto.prompt?.remove();
    auto.prompt = null;
  }
  function autoContext() {
    const m = leafletMap();
    if (auto.moving || !autoEnabled() || !m || m.getZoom() < 6 || !isLayerName(currentLayerName())) return null;
    // Офлайн sqlitedb может лежать поверх векторной основы, включая гоночную карту.
    if (typeof offlineBaseModeActive !== 'undefined' && offlineBaseModeActive) return null;
    if (typeof hasActiveOfflineMaps === 'function' && hasActiveOfflineMaps()) return null;
    const id = activeId();
    return id && id === idOf(currentLayerName()) ? { id, center: m.getCenter() } : null;
  }
  function targetRegion() {
    const c = autoContext();
    return c ? regionAt(c.center.lat, c.center.lng, c.id, true) : null;
  }
  function switchRegion(id) {
    if (!id || targetRegion() !== id || activeId() === id || !localEntry(id) || localEntry(id).error) return;
    if (typeof window.setLayer !== 'function') return;
    window.setLayer(LAYER_PREFIX + id, null, { quiet: true });
    if (activeId() === id) {
      toast(`Карта: ${regionName(id)}`);
      renderLayerSection();
      window.TnLayers?.refresh();
    }
  }
  function offerRegion(id) {
    if (auto.prompt?.dataset.id === id) return;
    clearRegionPrompt();
    const entry = catalogEntry(id);
    const el = document.createElement('div');
    el.className = 'tnmaps-region-prompt';
    el.dataset.id = id;
    el.setAttribute('role', 'status');
    const size = (Number(entry.size) || 0) + (entry.terrain || []).reduce((n, t) => n + (Number(t.size) || 0), 0);
    el.innerHTML = `<span>Здесь нет карты. Скачать ${esc(regionName(id))} (${formatSize(size)})?</span>
      <button type="button" class="tnmaps-btn primary" data-download>Скачать</button>
      <button type="button" class="tnmaps-btn" data-dismiss>Не сейчас</button>`;
    el.querySelector('[data-dismiss]').addEventListener('click', () => {
      auto.dismissed.add(id);
      clearRegionPrompt();
    });
    el.querySelector('[data-download]').addEventListener('click', async () => {
      if (targetRegion() !== id) { clearRegionPrompt(); return; }
      clearRegionPrompt();
      const ok = await startDownload(id);
      // Не скачалось (нет лицензии, ошибка, остановка) — до перезапуска больше не предлагать эту область,
      // иначе каждое движение карты снова выводит то же предложение.
      if (!ok) { auto.dismissed.add(id); return; }
      switchRegion(id); // Перепроверить камеру и выбранную подложку после загрузки.
    });
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    document.body.appendChild(el);
    auto.prompt = el;
  }
  async function checkAutoRegion() {
    if (auto.busy) return;
    if (!autoContext()) { clearRegionPrompt(); return; }
    auto.busy = true;
    try {
      let id = targetRegion();
      if (id && id !== activeId() && localEntry(id) && !localEntry(id).error) {
        clearRegionPrompt();
        switchRegion(id);
        return;
      }
      if (!state.catalog && Date.now() >= auto.retryAt) {
        await loadCatalog();
        if (!state.catalog) {
          auto.retryAt = Date.now() + 60000;
          clearTimeout(auto.timer);
          auto.timer = setTimeout(checkAutoRegion, 60000);
        }
      }
      // Каталог отвечает асинхронно: пользователь уже мог уйти или выбрать другую карту.
      id = targetRegion();
      if (!id || id === activeId()) { clearRegionPrompt(); return; }
      if (localEntry(id) && !localEntry(id).error) { clearRegionPrompt(); switchRegion(id); return; }
      if (catalogEntry(id) && !auto.dismissed.has(id) && !state.downloads[id] && canDownload(id)) offerRegion(id);
      else clearRegionPrompt();
    } finally { auto.busy = false; }
  }
  function scheduleAutoRegion() {
    clearTimeout(auto.timer);
    clearRegionPrompt();
    auto.timer = setTimeout(checkAutoRegion, 1000);
  }

  // ─── настройки активной карты ───
  function setTheme(themeId) {
    const id = activeId();
    if (!id) return;
    const theme = Core.normalizeTheme(themeId);
    state.theme[id] = theme;
    lsSet(`${LS_THEME}:${id}`, theme);
    lsSet(LS_THEME, theme);
    // Тема — явным аргументом: после await стиль не перечитывает выбор ни из памяти, ни из localStorage
    state.applyingTheme = id;
    state.activeLayer.reloadStyle(theme);
    renderLayerSection();
    renderWindow();
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
      .tnmaps-link { font-size:12px; font-weight:700; cursor:pointer; color:var(--primary-text); background:none; border:none; padding:0; text-transform:none; letter-spacing:0; }
      .tnmaps-empty { font-size:11px; color:var(--text-muted); padding:4px 2px 6px; }
      .tnmaps-size { margin-left:auto; font-size:10px; color:var(--text-muted); }
      /* Блок под активной картой: две колонки — подпись фиксированной ширины и элементы; строки 34 px */
      .tnmaps-controls { background:var(--surface-variant); border:0; border-radius:var(--radius-m); padding:6px 10px; margin:4px 0 6px;
        display:grid; grid-template-columns:52px minmax(0,1fr); column-gap:8px; row-gap:2px; align-items:center; }
      .tnmaps-label { font-size:11px; color:var(--text-muted); line-height:34px; white-space:nowrap; }
      .tnmaps-val { min-height:34px; min-width:0; display:flex; align-items:center; gap:8px; font-size:11px; color:var(--text-primary); }
      .tnmaps-sub { grid-column:2; }
      .tnmaps-seg { flex:1; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); height:28px; border:1px solid var(--text-secondary); border-radius:var(--radius-pill); overflow:hidden; }
      .tnmaps-seg-btn { min-width:0; padding:0 4px; border:0; border-left:1px solid var(--text-secondary); background:transparent; color:var(--text-primary); font-size:12px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .tnmaps-seg-btn:first-child { border-left:0; }
      .tnmaps-seg-btn:hover { background:var(--hover); }
      .tnmaps-seg-btn.active { background:var(--primary); color:var(--on-primary); }
      .tnmaps-checks { gap:6px; }
      .tnmaps-checks label { display:flex; align-items:center; gap:3px; min-width:0; cursor:pointer; color:var(--text-primary); }
      .tnmaps-checks label > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .tnmaps-checks input, .tnmaps-poi input { margin:0; flex:0 0 auto; width:14px; height:14px; accent-color:var(--primary); }
      .tnmaps-checks label.off { color:var(--text-muted); cursor:default; }
      .tnmaps-val input[type=range] { flex:1; min-width:0; margin:0; }
      .tnmaps-pct { flex:0 0 36px; text-align:right; font-variant-numeric:tabular-nums; color:var(--text-secondary); }
      .tnmaps-wide { flex:1; min-width:0; height:30px; display:flex; align-items:center; padding:0 10px; font-size:12px; border-radius:var(--radius-pill); border:1px solid var(--text-secondary); background:transparent; color:var(--text-primary); cursor:pointer; }
      .tnmaps-wide:hover { background:var(--hover); }
      .tnmaps-wide > span { flex:1; min-width:0; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .tnmaps-wide .tn-ico.tnmaps-chev { margin:0 0 0 6px; }
      .tnmaps-hint { font-size:10px; color:var(--text-muted); padding:0 0 4px; }
      .tnmaps-applying { font-size:11px; color:var(--primary-text); padding:0 0 4px; }
      .tnmaps-item-theme { display:flex; align-items:center; gap:8px; margin-top:6px; max-width:280px; }
      .tnmaps-item-theme .tnmaps-label { line-height:28px; }
      #modal-tnmaps-win { top:70px; left:calc(50% - 250px); width:500px; max-height:calc(100vh - 110px); display:flex; flex-direction:column; }
      #modal-tnmaps .modal-body { display:flex; flex-direction:column; gap:8px; }
      .tnmaps-status { font-size:11px; color:var(--text-muted); }
      .tnmaps-status.warn { color:var(--text-warning); }
      .tnmaps-search { width:100%; padding:8px 10px; border-radius:var(--radius-s); border:1px solid var(--input-border); background:var(--input-bg); color:var(--text-primary); font-size:12px; }
      .tnmaps-list { display:flex; flex-direction:column; gap:4px; overflow-y:auto; max-height:calc(100vh - 290px); }
      .tnmaps-group { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); padding:8px 0 2px; }
      .tnmaps-item { display:flex; align-items:center; gap:8px; padding:8px 12px; border:0; border-radius:var(--radius-m); background:var(--surface-variant); }
      .tnmaps-item.downloaded { background:var(--success-soft); }
      .tnmaps-item-main { flex:1; min-width:0; }
      .tnmaps-item-name { font-size:13px; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .tnmaps-item-sub { font-size:10px; color:var(--text-muted); margin-top:2px; }
      .tnmaps-item-sub .ok { color:var(--accent-green); }
      .tnmaps-item-sub .upd { color:var(--accent-amber); }
      .tnmaps-item-sub .err { color:var(--accent-red); }
      .tnmaps-item-actions { display:flex; gap:4px; flex-shrink:0; }
      .tnmaps-btn { min-height:30px; font-size:12px; font-weight:700; padding:4px 12px; border-radius:var(--radius-pill); cursor:pointer; border:1.5px solid var(--text-secondary); background:transparent; color:var(--text-primary); white-space:nowrap; }
      .tnmaps-btn:hover { background:var(--hover); }
      .tnmaps-btn.primary { border-color:var(--primary); color:var(--primary-text); background:transparent; }
      .tnmaps-btn.primary:hover { background:var(--primary-soft); }
      .tnmaps-btn.danger { color:var(--error-text); border-color:var(--border-danger); background:transparent; }
      .tnmaps-progress { height:4px; border-radius:var(--radius-pill); background:var(--surface-tab); margin-top:4px; overflow:hidden; }
      .tnmaps-progress > div { height:100%; background:var(--accent); width:0; transition:width .2s; }
      .tnmaps-foot { font-size:10px; color:var(--text-muted); display:flex; justify-content:space-between; gap:8px; align-items:center; }
      .tnmaps-poi { grid-column:2; display:flex; flex-direction:column; gap:2px; padding:0 0 4px; }
      .tnmaps-poi label { display:flex; align-items:center; gap:6px; min-height:24px; font-size:11px; color:var(--text-primary); cursor:pointer; }
      .sb-download { display:inline-flex; align-items:center; gap:10px; color:var(--text-primary); }
      .sb-download[hidden] { display:none; }
      .sb-dl-item { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
      .sb-dl-track { width:90px; height:5px; border-radius:3px; background:var(--border-normal); overflow:hidden; }
      .sb-dl-fill { display:block; height:100%; background:var(--primary); transition:width 0.25s; }
      .sb-dl-x { appearance:none; border:0; background:transparent; color:var(--text-muted); cursor:pointer; font-size:12px; padding:0 4px; border-radius:var(--radius-xs); }
      .sb-dl-x:hover { background:var(--bg-hover); color:var(--text-primary); }
      .tnmaps-region-prompt { position:fixed; top:112px; left:50%; transform:translateX(-50%); z-index:5000; display:flex; align-items:center; flex-wrap:wrap; gap:8px; max-width:calc(100vw - 32px); padding:10px 18px; background:var(--modal-bg); color:var(--text-primary); border:1px solid var(--card-stroke); border-left:4px solid var(--primary); border-radius:var(--radius-m); box-shadow:var(--shadow-2); font-size:var(--fs-s); }
      .tnmaps-poi[hidden] { display:none; }
    `;
    document.head.appendChild(st);
  }

  /** Переключатель темы в одну строку (Обычная | Контраст | Топо) — в «Карте и слоях» и в окне областей. */
  function themeSegHtml(theme) {
    return `<div class="tnmaps-seg" role="group" aria-label="Тема карты">${Core.THEMES.map(t =>
      `<button type="button" class="tnmaps-seg-btn${t.id === theme ? ' active' : ''}" data-tnmaps-theme="${t.id}" aria-pressed="${t.id === theme}">${esc(t.title)}</button>`).join('')}</div>`;
  }

  // ─── раздел в окне «Карта и слои» ───
  function renderLayerSection() {
    const box = document.getElementById('tnmaps-layers');
    if (!box) return;
    const current = currentLayerName();
    const act = activeId();
    const items = state.local.filter(m => !m.error).sort((a, b) => isOverview(a) - isOverview(b)).map(m => {
      const name = LAYER_PREFIX + m.id;
      const extras = (m.dem ? 1 : 0) + (m.slope ? 1 : 0);
      return `<div class="base-layer${name === current ? ' active' : ''}" data-layer="${esc(name)}" data-tnmaps-show="${esc(m.id)}">
        ${ico('compass', 'tn-ico-t tn-ico-m')}${esc(regionName(m.id))}<span class="tnmaps-size">${formatSize(m.size + (m.dem?.size || 0) + (m.slope?.size || 0))}${extras ? ' · рельеф' : ''}</span></div>`;
    }).join('');
    let controls = '';
    if (act) {
      const theme = themeFor(act);
      const r = readRelief();
      const m = localEntry(act) || {};
      const hasDem = !!m.dem, hasSlope = !!m.slope;
      const poi = Core.parsePoi(readPoi());
      const on = cond => (cond ? '' : 'disabled');
      // Нет файла крутизны — галка не отмечена и неактивна, что бы ни было сохранено для других областей
      const slopeOn = r.slope && hasSlope;
      controls = `<div class="tnmaps-controls" data-tnmaps-controls>
        <span class="tnmaps-label">Тема</span>
        <div class="tnmaps-val">${themeSegHtml(theme)}</div>
        ${state.applyingTheme === act ? '<div class="tnmaps-applying tnmaps-sub" role="status" data-tnmaps-applying>Применяю тему…</div>' : ''}
        <span class="tnmaps-label">Рельеф</span>
        <div class="tnmaps-val tnmaps-checks">
          <label title="Показывать рельеф"><input type="checkbox" data-tnmaps-relief="on" ${r.on ? 'checked' : ''}><span>вкл.</span></label>
          <label class="${r.on ? '' : 'off'}"><input type="checkbox" data-tnmaps-relief="contours" ${r.contours ? 'checked' : ''} ${on(r.on)}><span>горизонтали</span></label>
          <label class="${r.on && hasSlope ? '' : 'off'}" title="${hasSlope ? 'Крутизна склонов' : 'У этой области нет файла крутизны'}"><input type="checkbox" data-tnmaps-relief="slope" ${slopeOn ? 'checked' : ''} ${on(r.on && hasSlope)}><span>крутизна</span></label>
        </div>
        <span class="tnmaps-label">Отмывка</span>
        <div class="tnmaps-val">
          <input type="range" min="0" max="15" step="1" value="${r.strength}" data-tnmaps-strength ${on(r.on && (hasDem || hasSlope))} aria-label="Сила отмывки">
          <span class="tnmaps-pct">${r.strength * 10}%</span>
        </div>
        ${theme !== 'topo' ? '<div class="tnmaps-hint tnmaps-sub">Отмывка, крутизна и горизонтали рисуются в теме «Топо».</div>'
          : hasDem || hasSlope ? '' : '<div class="tnmaps-hint tnmaps-sub">У этой области нет файлов рельефа — горизонтали только из самой карты.</div>'}
        <span class="tnmaps-label">Значки</span>
        <div class="tnmaps-val">
          <button type="button" class="tnmaps-wide" data-tnmaps-poi-toggle>${ico('pin', 'tn-ico-t')}<span>Значки на карте: ${Core.poiSummary(poi)}</span>${ico('chevron-down', 'tn-ico-t tnmaps-chev')}</button>
        </div>
        <div class="tnmaps-poi" data-tnmaps-poi-list hidden>
          ${Core.POI_GROUPS.map(g => `<label><input type="checkbox" data-tnmaps-poi="${g.id}" ${poi.has(g.id) ? 'checked' : ''}> ${esc(g.title)}</label>`).join('')}
          <div><button type="button" class="tnmaps-wide" data-tnmaps-poi-all><span>Все / ни одного</span></button></div>
        </div>
        <span class="tnmaps-label">3D</span>
        <div class="tnmaps-val">
          <button type="button" class="tnmaps-wide" data-tnmaps-3d>${ico('terrain', 'tn-ico-t')}<span>Открыть 3D-вид</span></button>
        </div>
      </div>`;
    }
    const hint = state.local.length ? '' : '<div class="tnmaps-empty">Нет скачанных областей. Векторные карты работают без интернета.</div>';
    const setting = `<div class="tnmaps-checks"><label><input type="checkbox" data-tnmaps-auto ${autoEnabled() ? 'checked' : ''}>Автопереключение карт областей</label></div>`;
    const html = items + controls + setting + hint;
    // Та же разметка — узлы не трогать: пересоздание строки под нажатой кнопкой мыши съедает click
    // (WebKit не шлёт click, если элемент mousedown удалён до mouseup)
    if (box.__tnmapsHtml === html && box.childElementCount) return;
    box.__tnmapsHtml = html;
    const poiOpen = box.querySelector('[data-tnmaps-poi-list]')?.hidden === false;
    box.innerHTML = html;
    if (poiOpen) { const l = box.querySelector('[data-tnmaps-poi-list]'); if (l) l.hidden = false; }
  }

  /**
   * Кнопки раздела срабатывают по pointerup, если pointerdown был на том же действии (строка может
   * пересоздаться между нажатием и отпусканием — сравниваем действие, а не узел), и по click — для
   * клавиатуры и случая без pointer-событий. Повторный click того же действия сразу после pointerup
   * не выполняется второй раз.
   */
  const CLICK_ACTIONS = [
    ['[data-tnmaps-show]', el => `show:${el.dataset.tnmapsShow}`],
    ['[data-tnmaps-theme]', el => `theme:${el.dataset.tnmapsTheme}`],
    ['[data-tnmaps-3d]', () => '3d'],
    ['[data-tnmaps-poi-toggle]', () => 'poi-toggle'],
    ['[data-tnmaps-poi-all]', () => 'poi-all'],
  ];
  function clickAction(target) {
    for (const [sel, key] of CLICK_ACTIONS) {
      const el = target?.closest?.(sel);
      if (el) return { el, key: key(el) };
    }
    return null;
  }
  const press = { key: null, doneKey: null, doneAt: 0 };
  function runClickAction({ el, key }) {
    if (key.startsWith('show:')) { showRegion(el.dataset.tnmapsShow, el); return; }
    if (key.startsWith('theme:')) { setTheme(el.dataset.tnmapsTheme); return; }
    if (key === '3d') {
      if (typeof window.closeModal === 'function') window.closeModal('modal-layers');
      window.TrophyNav3D?.open();
      return;
    }
    if (key === 'poi-toggle') {
      const list = document.querySelector('#tnmaps-layers [data-tnmaps-poi-list]');
      if (list) list.hidden = !list.hidden;
      return;
    }
    if (key === 'poi-all') {
      const cur = Core.parsePoi(readPoi());
      setPoi(cur.size < Core.POI_ALL.length ? Core.POI_ALL : []);
    }
  }

  function onLayerSectionEvent(e) {
    const t = e.target;
    if (e.type === 'pointerdown') {
      press.key = e.button === 0 || e.button == null ? clickAction(t)?.key || null : null;
      return;
    }
    if (e.type === 'pointerup') {
      const act = clickAction(t);
      const down = press.key;
      press.key = null;
      // помечаем выполненным только действие от pointerup: следующий click того же нажатия — его дубль
      if (act && down === act.key) { press.doneKey = act.key; press.doneAt = Date.now(); runClickAction(act); }
      return;
    }
    if (e.type === 'click') {
      const act = clickAction(t);
      if (!act) return;
      // click с клавиатуры (detail 0: Enter/Пробел) — всегда самостоятельное действие (ревью 2554, P3)
      if (e.detail !== 0 && press.doneKey === act.key && Date.now() - press.doneAt < 1000) { press.doneKey = null; return; }
      press.doneKey = null;
      runClickAction(act);
      return;
    }
    if (t.matches?.('[data-tnmaps-auto]') && e.type === 'change') {
      lsSet(LS_AUTO, String(t.checked));
      scheduleAutoRegion();
      renderLayerSection();
      return;
    }
    if (t.matches?.('[data-tnmaps-relief]') && e.type === 'change') { setRelief({ [t.dataset.tnmapsRelief]: t.checked }); return; }
    if (t.matches?.('[data-tnmaps-strength]')) {
      if (e.type === 'input') t.nextElementSibling.textContent = `${t.value * 10}%`;
      if (e.type === 'change') setRelief({ strength: Number(t.value) });
      return;
    }
    if (t.matches?.('[data-tnmaps-poi]') && e.type === 'change') {
      const sel = [...document.querySelectorAll('#tnmaps-layers [data-tnmaps-poi]')].filter(cb => cb.checked).map(cb => cb.dataset.tnmapsPoi);
      setPoi(sel);
      return;
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
          <span class="modal-title">${ico('compass')}TrophyNav Maps по областям</span>
          <span style="display:flex;align-items:center;gap:2px">
            <button type="button" class="tn-icon-btn" data-tnmaps-act="reload" title="Обновить список с сервера" aria-label="Обновить список с сервера">${ico('cloud-sync')}</button>
            <button type="button" class="modal-close" data-tnmaps-act="close" aria-label="Закрыть">${ico('close')}</button>
          </span>
        </div>
        <div class="modal-body">
          <div class="tnmaps-status" data-tnmaps-status>Загрузка списка…</div>
          <input class="tnmaps-search" type="search" placeholder="Поиск области" data-tnmaps-search>
          <div class="tnmaps-list" data-tnmaps-list></div>
          <div class="tnmaps-foot"><span data-tnmaps-dir></span>
            <button type="button" class="tnmaps-link" data-tnmaps-act="folder">${ico('folder', 'tn-ico-t')}Открыть папку</button></div>
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

  /**
   * Сравнение файла на диске с записью каталога — так же, как needs_download в Rust:
   * 'update' — другой размер или другой SHA-256 (или файла рельефа нет);
   * 'verify' — размер тот же, но SHA неизвестен (нет .sha256: файл скопирован вручную или сайдкар
   *            не записался) — совпадение сборки не подтверждено, загрузка сначала пересчитает хеш;
   * 'none'   — совпадает.
   */
  function fileState(l, r) {
    if (!l) return 'update';
    const remoteSha = String(r.sha256 || '').toLowerCase();
    if (l.size !== r.size) return 'update';
    if (!remoteSha) return 'none';
    if (!l.sha256) return 'verify';
    return l.sha256 === remoteSha ? 'none' : 'update';
  }
  function updateState(local, remote) {
    if (!local || !remote) return 'none';
    const states = [fileState(local, remote), ...(remote.terrain || []).map(t => fileState(local[t.kind], t))];
    return states.includes('update') ? 'update' : states.includes('verify') ? 'verify' : 'none';
  }
  const updateAvailable = (local, remote) => updateState(local, remote) !== 'none';

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
      const upd = updateState(local, remote);
      if (upd === 'update') parts.push(`<span class="upd">есть новая версия</span>`);
      if (upd === 'verify') parts.push(`<span class="upd">версия не подтверждена</span>`);
      actions = (local.error ? '' : `<button type="button" class="tnmaps-btn primary" data-tnmaps-act="show" data-id="${esc(id)}">Показать</button>`)
        + (upd === 'update' ? `<button type="button" class="tnmaps-btn" data-tnmaps-act="download" data-id="${esc(id)}" title="Скачать новую версию карты области с сервера">${ico('cloud-download', 'tn-ico-t')}Обновить</button>` : '')
        + (upd === 'verify' ? `<button type="button" class="tnmaps-btn" data-tnmaps-act="download" data-id="${esc(id)}" title="Сверить файл с сервером; если он другой — скачать заново">${ico('cloud-check', 'tn-ico-t')}Проверить</button>` : '')
        + (id === OVERVIEW_ID ? '' : `<button type="button" class="tnmaps-btn danger" data-tnmaps-act="delete" data-id="${esc(id)}" title="Удалить карту области">Удалить</button>`);
    } else {
      const part = state.partial[id];
      parts.push(formatSize(total));
      if ((remote?.terrain || []).length) parts.push('с рельефом');
      if (remote?.built) parts.push(`сборка ${esc(remote.built)}`);
      if (part) parts.push(`<span class="upd">скачано ${Math.min(99, Math.floor(part / (remote?.size || part) * 100))}%</span>`);
      if (dl?.phase === 'error') parts.push(`<span class="err">${esc(dl.message || 'ошибка')}</span>`);
      actions = `<button type="button" class="tnmaps-btn primary" data-tnmaps-act="download" data-id="${esc(id)}">${ico('download', 'tn-ico-t')}${part ? 'Докачать' : 'Скачать'}</button>`;
    }
    if (local && dl?.phase === 'error') parts.push(`<span class="err">${esc(dl.message || 'ошибка')}</span>`);
    // Карта на экране — тема прямо здесь, где карту скачивают и включают
    const themeRow = local && !local.error && activeId() === id
      ? `<div class="tnmaps-item-theme" data-tnmaps-item-theme><span class="tnmaps-label">Тема</span>${themeSegHtml(themeFor(id))}</div>`
        + (state.applyingTheme === id ? '<div class="tnmaps-applying" role="status">Применяю тему…</div>' : '')
      : '';
    return `<div class="tnmaps-item${local ? ' downloaded' : ''}">
      <div class="tnmaps-item-main"><div class="tnmaps-item-name">${esc(regionName(id))}</div>
      <div class="tnmaps-item-sub">${parts.join(' · ')}</div>${themeRow}</div>
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
        : `${(state.catalog.maps || []).filter(m => !isOverview(m)).length} областей на сервере. Карта области работает без интернета.`;
      status.className = 'tnmaps-status' + (state.catalogFromCache ? ' warn' : '');
    }
    const q = state.filter.trim().toLowerCase();
    const ids = new Set([...(state.catalog?.maps || []), ...state.local].filter(m => !isOverview(m)).map(m => m.id));
    const ovShown = catalogEntry(OVERVIEW_ID) || localEntry(OVERVIEW_ID) || state.downloads[OVERVIEW_ID];
    const match = id => !q || regionName(id).toLowerCase().includes(q) || id.includes(q);
    const byName = (a, b) => regionName(a).localeCompare(regionName(b), 'ru');
    const mine = [...ids].filter(id => (localEntry(id) || state.downloads[id]?.phase === 'download' || state.downloads[id]?.phase === 'verify') && match(id)).sort(byName);
    const rest = [...ids].filter(id => !mine.includes(id) && match(id)).sort(byName);
    overlay.querySelector('[data-tnmaps-list]').innerHTML =
      (ovShown && !q ? `<div class="tnmaps-group">Обзорная карта страны</div>${itemHtml(OVERVIEW_ID)}` : '')
      + (mine.length ? `<div class="tnmaps-group">На этом компьютере</div>${mine.map(itemHtml).join('')}` : '')
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

  function canDownload(id) {
    return id === OVERVIEW_ID || typeof window.isPremiumAvailable !== 'function' || !!window.isPremiumAvailable();
  }
  // true — карта на диске и совпадает с сервером; false — не скачана (лицензия, ошибка, остановка).
  async function startDownload(id) {
    if (!canDownload(id)) {
      toast('⚠ Скачивание TrophyNav Maps — по лицензии или в триал-периоде', 'warning');
      return false;
    }
    state.downloads[id] = { phase: 'start', done: 0, total: 0 };
    delete state.fetched[id];
    renderWindow();
    renderStatusDownloads();
    try {
      await invoke('tnmaps_download', { id });
      const downloaded = !!state.fetched[id];
      await refreshLocal();
      toast(downloaded ? `✓ ${regionName(id)}: карта скачана` : `✓ ${regionName(id)}: карта проверена, совпадает с сервером`);
      // Обновлённая карта на экране — перечитать (тот же стиль, новые тайлы)
      if (activeId() === id || (id === OVERVIEW_ID && activeId())) state.activeLayer.reloadStyle();
      return true;
    } catch (e) {
      const msg = String(e?.message || e);
      if (!/остановлена/i.test(msg)) toast(`⚠ ${regionName(id)}: ${msg}`);
      await refreshLocal().catch(() => {});
      return false;
    } finally {
      if (state.downloads[id] && state.downloads[id].phase !== 'error') delete state.downloads[id];
      renderWindow();
      renderLayerSection();
      renderStatusDownloads();
    }
  }

  async function deleteRegion(id) {
    if (id === OVERVIEW_ID) return; // обзорную только обновляют
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
    const th = e.target.closest('[data-tnmaps-theme]');
    if (th) { setTheme(th.dataset.tnmapsTheme); return; }
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

  /**
   * Прогресс скачивания карт — в нижней строке состояния (Андрей 09.10: «нажал Скачать, меню пропало, и
   * непонятно, что происходит»). Видно всегда, пока качается; ✕ — остановить (докачается потом).
   */
  function renderStatusDownloads() {
    const bar = document.getElementById('statusbar');
    if (!bar) return;
    let el = document.getElementById('sb-download');
    const active = Object.entries(state.downloads).filter(([, d]) => d && d.phase !== 'error');
    if (!active.length) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement('span');
      el.id = 'sb-download';
      el.className = 'sb-download';
      el.setAttribute('role', 'status');
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-sb-cancel]');
        if (b) invoke('tnmaps_cancel', { id: b.dataset.sbCancel }).catch(() => {});
      });
      bar.insertBefore(el, document.getElementById('app-version-label'));
    }
    el.hidden = false;
    el.innerHTML = active.map(([id, d]) => {
      const pct = progressPct(d);
      return `<span class="sb-dl-item" title="${esc(progressText(d, d.total))}">⬇ ${esc(regionName(id))}: ${d.phase === 'start' ? 'подключение…' : d.phase === 'verify' ? 'проверка…' : `${pct}% · ${formatSize(d.done)} из ${formatSize(d.total)}`}
        <span class="sb-dl-track"><span class="sb-dl-fill" style="width:${pct}%"></span></span>
        <button type="button" class="sb-dl-x" data-sb-cancel="${esc(id)}" title="Остановить (можно докачать)" aria-label="Остановить скачивание">✕</button></span>`;
    }).join('');
  }

  function onDownloadEvent(ev) {
    const p = ev?.payload;
    if (!p?.id) return;
    try { onDownloadEventInner(p); } finally { renderStatusDownloads(); }
  }
  function onDownloadEventInner(p) {
    if (p.phase === 'done') delete state.downloads[p.id];
    else if (p.phase === 'cancelled') { delete state.downloads[p.id]; toast(`Загрузка «${regionName(p.id)}» остановлена — её можно докачать`); }
    else {
      const prev = state.downloads[p.id];
      state.downloads[p.id] = { phase: p.phase, done: p.done, total: p.total, message: p.message };
      if (p.phase === 'download') state.fetched[p.id] = true;
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
    const m = leafletMap();
    m?.on('moveend', () => { auto.moving = false; scheduleAutoRegion(); });
    m?.on('layeradd layerremove', scheduleAutoRegion);
    m?.on('movestart', () => { auto.moving = true; clearTimeout(auto.timer); clearRegionPrompt(); });
    const box = document.getElementById('tnmaps-layers');
    if (box) ['pointerdown', 'pointerup', 'click', 'change', 'input'].forEach(t => box.addEventListener(t, onLayerSectionEvent));
    // Окно «Карта и слои» открылось — обновить список скачанных
    const layersModal = document.getElementById('modal-layers');
    if (layersModal) {
      // Только переход «закрыто → открыто»: класс меняется и от bringModalToFront (active) на каждом
      // нажатии мыши в окне — перерисовка в этот момент съедала клик по строке и кнопкам темы
      let wasOpen = layersModal.classList.contains('open');
      new MutationObserver(() => {
        const isOpen = layersModal.classList.contains('open');
        if (isOpen && !wasOpen) refreshLocal().then(renderLayerSection).catch(() => {});
        wasOpen = isOpen;
      }).observe(layersModal, { attributes: true, attributeFilter: ['class'] });
    }
    window.__TAURI__?.event?.listen?.('tnmaps-download', onDownloadEvent);
    if (window.__TAURI_INTERNALS__) {
      const local = refreshLocal().then(renderLayerSection).catch(() => {});
      // Названия областей для списка и строки состояния (тихо, без окна)
      const catalog = loadCatalog().then(() => { renderLayerSection(); window.updateBaseLayerStatusText?.(); });
      Promise.all([local, catalog]).then(fetchOverviewOnce);
    }
  }

  /**
   * Обзорная карта скачивается сама, тихо: при первом запуске, когда каталог пришёл с сервера (есть сеть)
   * и в нём есть её запись. Недокачанный файл докачивается. Новая версия — кнопкой «Обновить» в окне.
   */
  async function fetchOverviewOnce() {
    const id = OVERVIEW_ID;
    if (!catalogEntry(id) || state.catalogFromCache || state.downloads[id] || localEntry(id)) return;
    try {
      await invoke('tnmaps_download', { id });
      await refreshLocal();
      if (activeId()) state.activeLayer.reloadStyle();
    } catch (e) {
      console.warn('TrophyNav Maps: обзорная карта не скачалась', e);
      await refreshLocal().catch(() => {});
    } finally {
      delete state.downloads[id];
      renderWindow();
      renderLayerSection();
    }
  }

  /**
   * Область по полигонам слоя regions обзорной карты — из тайлов, уже загруженных картой на экране.
   * undefined — полигонов нет (обзорной нет, тайлы не пришли, точка в море/за границей): решают bounds.
   */
  function polygonRegionAt(lat, lng, prefer) {
    if (!overviewLocal() || !activeId()) return undefined;
    const gl = state.activeLayer.glMap?.();
    const source = activeId() === OVERVIEW_ID ? 'openmaptiles' : Core.OVERVIEW_SOURCE;
    if (!gl?.getSource?.(source) || typeof gl.querySourceFeatures !== 'function') return undefined;
    let features;
    try { features = gl.querySourceFeatures(source, { sourceLayer: 'regions' }); } catch { return undefined; }
    return Core.regionFromFeatures(features, lng, lat, { prefer }) || undefined;
  }

  /**
   * Область под точкой: по умолчанию скачанные (3D), includeCatalog — также доступные для загрузки.
   * Есть обзорная карта — по полигонам субъектов (п. 2 ТЗ), иначе (и вне полигонов) — по bounds.
   */
  function regionAt(lat, lng, prefer, includeCatalog = false) {
    const inside = m => {
      if (!m || m.error || isOverview(m)) return false;
      const b = catalogEntry(m.id)?.bounds || m.bounds;
      return Array.isArray(b) && b.length === 4 && lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
    };
    // Границы областей пересекаются — сначала та, что уже на экране
    const entries = includeCatalog
      ? [...state.local, ...(state.catalog?.maps || []).filter(m => !localEntry(m.id) || localEntry(m.id).error)]
      : state.local;
    const byPolygon = polygonRegionAt(lat, lng, prefer);
    if (byPolygon !== undefined) {
      // Полигон под точкой известен: только эта область (или ничего, если её нет ни на диске, ни в каталоге)
      return entries.some(e => e.id === byPolygon && !e.error) ? byPolygon : null;
    }
    if (prefer && inside(entries.find(m => m.id === prefer))) return prefer;
    return entries.find(inside)?.id || null;
  }

  window.TrophyNavMaps = {
    _syncGl: syncGl,
    isLayerName, labelFor, makeLayer, openWindow, showRegion, renderLayerSection, hasWebGL,
    // слой поверх другой карты (ui/tn-layers.js)
    makeStackLayer,
    // для 3D-вида (ui/trophynav-3d.js)
    activeId, regionAt, regionName, localEntry, refreshLocal, ensureLibs, buildStyleFor, addTopoImage,
    STYLE_BASE,
    _state: state,
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
