// Trophy Navigator Desktop — нижняя полоса виджетов, как нижняя панель Android.
// Карточки «крупное значение + подпись», одинаковой ширины, скругление, цвета темы.
// Настраивается в «Настройки → Виджеты»: 5 мест, у каждого свой виджет или «пусто», порядок
// перетаскиванием (или стрелками), прозрачность полосы, «По умолчанию». Конфиг — localStorage
// «tnd-widgets-config» (версия схемы), старый ключ «tnd-widgets-hidden» учитывается.
// Значения считаются из того, что уже есть в приложении (без GPS и без новых сетевых запросов):
// карта Leaflet (зум, центр, курсор), выбранный/активный трек и маршрут, выбранная точка,
// часы; высота под курсором — рельеф активной карты TrophyNav Maps (<id>.dem.mbtiles, terrarium)
// через тот же протокол tnmap://, что и у 3D; солнце — формулы NOAA локально.
(function () {
  'use strict';
  const LS_KEY = 'tnd-widgets-config';
  const LS_OLD = 'tnd-widgets-hidden';
  const SCHEMA = 1;
  const SLOTS = 5;
  const DEFAULT_SLOTS = ['elevAuto', 'zoom', 'trackLen', 'routeLen', 'time'];
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } };
  const icon = (name, cls) => (typeof window.tnIcon === 'function' ? window.tnIcon(name, cls) : '');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DASH = '—';

  // ─── Расчёты (чистые функции, проверяются тестами) ───
  const RAD = Math.PI / 180;
  const R_EARTH = 6371000; // как L.LatLng.distanceTo — те же метры, что trackLen()/routeLen()

  function haversine(a, b) {
    const dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  /** Начальный азимут a → b, градусы 0..360 (как calcBearing в index.html). */
  function bearing(a, b) {
    const dLng = (b.lng - a.lng) * RAD;
    const y = Math.sin(dLng) * Math.cos(b.lat * RAD);
    const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos(dLng);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }
  function polylineMeters(points) {
    let d = 0;
    for (let i = 1; i < (points?.length || 0); i++) d += haversine(points[i - 1], points[i]);
    return d;
  }

  const ELE_STEP = 2; // м: набор/сброс копятся, когда высота ушла от опорной на 2 м и больше (шум GPS)
  /**
   * Статистика трека: points — [{lat,lng}], pointsData — [{time?, ele?, speed?}] (как у треков приложения).
   * Без времени duration/avg/max = null, без высоты up/down = null.
   */
  function trackStats(points, pointsData) {
    const pts = points || [], pd = pointsData || [];
    const meters = polylineMeters(pts);
    const timeAt = i => { const t = pd[i]?.time ? Date.parse(pd[i].time) : NaN; return Number.isFinite(t) ? t : null; };
    let first = null, last = null;
    for (let i = 0; i < pts.length; i++) { const t = timeAt(i); if (t != null) { if (first == null) first = t; last = t; } }
    const durationMs = first != null && last > first ? last - first : null;
    let maxMs = null;
    if (durationMs) {
      // с первой точки: записанная скорость есть и у неё (ревью 2578); по отрезку — только с i ≥ 1
      for (let i = 0; i < pts.length; i++) {
        let v = pd[i]?.speed == null ? NaN : Number(pd[i].speed);
        if (!Number.isFinite(v) && i > 0) {
          const t0 = timeAt(i - 1), t1 = timeAt(i);
          v = t0 != null && t1 != null && t1 > t0 ? haversine(pts[i - 1], pts[i]) / ((t1 - t0) / 1000) : NaN;
        }
        if (Number.isFinite(v) && (maxMs == null || v > maxMs)) maxMs = v;
      }
    }
    let up = null, down = null, ref = null;
    for (let i = 0; i < pts.length; i++) {
      if (pd[i]?.ele == null) continue;
      const e = Number(pd[i].ele);
      if (!Number.isFinite(e)) continue;
      if (ref == null) { ref = e; up = 0; down = 0; continue; }
      const diff = e - ref;
      if (diff >= ELE_STEP) { up += diff; ref = e; } else if (diff <= -ELE_STEP) { down -= diff; ref = e; }
    }
    return {
      km: meters / 1000,
      durationMs,
      avgKmh: durationMs ? (meters / 1000) / (durationMs / 3600000) : null,
      maxKmh: maxMs != null ? maxMs * 3.6 : null,
      up, down,
    };
  }

  // Солнце: восход/закат (центр диска на −0.833° с рефракцией) — формулы NOAA (Solar Calculator),
  // положение Солнца пересчитывается на момент самого события (2 уточнения), точность ≈ 1 мин
  const DAY_MS = 86400000;
  function sunAt(ms) {
    const jc = (ms / DAY_MS + 2440587.5 - 2451545) / 36525;
    const l0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
    const m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
    const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
    const c = Math.sin(m * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
      + Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * jc) + Math.sin(3 * m * RAD) * 0.000289;
    const omega = (125.04 - 1934.136 * jc) * RAD;
    const app = l0 + c - 0.00569 - 0.00478 * Math.sin(omega);
    const obliq = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(omega);
    const dec = Math.asin(Math.sin(obliq * RAD) * Math.sin(app * RAD));
    const y = Math.tan(obliq * RAD / 2) ** 2;
    const L = l0 * RAD, M = m * RAD;
    const eqMin = 4 / RAD * (y * Math.sin(2 * L) - 2 * e * Math.sin(M) + 4 * e * y * Math.sin(M) * Math.cos(2 * L)
      - 0.5 * y * y * Math.sin(4 * L) - 1.25 * e * e * Math.sin(2 * M));
    return { dec, eqMin };
  }
  /** {rise, set} (мс UTC) солнечных суток места (дата по местному среднему времени); polar — полярный день/ночь. */
  function sunTimes(date, lat, lng) {
    const day0 = Math.floor(+date / DAY_MS + lng / 360) * DAY_MS; // полночь UTC этой календарной даты
    const event = sign => {
      let t = day0 + (720 - 4 * lng) * 60000;
      for (let k = 0; k < 3; k++) {
        const { dec, eqMin } = sunAt(t);
        const cosH = Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(dec)) - Math.tan(lat * RAD) * Math.tan(dec);
        if (cosH > 1) return 'night';
        if (cosH < -1) return 'day';
        t = day0 + (720 - 4 * lng - eqMin + sign * 4 * Math.acos(cosH) / RAD) * 60000;
      }
      return t;
    };
    const rise = event(-1), set = event(1);
    const polar = typeof rise === 'string' ? rise : typeof set === 'string' ? set : null;
    return { rise: typeof rise === 'number' ? rise : null, set: typeof set === 'number' ? set : null, polar };
  }
  /** Ближайший после now восход ('rise') или закат ('set'), мс UTC; null — в ближайшие двое суток нет. */
  function nextSunEvent(kind, now, lat, lng) {
    for (let k = 0; k <= 2; k++) {
      const t = sunTimes(new Date(+now + k * DAY_MS), lat, lng)[kind];
      if (t != null && t > +now) return t;
    }
    return null;
  }

  // Рельеф: terrarium PNG (высота = R·256 + G + B/256 − 32768)
  const terrariumElev = (r, g, b) => r * 256 + g + b / 256 - 32768;
  /** Тайл и дробное положение в нём (0..1) для точки на зуме z (Web Mercator, XYZ). */
  function tileXY(lat, lng, z) {
    const n = 2 ** z;
    const fx = (lng + 180) / 360 * n;
    const s = Math.sin(Math.max(-85.05112878, Math.min(85.05112878, lat)) * RAD);
    const fy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    const x = Math.min(n - 1, Math.max(0, Math.floor(fx))), y = Math.min(n - 1, Math.max(0, Math.floor(fy)));
    return { x, y, u: fx - x, v: fy - y };
  }
  /** Высота из декодированного тайла {width, height, data: RGBA} в точке (u, v). */
  function elevFromImage(img, u, v) {
    const px = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)));
    const py = Math.min(img.height - 1, Math.max(0, Math.floor(v * img.height)));
    const i = (py * img.width + px) * 4;
    if (img.data[i + 3] === 0) return null; // прозрачный пиксель — нет данных
    return terrariumElev(img.data[i], img.data[i + 1], img.data[i + 2]);
  }

  // ─── Форматирование ───
  const fixed = (v, d) => v.toFixed(d);
  function fmtDist(m) {
    if (m < 1000) return `${Math.round(m)} м`;
    return m < 10000 ? `${fixed(m / 1000, 2)} км` : `${fixed(m / 1000, 1)} км`;
  }
  function fmtDuration(ms) {
    const min = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h} ч ${m} мин` : `${m} мин`;
  }
  const hhmm = ms => new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  /** Координаты в формате настроек приложения: dm (как строка состояния), dms, dd. */
  function formatCoord(lat, lng, fmt) {
    const part = (v, pos, neg) => {
      const a = Math.abs(v), deg = Math.floor(a), h = v >= 0 ? pos : neg;
      if (fmt === 'dms') {
        let mm = Math.floor((a - deg) * 60), ss = ((a - deg) * 60 - mm) * 60;
        if (ss >= 59.95) { ss = 0; mm += 1; }
        return `${deg}°${String(mm).padStart(2, '0')}'${ss.toFixed(1).padStart(4, '0')}"${h}`;
      }
      return `${deg}°${((a - deg) * 60).toFixed(3)}'${h}`;
    };
    if (fmt === 'dd') return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    return `${part(lat, 'N', 'S')}  ${part(lng, 'E', 'W')}`;
  }

  // ─── Каталог ───
  // compute(ctx) → {value, caption?}; ctx — см. gather(). Подпись по умолчанию — caption виджета.
  const trackOf = ctx => (ctx.track ? (ctx._ts ||= trackStats(ctx.track.points, ctx.track.pointsData)) : null);
  function wpWidget(ctx) {
    if (!ctx.wp) return { value: DASH, caption: 'до WP: выберите точку' };
    const name = ctx.wp.name || 'WP';
    if (!ctx.cursor) return { value: DASH, caption: `от ${name} до курсора` };
    const d = haversine(ctx.wp, ctx.cursor), az = Math.round(bearing(ctx.wp, ctx.cursor)) % 360;
    return { value: `${fmtDist(d)} · ${az}°`, caption: `от ${name} до курсора` };
  }
  function elevWidget(ctx) {
    if (!ctx.relief) return { value: DASH, caption: 'высота: нет рельефа' };
    const e = ctx.elev;
    return { value: e && Number.isFinite(e.value) ? String(Math.round(e.value)) : DASH, caption: 'м высота' };
  }
  function sunWidget(ctx, kind) {
    const label = kind === 'set' ? 'до заката' : 'до рассвета';
    const c = ctx.center;
    if (!c) return { value: DASH, caption: label };
    const t = nextSunEvent(kind, ctx.now, c.lat, c.lng);
    if (t == null) {
      const p = sunTimes(ctx.now, c.lat, c.lng).polar;
      return { value: DASH, caption: p === 'day' ? 'полярный день' : p === 'night' ? 'полярная ночь' : label };
    }
    return { value: fmtDuration(t - ctx.now), caption: `${label} ${hhmm(t)}` };
  }
  const trackValue = (fn) => ctx => { const s = trackOf(ctx); const v = s ? fn(s) : null; return { value: v == null ? DASH : v }; };
  const CATALOG = {
    elevAuto: { group: 'Курсор', title: 'Высота под курсором (без рельефа — до WP)', caption: 'м высота', wide: true,
      compute: ctx => (ctx.relief ? elevWidget(ctx) : wpWidget(ctx)) },
    elev: { group: 'Курсор', title: 'Высота под курсором', caption: 'м высота', compute: elevWidget },
    wpDist: { group: 'Курсор', title: 'Расстояние и азимут от WP до курсора', caption: 'до WP', wide: true, compute: wpWidget },
    coords: { group: 'Курсор', title: 'Координаты курсора', caption: 'курсор', wide: true,
      compute: ctx => ({ value: ctx.cursor ? formatCoord(ctx.cursor.lat, ctx.cursor.lng, ctx.coordFormat) : DASH }) },
    zoom: { group: 'Карта и время', title: 'Масштаб (зум)', caption: 'масштаб',
      compute: ctx => ({ value: Number.isFinite(ctx.zoom) ? `Z${Math.round(ctx.zoom)}` : DASH }) },
    time: { group: 'Карта и время', title: 'Время', caption: 'время', compute: ctx => ({ value: hhmm(+ctx.now) }) },
    date: { group: 'Карта и время', title: 'Дата', caption: 'дата',
      compute: ctx => ({ value: new Date(+ctx.now).toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace(',', '') }) },
    sunset: { group: 'Карта и время', title: 'До заката (центр карты)', caption: 'до заката', compute: ctx => sunWidget(ctx, 'set') },
    sunrise: { group: 'Карта и время', title: 'До рассвета (центр карты)', caption: 'до рассвета', compute: ctx => sunWidget(ctx, 'rise') },
    trackLen: { group: 'Трек', title: 'Трек — длина', caption: 'км трек',
      compute: ctx => { const s = trackOf(ctx); return s ? { value: fixed(s.km, 1), caption: ctx.track.name ? `км · ${ctx.track.name}` : 'км трек' } : { value: DASH }; } },
    trackTime: { group: 'Трек', title: 'Трек — время в пути', caption: 'в пути', compute: trackValue(s => (s.durationMs ? fmtDuration(s.durationMs) : null)) },
    trackAvg: { group: 'Трек', title: 'Трек — средняя скорость', caption: 'км/ч ср.', compute: trackValue(s => (s.avgKmh != null ? fixed(s.avgKmh, 1) : null)) },
    trackMax: { group: 'Трек', title: 'Трек — максимальная скорость', caption: 'км/ч макс.', compute: trackValue(s => (s.maxKmh != null ? fixed(s.maxKmh, 1) : null)) },
    trackUp: { group: 'Трек', title: 'Трек — набор высоты', caption: 'м набор', compute: trackValue(s => (s.up != null ? String(Math.round(s.up)) : null)) },
    trackDown: { group: 'Трек', title: 'Трек — сброс высоты', caption: 'м сброс', compute: trackValue(s => (s.down != null ? String(Math.round(s.down)) : null)) },
    routeLen: { group: 'Маршрут', title: 'Маршрут — длина', caption: 'км маршрут',
      compute: ctx => (ctx.route
        ? { value: fixed(polylineMeters(ctx.route.points) / 1000, 1), caption: `км · ${ctx.route.points.length} WP` }
        : { value: DASH }) },
    routeWp: { group: 'Маршрут', title: 'Маршрут — число WP', caption: 'WP маршрут',
      compute: ctx => ({ value: ctx.route ? String(ctx.route.points.length) : DASH }) },
  };

  function compute(id, ctx) {
    const w = CATALOG[id];
    if (!w) return null;
    let out;
    try { out = w.compute(ctx) || {}; } catch { out = {}; }
    return { value: out.value ?? DASH, caption: out.caption || w.caption };
  }

  // ─── Конфиг ───
  const defaults = () => ({ v: SCHEMA, slots: DEFAULT_SLOTS.slice(), opacity: 0, hidden: false });
  function normalize(raw) {
    const c = defaults();
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.slots)) {
        c.slots = Array.from({ length: SLOTS }, (_, i) => (typeof raw.slots[i] === 'string' && CATALOG[raw.slots[i]] ? raw.slots[i] : ''));
      }
      const op = Math.round(Number(raw.opacity));
      if (Number.isFinite(op)) c.opacity = Math.min(100, Math.max(0, op));
      c.hidden = raw.hidden === true;
    }
    return c;
  }
  function loadConfig() {
    let raw = null;
    try { raw = JSON.parse(lsGet(LS_KEY) || 'null'); } catch { raw = null; }
    if (raw && typeof raw === 'object') return normalize(raw);
    const c = defaults();
    c.hidden = lsGet(LS_OLD) === '1'; // до 0.9.30 можно было только скрыть полосу целиком
    return c;
  }
  function saveConfig(c) {
    lsSet(LS_KEY, JSON.stringify({ v: SCHEMA, slots: c.slots, opacity: c.opacity, hidden: c.hidden }));
    lsSet(LS_OLD, c.hidden ? '1' : '0'); // откат на старую версию помнит скрытие
  }

  let cfg = loadConfig();

  // ─── Высота под курсором: тайлы рельефа активной карты TrophyNav Maps ───
  const elev = {
    tiles: new Map(), // ключ → {img|null} или {pending: true}
    limit: 24,
    timer: 0,
    want: null,
    io: {
      base() {
        const conv = window.__TAURI_INTERNALS__?.convertFileSrc;
        return typeof conv === 'function' ? conv('', 'tnmap').replace(/\/$/, '') : 'tnmap://localhost';
      },
      fetch: (...a) => window.fetch(...a),
      async decode(buf) {
        const blob = new Blob([buf], { type: 'image/png' });
        let src;
        if (typeof createImageBitmap === 'function') src = await createImageBitmap(blob);
        else {
          src = new Image();
          const url = URL.createObjectURL(blob);
          try { await new Promise((ok, fail) => { src.onload = ok; src.onerror = fail; src.src = url; }); } finally { URL.revokeObjectURL(url); }
        }
        const w = src.width, h = src.height;
        const cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
        const g2 = cv.getContext('2d', { willReadFrequently: true });
        g2.drawImage(src, 0, 0);
        return { width: w, height: h, data: g2.getImageData(0, 0, w, h).data };
      },
    },
    /** {id, dem} активной карты TrophyNav Maps с рельефом или null. */
    info() {
      const T = window.TrophyNavMaps;
      const id = T?.activeId?.();
      const local = id ? T.localEntry?.(id) : null;
      return local?.dem ? { id, dem: local.dem } : null;
    },
    where(info, ll) {
      const z = Number.isFinite(info.dem.maxZoom) ? info.dem.maxZoom : 12;
      const t = tileXY(ll.lat, ll.lng, z);
      return { ...t, z, key: `${info.id}/${Number(info.dem.modified) || 0}/${z}/${t.x}/${t.y}` };
    },
    /** Синхронно: {value} из кэша, {pending} пока тайл грузится, {value:null} — нет данных. */
    at(ll) {
      const info = ll && this.info();
      if (!info) return null;
      const w = this.where(info, ll);
      const tile = this.tiles.get(w.key);
      if (!tile || tile.pending) return { pending: true, value: null };
      return { value: tile.img ? elevFromImage(tile.img, w.u, w.v) : null };
    },
    /** Не чаще раза в 150 мс, последний запрос не теряется: догрузить тайл под курсором. */
    request(ll) {
      this.want = ll;
      if (this.timer) return;
      this.load(ll);
      this.timer = setTimeout(() => {
        this.timer = 0;
        if (this.want && this.want !== ll) this.request(this.want);
      }, 150);
    },
    async load(ll) {
      const info = ll && this.info();
      if (!info) return;
      const w = this.where(info, ll);
      if (this.tiles.has(w.key)) return;
      this.tiles.set(w.key, { pending: true });
      let img = null;
      try {
        const v = Number(info.dem.modified) || 0;
        const resp = await this.io.fetch(`${this.io.base()}/extra/${info.id}.dem/${w.z}/${w.x}/${w.y}.png?v=${v}`);
        // 204 — здесь у рельефа нет тайла (край области, ровная местность)
        if (resp.ok && resp.status !== 204) img = await this.io.decode(await resp.arrayBuffer());
      } catch { img = null; }
      this.tiles.delete(w.key);
      this.tiles.set(w.key, { img });
      while (this.tiles.size > this.limit) this.tiles.delete(this.tiles.keys().next().value);
      scheduleRefresh();
    },
  };

  // ─── Данные приложения → ctx ───
  // map, tracks, routes, waypoints, selected*Id, current* — глобальные let/const основного скрипта
  // index.html (не свойства window): читаются по имени через typeof, пока скрипт ещё не дошёл — undefined.
  /* global map, tracks, routes, waypoints, selectedTrackId, selectedRouteId, currentTrackDraw, currentTrackEdit, currentRouteDraw */
  const appMap = () => (typeof map !== 'undefined' ? map : null);
  let cursor = null;
  let selectedWp = null;
  const plain = ll => (ll && Number.isFinite(ll.lat) && Number.isFinite(ll.lng) ? { lat: ll.lat, lng: ll.lng } : null);

  function activeTrack() {
    try {
      if (typeof currentTrackDraw !== 'undefined' && currentTrackDraw) return currentTrackDraw;
      if (typeof currentTrackEdit !== 'undefined' && currentTrackEdit?.track) return currentTrackEdit.track;
      if (typeof tracks !== 'undefined' && typeof selectedTrackId !== 'undefined') return tracks.find(t => t.id === selectedTrackId) || null;
    } catch { /* до объявления */ }
    return null;
  }
  function activeRoute() {
    try {
      if (typeof currentRouteDraw !== 'undefined' && currentRouteDraw) return currentRouteDraw;
      if (typeof routes !== 'undefined' && typeof selectedRouteId !== 'undefined') return routes.find(r => r.id === selectedRouteId) || null;
    } catch { /* до объявления */ }
    return null;
  }
  function activeWp() {
    if (!selectedWp) return null;
    try {
      if (typeof waypoints !== 'undefined' && !waypoints.includes(selectedWp)) return null; // точку удалили
    } catch { return null; }
    const ll = plain(selectedWp.getLatLng?.() || selectedWp.wpData);
    return ll ? { ...ll, name: selectedWp.wpData?.name || '' } : null;
  }

  function gather() {
    const m = appMap();
    const trk = activeTrack(), rte = activeRoute();
    const relief = !!elev.info();
    return {
      now: new Date(),
      zoom: m?.getZoom?.(),
      center: plain(m?.getCenter?.()),
      cursor,
      track: trk ? { name: trk.name, points: trk.points || [], pointsData: trk.pointsData || [] } : null,
      route: rte ? { name: rte.name, points: rte.points || [] } : null,
      wp: activeWp(),
      coordFormat: document.getElementById('setting-coord-format')?.value || 'dm',
      relief,
      elev: relief ? elev.at(cursor) : null,
    };
  }

  // ─── Полоса ───
  let bar, toggle, last = {};

  function renderBar() {
    if (!bar) return;
    const ids = cfg.slots.filter(Boolean);
    bar.innerHTML = ids.map((id, i) => `
      <div class="tn-widget${CATALOG[id].wide ? ' wide' : ''}" data-widget="${id}" data-slot="${i}">
        <div class="tn-widget-value">${DASH}</div>
        <div class="tn-widget-caption">${esc(CATALOG[id].caption)}</div>
      </div>`).join('');
    bar.style.setProperty('--widget-fill', String((100 - cfg.opacity) / 100));
    bar.classList.toggle('tn-widgets-clear', cfg.opacity > 0);
    last = {};
    fitKey = '';
    scheduleFit(); // новые карточки — без minWidth от прежнего состава, подогнать заново
  }

  // ─── Подгонка: значение не обрезается (как на Android) ───
  // Единый размер шрифта значений для всей полосы: от FIT_MAX вниз шагом 1px до FIT_MIN, пока сумма
  // ширин значений (+ поля карточек и зазоры) не влезет в полосу без правого отступа под кнопку.
  // Не влезает и на минимуме — перенос на вторую строку (.tn-widgets-wrap). Ширины меряются в базовом
  // размере (пересчёт из текущего), так что выбор шага не зависит от себя самого и не дребезжит;
  // пересчёт — только при смене текстов значений или ширины полосы (ResizeObserver).
  const FIT_MAX = 18, FIT_MIN = 13, CAPTION_BASE = 10.5, CAPTION_MIN = 9;
  let fitKey = '', fitRaf = 0, fitFs = FIT_MAX;
  function textWidth(el) {
    if (typeof document.createRange !== 'function') return 0;
    const r = document.createRange();
    r.selectNodeContents(el);
    const w = typeof r.getBoundingClientRect === 'function' ? r.getBoundingClientRect().width : 0;
    return Number.isFinite(w) ? w : 0;
  }
  function fit() {
    fitRaf = 0;
    if (!bar || bar.hidden) return;
    const cardsEl = [...bar.querySelectorAll('.tn-widget')];
    const barCs = getComputedStyle(bar);
    const inner = bar.clientWidth - (parseFloat(barCs.paddingLeft) || 0) - (parseFloat(barCs.paddingRight) || 0);
    if (!cardsEl.length || !(inner > 0)) return;
    const gap = parseFloat(barCs.columnGap) || parseFloat(barCs.gap) || 0;
    // ширина значения при FIT_MAX, с запасом 1px на округление; поля карточки — отдельно
    const base = cardsEl.map(c => Math.ceil(textWidth(c.querySelector('.tn-widget-value')) * FIT_MAX / fitFs) + 1);
    const pads = cardsEl.map(c => { const cs = getComputedStyle(c); return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0); });
    const key = `${Math.round(inner)}|${base.join(',')}|${pads.join(',')}`;
    if (key === fitKey) return;
    fitKey = key;
    if (!base.some(Boolean)) return; // нет раскладки (jsdom, скрытое окно) — оставить CSS по умолчанию
    const room = inner - gap * (cardsEl.length - 1) - pads.reduce((a, b) => a + b, 0);
    const sum = base.reduce((a, b) => a + b, 0);
    let fs = FIT_MAX;
    while (fs > FIT_MIN && sum * fs / FIT_MAX > room) fs -= 1;
    fitFs = fs;
    const capFs = Math.max(CAPTION_MIN, Math.round(CAPTION_BASE * fs / FIT_MAX * 2) / 2);
    bar.style.setProperty('--tnw-value-fs', `${fs}px`);
    bar.style.setProperty('--tnw-caption-fs', `${capFs}px`);
    bar.classList.toggle('tn-widgets-wrap', sum * fs / FIT_MAX > room);
    cardsEl.forEach((c, i) => { c.style.minWidth = `${Math.ceil(base[i] * fs / FIT_MAX + pads[i])}px`; });
    // в две строки полоса выше — поднять над ней нижние кнопки Leaflet
    const wrapped = bar.classList.contains('tn-widgets-wrap');
    if (wrapped) document.body.style.setProperty('--tn-widgets-bottom', `${Math.ceil(bar.offsetHeight) + 4}px`);
    else document.body.style.removeProperty('--tn-widgets-bottom');
  }
  function scheduleFit() {
    if (fitRaf || !bar) return;
    fitRaf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fit) : setTimeout(fit, 16);
  }

  function refresh() {
    if (!bar || bar.hidden) return;
    const ctx = gather();
    let changed = false;
    bar.querySelectorAll('.tn-widget').forEach((card, i) => {
      const r = compute(card.dataset.widget, ctx);
      const key = `${r.value}\u0000${r.caption}`;
      if (last[i] === key) return;
      const valueEl = card.querySelector('.tn-widget-value');
      if (valueEl.textContent !== r.value) changed = true;
      last[i] = key;
      valueEl.textContent = r.value;
      card.querySelector('.tn-widget-caption').textContent = r.caption;
    });
    if (changed) scheduleFit();
  }
  let raf = 0;
  function scheduleRefresh() {
    if (raf) return;
    const run = () => { raf = 0; refresh(); };
    raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : setTimeout(run, 16);
  }

  function apply() {
    if (!bar) return;
    const hidden = cfg.hidden || !cfg.slots.some(Boolean);
    bar.hidden = hidden;
    document.body.classList.toggle('tn-widgets-on', !hidden);
    toggle.setAttribute('aria-pressed', String(!cfg.hidden));
    toggle.title = cfg.hidden ? 'Показать виджеты' : 'Скрыть виджеты';
    toggle.innerHTML = icon(cfg.hidden ? 'gauge' : 'close', 'tn-ico-xs');
    if (!hidden) { last = {}; refresh(); scheduleFit(); }
    window.dispatchEvent(new Event('resize'));
  }

  function setConfig(next) {
    cfg = normalize(next);
    saveConfig(cfg);
    renderBar();
    apply();
    renderSettings();
  }

  // ─── Настройки → Виджеты ───
  const OPTIONS_HTML = (() => {
    const groups = {};
    for (const [id, w] of Object.entries(CATALOG)) (groups[w.group] ||= []).push(`<option value="${id}">${esc(w.title)}</option>`);
    return '<option value="">Пусто</option>' + Object.entries(groups).map(([gname, opts]) => `<optgroup label="${esc(gname)}">${opts.join('')}</optgroup>`).join('');
  })();

  function moveSlot(from, to) {
    if (from === to || from < 0 || from >= SLOTS || to < 0 || to >= SLOTS) return;
    const slots = cfg.slots.slice();
    const [id] = slots.splice(from, 1);
    slots.splice(to, 0, id);
    setConfig({ ...cfg, slots });
  }

  function renderSettings() {
    const host = document.getElementById('tn-widgets-settings');
    if (!host) return;
    const focus = document.activeElement && host.contains(document.activeElement) ? document.activeElement.dataset.tnwFocus : null;
    host.innerHTML = `
      <div class="setting-group-title">${icon('gauge')} Нижние виджеты</div>
      <div class="setting-row">
        <label class="setting-label" for="tnw-shown">Показывать полосу виджетов</label>
        <div class="setting-control"><input type="checkbox" id="tnw-shown" data-tnw="shown" data-tnw-focus="shown"${cfg.hidden ? '' : ' checked'}></div>
      </div>
      <div class="tnw-slots" role="list" aria-label="Места виджетов слева направо">
        ${cfg.slots.map((id, i) => `
        <div class="setting-row tnw-slot" role="listitem" data-slot="${i}">
          <span class="tnw-handle" data-tnw-handle="${i}" title="Перетащите, чтобы поменять порядок">${icon('move', 'tn-ico-xs')}</span>
          <span class="setting-label">Место ${i + 1}</span>
          <div class="setting-control">
            <select data-tnw-slot="${i}" data-tnw-focus="slot${i}" aria-label="Виджет на месте ${i + 1}">${OPTIONS_HTML}</select>
            <button type="button" class="tn-icon-btn tn-icon-btn-s" data-tnw-move="${i}:-1" data-tnw-focus="up${i}" title="Левее (выше в списке)" aria-label="Место ${i + 1}: левее"${i === 0 ? ' disabled' : ''}>${icon('chevron-up')}</button>
            <button type="button" class="tn-icon-btn tn-icon-btn-s" data-tnw-move="${i}:1" data-tnw-focus="down${i}" title="Правее (ниже в списке)" aria-label="Место ${i + 1}: правее"${i === SLOTS - 1 ? ' disabled' : ''}>${icon('chevron-down')}</button>
          </div>
        </div>`).join('')}
      </div>
      <div class="setting-row">
        <label class="setting-label" for="tnw-opacity">Прозрачность полосы</label>
        <div class="setting-control">
          <input type="range" id="tnw-opacity" data-tnw="opacity" data-tnw-focus="opacity" min="0" max="100" step="5" value="${cfg.opacity}">
          <span class="setting-value" data-tnw="opacity-val">${cfg.opacity}%</span>
        </div>
      </div>
      <div class="setting-card-note tnw-note">Место 1 — слева. Высота под курсором — по рельефу активной карты TrophyNav Maps;
        без рельефа первый виджет по умолчанию показывает расстояние и азимут от выбранной точки (клик по WP) до курсора.
        Закат и рассвет — для центра карты. Изменения применяются сразу.</div>
      <button type="button" class="btn-secondary btn-sm tnw-reset" data-tnw="reset" data-tnw-focus="reset">${icon('refresh', 'tn-ico-t')}По умолчанию</button>`;
    host.querySelectorAll('select[data-tnw-slot]').forEach(sel => { sel.value = cfg.slots[+sel.dataset.tnwSlot]; });
    if (focus) host.querySelector(`[data-tnw-focus="${focus}"]`)?.focus();
  }

  function bindSettings(host) {
    if (host.dataset.tnwBound) return;
    host.dataset.tnwBound = '1';
    host.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.tnwSlot != null) {
        const slots = cfg.slots.slice();
        slots[+t.dataset.tnwSlot] = t.value;
        setConfig({ ...cfg, slots });
      } else if (t.dataset.tnw === 'shown') setConfig({ ...cfg, hidden: !t.checked });
      else if (t.dataset.tnw === 'opacity') setConfig({ ...cfg, opacity: +t.value });
    });
    host.addEventListener('input', e => {
      if (e.target.dataset.tnw !== 'opacity') return;
      // живой предпросмотр без перерисовки раздела (ползунок не теряет захват)
      cfg = normalize({ ...cfg, opacity: +e.target.value });
      saveConfig(cfg);
      host.querySelector('[data-tnw="opacity-val"]').textContent = `${cfg.opacity}%`;
      renderBar();
      refresh();
    });
    host.addEventListener('click', e => {
      const mv = e.target.closest('[data-tnw-move]');
      if (mv) {
        const [i, d] = mv.dataset.tnwMove.split(':').map(Number);
        moveSlot(i, i + d);
        // фокус едет за виджетом: на новом месте та же стрелка, если она доступна
        const k = i + d, btn = host.querySelector(`[data-tnw-focus="${d < 0 ? 'up' : 'down'}${k}"]`);
        (btn && !btn.disabled ? btn : host.querySelector(`[data-tnw-focus="slot${k}"]`))?.focus();
        return;
      }
      if (e.target.closest('[data-tnw="reset"]')) setConfig(defaults());
    });
    // Перетаскивание за ручку — на событиях указателя: HTML5 drag&drop в Tauri перехватывает приём файлов окном
    let drag = null;
    host.addEventListener('pointerdown', e => {
      const h = e.target.closest('[data-tnw-handle]');
      if (!h || e.button !== 0) return;
      e.preventDefault();
      drag = { from: +h.dataset.tnwHandle, to: +h.dataset.tnwHandle, id: e.pointerId };
      try { h.setPointerCapture?.(e.pointerId); } catch { /* указатель уже отпущен */ }
      h.closest('.tnw-slot').classList.add('tnw-dragging');
    });
    host.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const row = document.elementFromPoint?.(e.clientX, e.clientY)?.closest?.('.tnw-slot');
      if (!row || !host.contains(row)) return;
      drag.to = +row.dataset.slot;
      host.querySelectorAll('.tnw-slot').forEach(r => r.classList.toggle('tnw-drop', +r.dataset.slot === drag.to && drag.to !== drag.from));
    });
    const end = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const { from, to } = drag;
      drag = null;
      if (e.type === 'pointerup' && to !== from) moveSlot(from, to);
      else renderSettings();
    };
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
  }

  function injectCss() {
    if (document.getElementById('tn-widgets-css')) return;
    const st = document.createElement('style');
    st.id = 'tn-widgets-css';
    st.textContent = `
      .tnw-slot { gap: 8px; }
      .tnw-slot .setting-label { flex: 1 1 auto; white-space: nowrap; }
      .tnw-slot .setting-control select { width: 290px; max-width: 100%; }
      .tnw-handle { display: inline-flex; align-items: center; color: var(--text-muted); cursor: grab; touch-action: none; padding: 4px 0; }
      .tnw-dragging { outline: 2px solid var(--primary); outline-offset: -2px; }
      .tnw-dragging .tnw-handle { cursor: grabbing; }
      .tnw-drop { box-shadow: inset 0 3px 0 var(--primary); }
      .tnw-slot .tn-icon-btn:disabled { opacity: 0.35; cursor: default; }
      .tnw-note { margin: 4px 4px 10px; line-height: 1.4; }
      .tnw-reset { display: inline-flex; align-items: center; gap: 6px; }`;
    document.head.appendChild(st);
  }

  function init() {
    injectCss();
    const host = document.getElementById('tn-widgets-settings');
    if (host) { bindSettings(host); renderSettings(); }
    const mapEl = document.getElementById('map');
    if (!mapEl || document.getElementById('tn-widgets')) return;
    bar = document.createElement('div');
    bar.id = 'tn-widgets';
    bar.setAttribute('aria-label', 'Виджеты');
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'tn-widgets-toggle';
    toggle.addEventListener('click', e => { e.stopPropagation(); setConfig({ ...cfg, hidden: !cfg.hidden }); });
    // Полоса лежит внутри #map: клик, двойной клик, колесо и ПКМ по ней не должны доходить до карты
    // (иначе в режиме WP/трека/линейки/OSRM под полосой появляется точка). Как у кнопок Leaflet —
    // L.DomEvent.disableClickPropagation/disableScrollPropagation.
    for (const el of [bar, toggle]) {
      if (window.L?.DomEvent) {
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
      } else {
        ['mousedown', 'pointerdown', 'touchstart', 'click', 'dblclick', 'wheel'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));
      }
      el.addEventListener('contextmenu', e => e.stopPropagation());
    }
    mapEl.appendChild(bar);
    mapEl.appendChild(toggle);
    renderBar();
    apply();
    if (typeof ResizeObserver === 'function') new ResizeObserver(scheduleFit).observe(bar);
    else window.addEventListener('resize', scheduleFit);
    const m = appMap();
    if (m?.on) {
      m.on('mousemove', e => {
        cursor = plain(e.latlng);
        if (cfg.slots.some(id => id === 'elev' || id === 'elevAuto')) elev.request(cursor);
        scheduleRefresh();
      });
      m.on('zoomend moveend', scheduleRefresh);
    }
    setInterval(refresh, 1000);
  }

  window.TnWidgets = {
    CATALOG, DEFAULT_SLOTS, SLOTS, LS_KEY, SCHEMA,
    getConfig: () => normalize(cfg), setConfig, loadConfig, defaults, moveSlot,
    reset: () => setConfig(defaults()),
    /** Выбранная точка (клик по WP, окно свойств) — от неё считаются расстояние и азимут до курсора. */
    selectWp(marker) { selectedWp = marker || null; scheduleRefresh(); },
    compute, refresh, gather, renderSettings,
    util: { haversine, bearing, trackStats, sunTimes, nextSunEvent, terrariumElev, tileXY, elevFromImage, formatCoord, fmtDist, fmtDuration },
    _elev: elev,
    _setCursor(ll) { cursor = plain(ll); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
  else setTimeout(init, 0);
})();
