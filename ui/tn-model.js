/*
 * Каноническая модель данных вне движка карты (план MapLibre v3, контракт R1, этап 0б, пакет 0б.4).
 *
 * Точки (WP), треки и маршруты живут здесь как простые объекты со стабильными ID; рендер (Leaflet-адаптер,
 * затем MapLibre-адаптер) подписывается на события модели и сам держит свои объекты в renderIndex —
 * модель про рендер не знает. Экспорт, Race Report, collectState и sync читают только модель.
 *
 * Записи:
 *   WaypointRec { id, lat, lng, name, desc, icon, color, radius, num, setId, createdAt, updatedAt, … } — = wpData
 *   TrackRec    { id, rawId?, name, color, width, pointSize, visible, setId?, points: LatLng[], pointsData?: PointData[] } — pointsData по индексу точки, как есть (может быть короче)
 *   RouteRec    { id, name, color, width, dashArray, visible, points: LatLng[], labels[], pointRadii[], pointWaypointIds[] }
 *   PointData   { time?, ele?, speed?, course?, hdop?, …, seg?: 1 } — seg: начало куска трека (GPX trkseg, 0.9.34)
 * Координаты в модели — только {lat, lng} (не L.LatLng и не LngLat); невалидная точка на входе — ошибка,
 * null/NaN не превращаются в 0.
 *
 * События: { type: 'add' | 'update' | 'remove' | 'reorder' | 'reset', kind, ids, generation }. В batch()
 * изменения копятся и уходят одним событием на (type, kind) — рендер перерисовывает один раз.
 *
 * Чистый модуль без DOM и без Leaflet — tests/tn-model.test.mjs.
 */
