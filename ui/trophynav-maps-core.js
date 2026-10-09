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
    // 09.10: короткие названия, как в Android (Базовая / Яркая / Топо / Офф)
    { id: 'normal', title: 'Базовая' },
    { id: 'contrast', title: 'Яркая' },
    { id: 'topo', title: 'Топо' },
    // 09.10: как в Android (theme-offroad.json из racenav-android, стиль Генштаба: грунтовки по проходимости)
    { id: 'offroad', title: 'Офф' },
  ];
  /** Темы, в которых рисуются отмывка, крутизна и горизонтали. */
  const RELIEF_THEMES = new Set(['topo', 'offroad']);
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

  // ─── Обзорная карта России (Z0–Z8, та же схема + слой regions: полигоны субъектов, iso и name) ───
  const OVERVIEW_ID = 'russia-overview';
  const OVERVIEW_PREFIX = 'ov_';
  const OVERVIEW_SOURCE = 'overview';
  // Фон за пределами всех карт (за границей России, без обзорной — за краем области): не белый лист
  const NEUTRAL_BACKGROUND = 'rgb(214,211,204)';  // theme-check: data (цвет на карте)
  // ISO 3166-2 субъекта → id карты области в каталоге (mapbuild-overview/regions-iso.json)
  const REGION_ISO = {
    'RU-SPE': 'leningrad', 'RU-LEN': 'leningrad', 'RU-KR': 'karelia', 'RU-PSK': 'pskov', 'RU-NGR': 'novgorod',
    'RU-VLG': 'vologda', 'RU-ARK': 'arkhangelsk', 'RU-MUR': 'murmansk', 'RU-KGD': 'kaliningrad', 'RU-TVE': 'tver',
    'RU-MOW': 'moscow', 'RU-MOS': 'moscow', 'RU-YAR': 'yaroslavl', 'RU-SMO': 'smolensk', 'RU-KLU': 'kaluga',
    'RU-TUL': 'tula', 'RU-RYA': 'ryazan', 'RU-VLA': 'vladimir', 'RU-IVA': 'ivanovo', 'RU-KOS': 'kostroma',
    'RU-NIZ': 'nizhny', 'RU-KDA': 'krasnodar', 'RU-KO': 'komi', 'RU-NEN': 'nenets', 'RU-BEL': 'belgorod',
    'RU-BRY': 'bryansk', 'RU-VOR': 'voronezh', 'RU-KRS': 'kursk', 'RU-LIP': 'lipetsk', 'RU-ORL': 'oryol',
    'RU-TAM': 'tambov', 'RU-AD': 'adygea', 'RU-KL': 'kalmykia', 'RU-AST': 'astrakhan', 'RU-VGG': 'volgograd',
    'RU-ROS': 'rostov', 'UA-43': 'crimea', 'UA-40': 'crimea', 'RU-CR': 'crimea', 'RU-SEV': 'crimea',
    'RU-DA': 'dagestan', 'RU-IN': 'ingushetia', 'RU-KB': 'kbr', 'RU-KC': 'kchr', 'RU-SE': 'ossetia',
    'RU-CE': 'chechnya', 'RU-STA': 'stavropol', 'RU-BA': 'bashkortostan', 'RU-ME': 'mari', 'RU-MO': 'mordovia',
    'RU-TA': 'tatarstan', 'RU-UD': 'udmurtia', 'RU-CU': 'chuvashia', 'RU-PER': 'perm', 'RU-KIR': 'kirov',
    'RU-ORE': 'orenburg', 'RU-PNZ': 'penza', 'RU-SAM': 'samara', 'RU-SAR': 'saratov', 'RU-ULY': 'ulyanovsk',
    'RU-KGN': 'kurgan', 'RU-SVE': 'sverdlovsk', 'RU-TYU': 'tyumen', 'RU-KHM': 'khmao', 'RU-YAN': 'yanao',
    'RU-CHE': 'chelyabinsk', 'RU-AL': 'altai_rep', 'RU-TY': 'tuva', 'RU-KK': 'khakassia', 'RU-ALT': 'altai_krai',
    'RU-KYA': 'krasnoyarsk', 'RU-IRK': 'irkutsk', 'RU-KEM': 'kemerovo', 'RU-NVS': 'novosibirsk', 'RU-OMS': 'omsk',
    'RU-TOM': 'tomsk', 'RU-BU': 'buryatia', 'RU-SA': 'yakutia', 'RU-ZAB': 'zabaykalsky', 'RU-KAM': 'kamchatka',
    'RU-PRI': 'primorye', 'RU-KHA': 'khabarovsk', 'RU-AMU': 'amur', 'RU-MAG': 'magadan', 'RU-SAK': 'sakhalin',
    'RU-YEV': 'jewish', 'RU-CHU': 'chukotka',
  };
  const regionOfIso = iso => (iso && Object.prototype.hasOwnProperty.call(REGION_ISO, iso) ? REGION_ISO[iso] : null);
  const isosOfRegion = id => Object.keys(REGION_ISO).filter(iso => REGION_ISO[iso] === id);

  /** Заливка суши России (полигоны regions) цветом фона темы: за границей остаётся нейтральный фон. */
  const landLayer = (source, color) => ({
    id: `${OVERVIEW_PREFIX}land`, type: 'fill', source, 'source-layer': 'regions',
    paint: { 'fill-color': clone(color), 'fill-antialias': false },
  });

  /**
   * Обзорная карта под картой области: источник «overview» (maxzoom файла, дальше — overzoom), копии слоёв
   * области (уже с темой, значками и рельефом) с префиксом ov_ сразу над фоном, затем «маска» — полигон
   * своей области цветом суши. Маска закрывает обзорную внутри области (подписи и обобщённые дороги/леса не
   * дублируют подробные), за её краем обзорная видна на любом масштабе. Фон стиля — нейтральный.
   */
  function addOverview(style, { tiles, minzoom, maxzoom, regionId, regionMinZoom }) {
    const bgAt = style.layers.findIndex(l => l.type === 'background');
    const bg = bgAt >= 0 ? style.layers[bgAt] : null;
    const landColor = bg?.paint?.['background-color'] ?? 'rgb(239,239,239)';  // theme-check: data (цвет на карте)
    const copies = style.layers
      .filter(l => l.source === 'openmaptiles' && l.type !== 'fill-extrusion')
      .map(l => Object.assign(clone(l), { id: OVERVIEW_PREFIX + l.id, source: OVERVIEW_SOURCE }));
    const isos = isosOfRegion(regionId);
    const added = [landLayer(OVERVIEW_SOURCE, landColor), ...copies];
    if (isos.length) {
      const mask = {
        id: `${OVERVIEW_PREFIX}mask`, type: 'fill', source: OVERVIEW_SOURCE, 'source-layer': 'regions',
        filter: ['in', 'iso', ...isos],
        paint: { 'fill-color': clone(landColor), 'fill-antialias': false },
      };
      if (Number.isFinite(regionMinZoom) && regionMinZoom > 0) mask.minzoom = regionMinZoom;
      added.push(mask);
    }
    style.layers.splice(bgAt + 1, 0, ...added);
    if (bg) { bg.paint = isObj(bg.paint) ? bg.paint : {}; bg.paint['background-color'] = NEUTRAL_BACKGROUND; }
    style.sources[OVERVIEW_SOURCE] = {
      type: 'vector', tiles: [tiles],
      minzoom: Number.isFinite(minzoom) ? minzoom : 0,
      maxzoom: Number.isFinite(maxzoom) ? maxzoom : 8,
      attribution: '© OpenMapTiles © OpenStreetMap contributors',
    };
    return style;
  }

  /** Сама обзорная карта основой: суша России — цветом фона темы, вокруг — нейтральный фон. */
  function decorateOverviewMain(style) {
    const bgAt = style.layers.findIndex(l => l.type === 'background');
    if (bgAt < 0) return style;
    const bg = style.layers[bgAt];
    const landColor = bg.paint?.['background-color'] ?? 'rgb(239,239,239)';  // theme-check: data (цвет на карте)
    style.layers.splice(bgAt + 1, 0, landLayer('openmaptiles', landColor));
    bg.paint = Object.assign({}, bg.paint, { 'background-color': NEUTRAL_BACKGROUND });
    return style;
  }

  // ─── Область под точкой по полигонам regions (GeoJSON из querySourceFeatures) ───
  function inRing(ring, x, y) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const polygonsOf = g => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
  /** Чёт-нечет по всем кольцам: дырка (анклав) — не внутри. */
  function pointInGeometry(geometry, lng, lat) {
    return polygonsOf(geometry).some(rings => rings.reduce((n, ring) => n + (inRing(ring, lng, lat) ? 1 : 0), 0) % 2 === 1);
  }
  /** Расстояние до границы в градусах широты (долгота сжата на cos широты). */
  function distanceToGeometry(geometry, lng, lat) {
    const k = Math.cos(lat * Math.PI / 180);
    let best = Infinity;
    polygonsOf(geometry).forEach(rings => rings.forEach(ring => {
      for (let i = 1; i < ring.length; i++) {
        const ax = ring[i - 1][0] * k, ay = ring[i - 1][1], bx = ring[i][0] * k, by = ring[i][1];
        const px = lng * k, py = lat, dx = bx - ax, dy = by - ay;
        const len = dx * dx + dy * dy;
        const t = len ? clampUnit(((px - ax) * dx + (py - ay) * dy) / len) : 0;
        best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
      }
    }));
    return best;
  }
  const clampUnit = v => Math.max(0, Math.min(1, v));
  const SEAM_TOLERANCE = 0.02;  // ≈ 2 км: на стыке и в щели между упрощёнными полигонами остаётся текущая
  /**
   * id области под точкой по полигонам слоя regions или null (полигонов под точкой нет — решает запасной
   * способ по bounds). На стыке побеждает prefer: точка в его полигоне или ближе SEAM_TOLERANCE к нему.
   */
  function regionFromFeatures(features, lng, lat, opts = {}) {
    const prefer = opts.prefer || null;
    const tolerance = Number.isFinite(opts.tolerance) ? opts.tolerance : SEAM_TOLERANCE;
    const hits = [];
    let preferNear = false;
    (features || []).forEach(f => {
      const id = regionOfIso(f?.properties?.iso);
      if (!id || !f.geometry) return;
      if (pointInGeometry(f.geometry, lng, lat)) { if (!hits.includes(id)) hits.push(id); }
      else if (id === prefer && !preferNear && tolerance > 0) preferNear = distanceToGeometry(f.geometry, lng, lat) <= tolerance;
    });
    if (prefer && (hits.includes(prefer) || preferNear)) return prefer;
    return hits[0] || null;
  }

  // ─── Сборка стиля (MapFragment.buildVectorStyleJson) ───
  /**
   * template — текст style-liberty.json с {{TILES}}/{{BASE}}; map — запись tnmaps_local
   * ({id, modified, dem?, slope?}); base — «tnmap://localhost»; theme — JSON темы или null («Обычная»);
   * overview — запись tnmaps_local обзорной карты или null (тогда стиль как раньше).
   */
  function buildStyle({ template, map, base, theme, relief, poi, overview }) {
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
    if (map.id === OVERVIEW_ID) decorateOverviewMain(style);
    else if (overview && overview.id && !overview.error) {
      addOverview(style, {
        tiles: `${base}/vector/${overview.id}/{z}/{x}/{y}.pbf?v=${Number(overview.modified) || 0}`,
        minzoom: overview.minZoom, maxzoom: overview.maxZoom, regionId: map.id, regionMinZoom: map.minZoom,
      });
    }
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
   * Колесо в 3D-виде. Правило (оно же в подсказке).
   * Наклон зафиксирован (opts.locked, по умолчанию в 3D-виде): колесо и два пальца — масштаб вокруг курсора,
   * Ctrl + колесо (щипок) — масштаб, Shift — наклон (явное действие); наклон и поворот жестами не меняются.
   * Наклон не зафиксирован:
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

  // Щипок в WebView2/Chromium: deltaY ≈ −100·ln(scale) — масштаб log2(scale) = −deltaY / (100·ln 2)
  const PINCH_ZOOM_PER_PX = 1 / (100 * Math.LN2);
  function wheelGesture(e, state, now, opts = {}) {
    state = state || {};
    let kind;
    if (e.ctrlKey) kind = 'zoom';
    else if (e.shiftKey) kind = 'tilt';
    else if (opts.locked) kind = 'zoom';
    else if (state.kind && now - (state.at || 0) < GESTURE_HOLD_MS && state.kind !== 'zoom-pinch') kind = state.kind;
    else kind = looksLikeTouchpad(e) ? 'orbit' : 'zoom';
    state.kind = e.ctrlKey ? 'zoom-pinch' : kind;
    state.at = now;
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 300 : 1;
    const dx = (e.deltaX || 0) * unit, dy = (e.deltaY || 0) * unit;
    if (kind === 'zoom') {
      // Щипок — по формуле Chromium; два пальца шлют мелкие шаги — чувствительнее; щелчок колеса (~100) — полшага
      const k = e.ctrlKey ? PINCH_ZOOM_PER_PX : looksLikeTouchpad(e) ? 0.01 : 0.005;
      return { kind, dZoom: clamp(-dy * k, -1, 1), dPitch: 0, dBearing: 0 };
    }
    if (kind === 'tilt') {
      // Shift в WebView часто превращает вертикальную прокрутку в горизонтальную — берём ту, что есть
      const d = dy || dx;
      return { kind, dZoom: 0, dPitch: clamp(d * 0.1, -10, 10), dBearing: 0 };
    }
    return { kind, dZoom: 0, dPitch: clamp(dy * 0.25, -10, 10), dBearing: clamp(dx * 0.25, -15, 15) };
  }

  // ─── Слой TrophyNav Maps поверх другой карты: смысловые группы слоёв стиля ───
  // Группа определяется по type + source-layer + классу в фильтре слоя, а не по его id: id темы может
  // быть любым, а источник данных и класс объекта — это и есть роль слоя. Слой, роль которого не
  // распознана, получает 'unknown' и в режиме «только дороги и подписи» не показывается (и тест падает).
  const STACK_GROUPS = ['background', 'landcover', 'landuse', 'water-fill', 'waterway', 'park', 'building',
    'building-3d', 'aeroway', 'road', 'road-area', 'road-label', 'place-label', 'water-label', 'peak', 'boundary',
    'poi', 'power', 'relief-hillshade', 'relief-contour', 'relief-slope'];
  /** Классы из фильтра слоя: ["==","class",x] и ["in","class",…] на любом уровне вложенности. */
  function filterClasses(filter, out = new Set()) {
    if (!Array.isArray(filter)) return out;
    const [op, key, ...rest] = filter;
    if ((op === '==' || op === 'in') && key === 'class') rest.forEach(v => out.add(String(v)));
    filter.forEach(part => { if (Array.isArray(part)) filterClasses(part, out); });
    return out;
  }
  // source-layer «outdoor» (данные TrophyNav: тропы, болота, горизонтали, природные подписи) — по классу
  const OUTDOOR_LINE_ROAD = new Set(['track', 'path', 'ford_way', 'winter_road', 'track_detected', 'boardwalk', 'bridge',
    'cutline', 'abandoned_railway', 'narrow_gauge']);
  const OUTDOOR_COVER = new Set(['wetland', 'scrub', 'clearcut', 'peat', 'quarry', 'dam_area']);
  const OUTDOOR_WATER = new Set(['ditch', 'dam']);
  const OUTDOOR_TERRAIN = new Set(['ravine', 'cliff', 'earth_bank']);
  const OUTDOOR_WATER_LABEL = new Set(['bay_label', 'lake_label', 'waterway_label', 'rapids_label', 'sea_label']);
  const OUTDOOR_PLACE_LABEL = new Set(['island_label', 'cape_label', 'ridge_label', 'valley_label', 'pass_label',
    'valley_point', 'range_label', 'forest_label', 'wetland_label', 'locality']);
  const OUTDOOR_POI = new Set(['survey_point', 'ranger', 'fire_water', 'bridge_point', 'spring', 'water', 'shelter',
    'hunting_stand', 'viewpoint', 'camp_site', 'picnic', 'tower']);
  const OUTDOOR_RELIEF = new Set(['contour', 'cliff', 'embankment']);
  const OUTDOOR_POWER = new Set(['power', 'power_minor', 'power_tower', 'power_pole']);

  function classifyOutdoor(layer) {
    const classes = [...filterClasses(layer.filter)];
    if (!classes.length) return 'unknown';
    const all = set => classes.every(c => set.has(c));
    const some = set => classes.some(c => set.has(c));
    if (all(OUTDOOR_RELIEF)) return 'relief-contour';
    // 09.10: овраги, обрывы и бровки из стиля Android (tn_ravine, tn_cliff) — рельеф; их названия — подписи
    if (all(OUTDOOR_TERRAIN)) return layer.type === 'symbol' ? 'place-label' : 'relief-contour';
    if (all(OUTDOOR_POWER)) return 'power';
    if (layer.type === 'symbol') {
      if (all(OUTDOOR_WATER_LABEL)) return 'water-label';
      if (all(OUTDOOR_PLACE_LABEL)) return 'place-label';
      if (classes.includes('peak_gn')) return 'peak';
      if (some(OUTDOOR_POI)) return 'poi';
      if (some(OUTDOOR_LINE_ROAD)) return 'road-label';   // подписи зимников, мостов, узкоколеек
      return 'unknown';
    }
    if (layer.type === 'fill') return all(OUTDOOR_COVER) ? 'landcover' : 'unknown';
    if (layer.type === 'line') {
      if (some(OUTDOOR_LINE_ROAD)) return 'road';
      if (all(OUTDOOR_COVER)) return 'landcover';   // контуры болот, вырубок
      if (all(OUTDOOR_WATER)) return 'waterway';
    }
    return 'unknown';
  }

  function classifyLayer(layer) {
    if (!isObj(layer)) return 'unknown';
    const type = layer.type, sl = layer['source-layer'];
    if (type === 'background') return 'background';
    if (type === 'hillshade') return 'relief-hillshade';
    if (type === 'raster') return layer.source === 'slope' ? 'relief-slope' : 'unknown';
    switch (sl) {
      case 'landcover': return 'landcover';
      case 'landuse': return 'landuse';
      case 'park': return 'park';
      case 'water': return type === 'fill' ? 'water-fill' : 'unknown';
      case 'waterway': return type === 'symbol' ? 'water-label' : 'waterway';
      case 'water_name': return 'water-label';
      case 'aeroway': return 'aeroway';
      case 'transportation': return type === 'fill' ? 'road-area' : 'road';
      case 'transportation_name': return 'road-label';
      case 'building': return type === 'fill-extrusion' ? 'building-3d' : 'building';
      case 'boundary': return 'boundary';
      case 'poi': return 'poi';
      case 'mountain_peak': return 'peak';
      case 'place': return 'place-label';
      case 'outdoor': return classifyOutdoor(layer);
      default: return 'unknown';
    }
  }

  const ROADS_LABELS_GROUPS = new Set(['road', 'road-label', 'place-label', 'water-label', 'boundary', 'peak']);
  /**
   * Стиль для режима «только дороги и подписи»: дороги с обводками, мосты, тропы, ж/д, границы и подписи;
   * фон, заливки, вода, здания и рельеф убраны — нижняя карта (спутник) видна. Значки POI — по opts.poi.
   * Каждому слою проставляется metadata['tn:group']. Неиспользуемые источники рельефа снимаются.
   */
  function roadsLabelsStyle(style, opts = {}) {
    const s = clone(style);
    const keep = new Set(ROADS_LABELS_GROUPS);
    if (opts.poi) keep.add('poi');
    s.layers = s.layers.filter(l => {
      const group = classifyLayer(l);
      l.metadata = Object.assign({}, isObj(l.metadata) ? l.metadata : {}, { 'tn:group': group });
      return keep.has(group);
    });
    const used = new Set(s.layers.map(l => l.source).filter(Boolean));
    Object.keys(s.sources || {}).forEach(k => { if (!used.has(k)) delete s.sources[k]; });
    delete s.terrain;
    return s;
  }

  const api = {
    STACK_GROUPS, filterClasses, classifyLayer, roadsLabelsStyle, ROADS_LABELS_GROUPS,
    applyThemeLayers, THEMES, RELIEF_THEMES, DEFAULT_THEME, normalizeTheme,
    POI_GROUPS, POI_ALL, POI_LAYERS, parsePoi, formatPoi, poiSummary, poiCondition, combineFilter, applyPoiFilter,
    DEFAULT_RELIEF, normalizeRelief, scalePaint, applyRelief, dropLayersWithoutSource, applyBuildings,
    buildStyle, requiredAppImages,
    OVERVIEW_ID, OVERVIEW_PREFIX, OVERVIEW_SOURCE, NEUTRAL_BACKGROUND, REGION_ISO, regionOfIso, isosOfRegion,
    addOverview, pointInGeometry, distanceToGeometry, regionFromFeatures, SEAM_TOLERANCE,
    EXAGGERATION_MIN, EXAGGERATION_MAX, EXAGGERATION_DEFAULT, MAX_PITCH, normalizeExaggeration, to3dStyle,
    looksLikeTouchpad, wheelGesture, GESTURE_HOLD_MS,
  };
  root.TrophyNavMapsCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
