/*
 * TrophyNav Maps — чистая логика стиля векторной карты (без DOM и сети), порт Android один к одному:
 *   VectorTheme.applyThemeLayers, VectorPoiFilter, MapFragment.applyReliefPrefs / scalePaint /
 *   dropLayersWithoutSource / addTerrainSources, Map3d.applyBuildings.
 * Тесты: tests/trophynav-maps-core.test.mjs.
 */
(function (root) {
  'use strict';

  const clone = v => JSON.parse(JSON.stringify(v));
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

  // ─── Темы (VectorTheme.kt) ───
  // Ключи темы: layers {id: paint | {paint, layout, filter, minzoom}}, remove [ids],
  // add_layers + add_after, add_top, add [{…, before}]. Новые ключи только добавляют поведение.
  function patchLayer(layer, patch) {
    const structured = 'paint' in patch || 'layout' in patch || 'filter' in patch || 'minzoom' in patch;
    const paintPatch = structured ? patch.paint : patch;
    if (isObj(paintPatch)) {
      if (!isObj(layer.paint)) layer.paint = {};
      Object.keys(paintPatch).forEach(k => { layer.paint[k] = clone(paintPatch[k]); });
    }
    if (structured) {
      if (isObj(patch.layout)) {
        if (!isObj(layer.layout)) layer.layout = {};
        Object.keys(patch.layout).forEach(k => { layer.layout[k] = clone(patch.layout[k]); });
      }
      if ('filter' in patch) layer.filter = clone(patch.filter);
      if ('minzoom' in patch) layer.minzoom = patch.minzoom;
    }
  }

  function applyThemeLayers(baseLayers, theme) {
    theme = theme || {};
    const overrides = isObj(theme.layers) ? theme.layers : {};
    const removed = new Set(Array.isArray(theme.remove) ? theme.remove.map(String) : []);
    const layers = [];
    (baseLayers || []).forEach(src => {
      if (removed.has(String(src.id))) return;
      const layer = clone(src);
      if (isObj(overrides[layer.id])) patchLayer(layer, overrides[layer.id]);
      layers.push(layer);
    });
    // Доп. слои (лесные дороги…) — сразу за якорным слоем, под подписями
    if (Array.isArray(theme.add_layers)) {
      const at = layers.findIndex(l => l.id === theme.add_after);
      const items = theme.add_layers.map(clone);
      if (at >= 0) layers.splice(at + 1, 0, ...items); else layers.push(...items);
    }
    // Значки и подписи темы — поверх всего
    if (Array.isArray(theme.add_top)) theme.add_top.forEach(l => layers.push(clone(l)));
    if (Array.isArray(theme.add)) {
      theme.add.forEach(src => {
        const layer = clone(src);
        const before = layer.before ? String(layer.before) : '';
        delete layer.before;
        const at = before ? layers.findIndex(l => l.id === before) : -1;
        if (at >= 0) layers.splice(at, 0, layer); else layers.push(layer);
      });
    }
    return layers;
  }

  const THEMES = [
    { id: 'normal', title: 'Обычная' },
    { id: 'contrast', title: 'Контраст' },
    { id: 'topo', title: 'Топо' },
  ];
  const DEFAULT_THEME = 'contrast';
  const normalizeTheme = id => (THEMES.some(t => t.id === id) ? id : DEFAULT_THEME);

  // ─── Значки на карте (VectorPoiFilter.kt) ───
  const POI_GROUPS = [
    { id: 'auto', title: '⛽ Заправки и авто', classes: ['fuel', 'car', 'parking', 'bicycle'] },
    { id: 'stay', title: '🏕 Ночлег и кемпинги', classes: ['lodging', 'campsite'] },
    { id: 'water', title: '💧 Вода и туалеты', classes: ['drinking_water', 'toilets'] },
    { id: 'food', title: '🛒 Магазины и еда', classes: ['shop', 'grocery', 'alcohol_shop', 'bakery', 'clothing_store',
      'restaurant', 'fast_food', 'cafe', 'bar', 'beer', 'ice_cream'] },
    { id: 'help', title: '🏥 Медицина и службы', classes: ['hospital', 'doctor', 'dentist', 'pharmacy', 'police',
      'fire_station', 'post', 'bank', 'atm', 'town_hall'] },
    { id: 'sights', title: '🏛 Достопримечательности', classes: ['attraction', 'castle', 'monument', 'museum', 'art_gallery',
      'place_of_worship', 'religious', 'information', 'zoo', 'park', 'cemetery'] },
    { id: 'transit', title: '🚉 Транспорт', classes: ['bus', 'railway', 'rail', 'airport', 'harbor', 'aerialway', 'ferry_terminal'] },
    { id: 'other', title: '• Остальное (школы, спорт, культура…)', classes: [] },
  ];
  const POI_ALL = POI_GROUPS.map(g => g.id);
  const POI_LAYERS = new Set(['poi_z14', 'poi_z15', 'poi_z16', 'poi_transit']);

  function parsePoi(pref) {
    if (pref == null || pref === '' || pref === 'all') return new Set(POI_ALL);
    if (pref === 'none') return new Set();
    return new Set(String(pref).split(',').map(s => s.trim()).filter(s => POI_ALL.includes(s)));
  }

  function formatPoi(selected) {
    const sel = new Set(selected);
    if (POI_ALL.every(id => sel.has(id))) return 'all';
    if (sel.size === 0) return 'none';
    return POI_ALL.filter(id => sel.has(id)).join(',');
  }

  function poiSummary(selected) {
    const sel = new Set(selected);
    if (POI_ALL.every(id => sel.has(id))) return 'все';
    if (sel.size === 0) return 'скрыты';
    return `${sel.size} из ${POI_GROUPS.length}`;
  }

  /** Доп. условие для слоёв poi_*, или null, когда видно всё (стиль не трогается). */
  function poiCondition(selected) {
    const sel = new Set(selected);
    if (POI_ALL.every(id => sel.has(id))) return null;
    const listed = POI_GROUPS.flatMap(g => g.classes);
    const chosen = POI_GROUPS.filter(g => sel.has(g.id)).flatMap(g => g.classes);
    const parts = [];
    if (chosen.length) parts.push(['in', 'class', ...chosen]);
    if (sel.has('other')) parts.push(['!in', 'class', ...listed]);
    // Ничего не выбрано: условие, которое никогда не выполняется
    if (!parts.length) return ['==', 'class', '\u0000none'];
    return parts.length === 1 ? parts[0] : ['any', ...parts];
  }

  /** ["all", <фильтр слоя>, <условие>] — старый синтаксис фильтров, как в самом стиле. */
  const combineFilter = (layerFilter, condition) => (layerFilter == null ? condition : ['all', layerFilter, condition]);

  function applyPoiFilter(style, pref) {
    const condition = poiCondition(parsePoi(pref));
    if (!condition) return style;
    style.layers.forEach(layer => {
      if (POI_LAYERS.has(layer.id)) layer.filter = combineFilter(layer.filter, clone(condition));
    });
    return style;
  }

  // ─── Рельеф (MapFragment.applyReliefPrefs) ───
  const DEFAULT_RELIEF = { on: true, slope: true, contours: true, strength: 10 };

  function normalizeRelief(r) {
    r = isObj(r) ? r : {};
    const strength = Number.isFinite(Number(r.strength)) ? Math.max(0, Math.min(15, Math.round(Number(r.strength)))) : 10;
    return {
      on: r.on !== false,
      slope: r.slope !== false,
      contours: r.contours !== false,
      strength,
    };
  }

  /** Умножает значения paint (число, {stops} или interpolate/step), с потолком. */
  function scalePaint(v, k, max) {
    if (typeof v === 'number') return Math.max(0, Math.min(max, v * k));
    if (isObj(v) && Array.isArray(v.stops)) {
      return Object.assign(clone(v), { stops: v.stops.map(st => [st[0], scalePaint(st[1], k, max)]) });
    }
    if (Array.isArray(v)) {
      const first = v[0] === 'interpolate' ? 4 : v[0] === 'step' ? 2 : -1;
      if (first < 0) return v;
      return v.map((item, i) => (i >= first && (i - first) % 2 === 0 ? scalePaint(item, k, max) : item));
    }
    return v;
  }

  function applyRelief(style, relief) {
    const r = normalizeRelief(relief);
    if (!r.on) { delete style.sources.dem; delete style.sources.slope; }
    if (!r.slope) delete style.sources.slope;
    const k = r.strength / 10;
    const contoursOn = r.on && r.contours;
    style.layers = style.layers.filter(l => contoursOn || !String(l.id || '').startsWith('topo_contour'));
    if (k !== 1) {
      style.layers.forEach(l => {
        if (!isObj(l.paint)) return;
        if (l.source === 'dem') l.paint['hillshade-exaggeration'] = scalePaint(l.paint['hillshade-exaggeration'] ?? 0.5, k, 1);
        else if (l.source === 'slope') l.paint['raster-opacity'] = scalePaint(l.paint['raster-opacity'] ?? 1, k, 1);
      });
    }
    return style;
  }

  /** Слой темы для данных, которых у карты нет (нет файла рельефа), сломал бы весь стиль: убрать. */
  function dropLayersWithoutSource(style) {
    style.layers = style.layers.filter(l => !l.source || Object.prototype.hasOwnProperty.call(style.sources, l.source));
    return style;
  }

  // ─── Здания (Map3d.applyBuildings): на плоской карте Leaflet 3D нет — контуры домов на всех масштабах ───
  function applyBuildings(layers, on) {
    layers.forEach(l => {
      if (l['source-layer'] !== 'building') return;
      if (l.type === 'fill') delete l.maxzoom;
      if (l.type === 'fill-extrusion') {
        l.paint = isObj(l.paint) ? l.paint : {};
        l.paint['fill-extrusion-height'] = ['coalesce', ['get', 'render_height'], ['get', 'height'], 6];
        l.paint['fill-extrusion-base'] = ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0];
        l.layout = isObj(l.layout) ? l.layout : {};
        l.layout.visibility = on ? 'visible' : 'none';
      }
    });
    return layers;
  }

  // ─── Сборка стиля (MapFragment.buildVectorStyleJson) ───
  /**
   * template — текст style-liberty.json с {{TILES}}/{{BASE}}; map — запись tnmaps_local
   * ({id, modified, dem?, slope?}); base — «tnmap://localhost»; theme — JSON темы или null («Обычная»).
   */
  function buildStyle({ template, map, base, theme, relief, poi }) {
    const version = Number(map.modified) || 0;
    const style = JSON.parse(String(template)
      .split('{{TILES}}').join(`${base}/vector/${map.id}/{z}/{x}/{y}.pbf?v=${version}`)
      .split('{{BASE}}').join(`${base}/assets`));
    // Рельеф — спутники карты: без файлов этих источников просто нет
    [['dem', 8, 12], ['slope', 10, 13]].forEach(([kind, minDef, maxDef]) => {
      const info = map[kind];
      if (!info) return;
      const src = {
        type: kind === 'dem' ? 'raster-dem' : 'raster',
        tiles: [`${base}/extra/${map.id}.${kind}/{z}/{x}/{y}.png?v=${Number(info.modified) || 0}`],
        tileSize: 256,
        minzoom: Number.isFinite(info.minZoom) ? info.minZoom : minDef,
        maxzoom: Number.isFinite(info.maxZoom) ? info.maxZoom : maxDef,
      };
      if (kind === 'dem') src.encoding = 'terrarium';
      style.sources[kind] = src;
    });
    if (theme) style.layers = applyThemeLayers(style.layers, theme);
    applyRelief(style, relief);
    applyPoiFilter(style, poi);
    applyBuildings(style.layers, false);
    dropLayersWithoutSource(style);
    return style;
  }

  /** Значки, которые стиль ждёт от приложения (topo-<class>, штриховки болот). */
  function requiredAppImages(style) {
    const ids = new Set();
    JSON.stringify(style.layers).replace(/"(topo-[a-z_-]+)"/g, (_, id) => { ids.add(id); return _; });
    return [...ids];
  }

  // ─── 3D-вид (путь B): рельеф, здания, небо ───
  const EXAGGERATION_MIN = 1, EXAGGERATION_MAX = 2.5, EXAGGERATION_DEFAULT = 1.5;
  const MAX_PITCH = 85;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const normalizeExaggeration = v => (Number.isFinite(Number(v)) && v !== '' && v !== null
    ? clamp(Math.round(Number(v) * 10) / 10, EXAGGERATION_MIN, EXAGGERATION_MAX) : EXAGGERATION_DEFAULT);

  /**
   * Стиль 2D-карты → 3D: отдельный источник рельефа «terrain» (hillshade остаётся на «dem» — MapLibre не любит
   * один источник для обоих), 3D-здания (Map3d.applyBuildings, on), небо. Без файла DEM — без terrain.
   */
  function to3dStyle(style, map, base, exaggeration) {
    const s = clone(style);
    applyBuildings(s.layers, true);
    const info = map && map.dem;
    if (info) {
      s.sources.terrain = {
        type: 'raster-dem',
        tiles: [`${base}/extra/${map.id}.dem/{z}/{x}/{y}.png?v=${Number(info.modified) || 0}`],
        tileSize: 256,
        minzoom: Number.isFinite(info.minZoom) ? info.minZoom : 8,
        maxzoom: Number.isFinite(info.maxZoom) ? info.maxZoom : 12,
        encoding: 'terrarium',
      };
      s.terrain = { source: 'terrain', exaggeration: normalizeExaggeration(exaggeration) };
    } else {
      delete s.terrain;
    }
    // Небо у горизонта при сильном наклоне (MapLibre 4: свойство стиля sky); цвета — данные карты, не UI
    s.sky = {
      'sky-color': '#7fb2e6', 'sky-horizon-blend': 0.5,  // theme-check: data (цвет на карте)
      'horizon-color': '#dde9f3', 'horizon-fog-blend': 0.6,  // theme-check: data (цвет на карте)
      'fog-color': '#e8eef3', 'fog-ground-blend': 0.85,  // theme-check: data (цвет на карте)
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0],
    };
    return s;
  }

  /**
   * Колесо в 3D-виде. Правило (оно же в подсказке):
   * - Ctrl + колесо (так WebView присылает щипок тачпада) — масштаб;
   * - Shift + колесо — наклон (для обычной мыши);
   * - тачпад двумя пальцами: вверх-вниз — наклон, влево-вправо — поворот;
   * - колесо мыши — масштаб.
   * Тачпад от колеса отличается так: строки/страницы (deltaMode 1/2) — всегда колесо; есть горизонтальная
   * составляющая или мелкий/дробный шаг — тачпад. Решение держится весь жест (пауза < 250 мс), чтобы
   * масштаб и наклон не перемешивались посреди одного движения.
   */
  const GESTURE_HOLD_MS = 250;
  function looksLikeTouchpad(e) {
    if (e.deltaMode && e.deltaMode !== 0) return false;
    if (e.deltaX) return true;
    const dy = Math.abs(e.deltaY || 0);
    return dy > 0 && (dy < 30 || !Number.isInteger(e.deltaY));
  }

  function wheelGesture(e, state, now) {
    state = state || {};
    let kind;
    if (e.ctrlKey) kind = 'zoom';
    else if (e.shiftKey) kind = 'tilt';
    else if (state.kind && now - (state.at || 0) < GESTURE_HOLD_MS && state.kind !== 'zoom-pinch') kind = state.kind;
    else kind = looksLikeTouchpad(e) ? 'orbit' : 'zoom';
    state.kind = e.ctrlKey ? 'zoom-pinch' : kind;
    state.at = now;
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 300 : 1;
    const dx = (e.deltaX || 0) * unit, dy = (e.deltaY || 0) * unit;
    if (kind === 'zoom') {
      // Щипок шлёт мелкие шаги — чувствительнее; щелчок колеса (~100) — полшага масштаба
      const k = e.ctrlKey ? 0.01 : 0.005;
      return { kind, dZoom: clamp(-dy * k, -1, 1), dPitch: 0, dBearing: 0 };
    }
    if (kind === 'tilt') {
      // Shift в WebView часто превращает вертикальную прокрутку в горизонтальную — берём ту, что есть
      const d = dy || dx;
      return { kind, dZoom: 0, dPitch: clamp(d * 0.1, -10, 10), dBearing: 0 };
    }
    return { kind, dZoom: 0, dPitch: clamp(dy * 0.25, -10, 10), dBearing: clamp(dx * 0.25, -15, 15) };
  }

  const api = {
    applyThemeLayers, THEMES, DEFAULT_THEME, normalizeTheme,
    POI_GROUPS, POI_ALL, POI_LAYERS, parsePoi, formatPoi, poiSummary, poiCondition, combineFilter, applyPoiFilter,
    DEFAULT_RELIEF, normalizeRelief, scalePaint, applyRelief, dropLayersWithoutSource, applyBuildings,
    buildStyle, requiredAppImages,
    EXAGGERATION_MIN, EXAGGERATION_MAX, EXAGGERATION_DEFAULT, MAX_PITCH, normalizeExaggeration, to3dStyle,
    looksLikeTouchpad, wheelGesture, GESTURE_HOLD_MS,
  };
  root.TrophyNavMapsCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