(function (root) {
  'use strict';
  const Geo = () => root.TnGeo || (typeof require === 'function' ? require('./tn-geo.js') : null);
  const KINDS = ['wp', 'track', 'route'];
  const ID_PREFIX = { track: 'trk_', route: 'rte_' };

  /** Внешний id трека/маршрута приложения (число) ↔ id модели ('trk_3'). У WP id уже строковый ('wp-…'). */
  const entityId = (kind, rawId) => (kind === 'wp' ? String(rawId) : `${ID_PREFIX[kind]}${rawId}`);
  const rawIdOf = (kind, id) => {
    if (kind === 'wp') return id;
    const s = String(id).slice(ID_PREFIX[kind].length);
    return /^\d+$/.test(s) ? Number(s) : s;
  };

  /** {lat,lng} из чего угодно с полями lat/lng (L.LatLng, запись), с проверкой. */
  function plainLatLng(p, where) {
    // только числа: Number(null), Number('') и Number(undefined→NaN) не должны давать точку «0,0»
    const q = p && { lat: p.lat, lng: p.lng };
    if (!q || !Geo().isValidLatLng(q)) {
      throw new TypeError(`tn-model: невалидная точка${where ? ' в ' + where : ''}: ${JSON.stringify(p && { lat: p.lat, lng: p.lng })}`);
    }
    return q;
  }

  function normalize(kind, rec) {
    if (!rec || typeof rec !== 'object') throw new TypeError(`tn-model: пустая запись ${kind}`);
    if (kind === 'wp') {
      const p = plainLatLng(rec, `WP ${rec.id}`);
      if (!rec.id) throw new TypeError('tn-model: у WP нет id');
      return { ...rec, lat: p.lat, lng: p.lng };
    }
    const points = (rec.points || []).map((p, i) => plainLatLng(p, `${kind} ${rec.id} #${i}`));
    const out = { ...rec, points };
    // pointsData — как есть (длина и пустые места не меняются: collectState пишет массив дословно);
    // объекты копируются, чтобы модель не делила их с вызывающим
    if (kind === 'track' && Array.isArray(rec.pointsData)) out.pointsData = rec.pointsData.map(d => (d && typeof d === 'object' ? { ...d } : d));
    return out;
  }

  function create() {
    const stores = { wp: new Map(), track: new Map(), route: new Map() };
    const listeners = new Set();
    let generation = 0;
    let batchDepth = 0;
    let pending = [];

    function emit(type, kind, ids) {
      generation++;
      const ev = { type, kind, ids: [...ids], generation };
      if (batchDepth) { pending.push(ev); return; }
      for (const fn of [...listeners]) { try { fn(ev); } catch (e) { (root.console || console).warn('tn-model listener', e); } }
    }
    function flush() {
      const merged = new Map();
      for (const ev of pending) {
        const key = `${ev.type}:${ev.kind}`;
        const m = merged.get(key);
        if (m) { ev.ids.forEach(id => m.ids.includes(id) || m.ids.push(id)); m.generation = ev.generation; }
        else merged.set(key, { ...ev, ids: [...ev.ids] });
      }
      pending = [];
      for (const ev of merged.values()) for (const fn of [...listeners]) { try { fn(ev); } catch (e) { (root.console || console).warn('tn-model listener', e); } }
    }
    const check = kind => { if (!KINDS.includes(kind)) throw new TypeError(`tn-model: неизвестный вид ${kind}`); return stores[kind]; };

    const api = {
      KINDS,
      get generation() { return generation; },
      /** Добавить записи (id обязателен; повтор id — ошибка, чтобы не потерять данные молча). */
      add(kind, recs) {
        const st = check(kind); const list = Array.isArray(recs) ? recs : [recs]; const ids = [];
        const norm = list.map(r => normalize(kind, r));
        for (const r of norm) if (st.has(r.id)) throw new Error(`tn-model: ${kind} ${r.id} уже есть`);
        for (const r of norm) { st.set(r.id, r); ids.push(r.id); }
        if (ids.length) emit('add', kind, ids);
        return ids;
      },
      /** Изменить запись: patch — объект полей или функция (rec) => новый rec. */
      update(kind, id, patch) {
        const st = check(kind); const cur = st.get(id);
        if (!cur) throw new Error(`tn-model: ${kind} ${id} не найден`);
        const next = normalize(kind, typeof patch === 'function' ? patch({ ...cur }) : { ...cur, ...patch });
        if (next.id !== id) throw new Error('tn-model: id записи не меняется');
        st.set(id, next);
        emit('update', kind, [id]);
        return next;
      },
      remove(kind, ids) {
        const st = check(kind); const gone = (Array.isArray(ids) ? ids : [ids]).filter(id => st.delete(id));
        if (gone.length) emit('remove', kind, gone);
        return gone;
      },
      /** Новый порядок записей вида (ids — все id в нужном порядке; отсутствующие остаются в конце). */
      reorder(kind, ids) {
        const st = check(kind); const entries = new Map(st);
        st.clear();
        for (const id of ids) if (entries.has(id)) { st.set(id, entries.get(id)); entries.delete(id); }
        for (const [id, r] of entries) st.set(id, r);
        emit('reorder', kind, [...st.keys()]);
      },
      /** Полная замена вида (загрузка состояния). */
      reset(kind, recs = []) {
        const st = check(kind); const norm = recs.map(r => normalize(kind, r));
        st.clear(); for (const r of norm) st.set(r.id, r);
        emit('reset', kind, [...st.keys()]);
      },
      get(kind, id) { return check(kind).get(id) || null; },
      has(kind, id) { return check(kind).has(id); },
      list(kind) { return [...check(kind).values()]; },
      ids(kind) { return [...check(kind).keys()]; },
      /** Изменения внутри fn уходят одним событием на (тип, вид). */
      batch(fn) {
        batchDepth++;
        try { return fn(); } finally { if (--batchDepth === 0 && pending.length) flush(); }
      },
      /** Подписка; повторная подписка той же функции не умножает вызовы. Возвращает отписку. */
      on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    };
    return api;
  }

  const api = { create, entityId, rawIdOf, plainLatLng, KINDS };
  root.TnModel = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
