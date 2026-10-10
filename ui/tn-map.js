/*
 * Фасад карты TnMap (план MapLibre v3, контракт R1, этап 0б, пакет 0б.5).
 *
 * Код приложения обращается к карте только через фасад; движок — адаптер (Leaflet сейчас и как резерв,
 * MapLibre — этап 1). Фасад принимает и отдаёт только нейтральные значения: {lat,lng}, пиксели контейнера
 * {x,y}, зум в единицах Leaflet (Z256), рамки [[юго-запад], [северо-восток]] — никогда объекты движка.
 *
 * Этот пакет — камера, проекция, события указателя/вида, контейнер. Данные (setCollection/upsert),
 * выбор (pickAt), ручки и стек (R9) добавляются следующими пакетами по мере перевода подсистем.
 *
 * Адаптер обязан реализовать методы ADAPTER_METHODS; фасад проверяет аргументы (валидные точки, зум —
 * конечное число) — мусор не доходит до движка и не превращается в «0,0».
 */
(function (root) {
  'use strict';
  const Geo = () => root.TnGeo || (typeof require === 'function' ? require('./tn-geo.js') : null);
  const ADAPTER_METHODS = ['getView', 'setView', 'panTo', 'flyTo', 'fitBounds', 'getBounds', 'project', 'unproject',
    'eventToLatLng', 'eventToPoint', 'resize', 'getContainer', 'getSize', 'on', 'openPopup', 'closePopup', 'isPopupOpen',
    'getZoomRange', 'collectOverlay', 'addControl'];
  const EVENTS = ['click', 'dblclick', 'contextmenu', 'pointerdown', 'pointermove', 'pointerup', 'mousemove',
    'movestart', 'move', 'moveend', 'zoomstart', 'zoom', 'zoomend', 'resize'];

  // только числа: Number(null) и Number('') дают 0 — мусор не должен превращаться в «0,0»
  const latLng = (p, where) => {
    const q = p && { lat: p.lat, lng: p.lng };
    if (!q || !Geo().isValidLatLng(q)) throw new TypeError(`TnMap.${where}: невалидная точка ${JSON.stringify(p && { lat: p.lat, lng: p.lng })}`);
    return q;
  };
  const zoomOf = (z, where) => {
    const n = Number(z);
    if (!Number.isFinite(n)) throw new TypeError(`TnMap.${where}: зум не число (${z})`);
    return n;
  };
  /** Рамка по точкам: [sw, ne] или любой список точек → [sw, ne] (пара углов даёт саму себя). */
  function boundsOf(b, where) {
    const pts = (Array.isArray(b) ? b : []).map(p => latLng(p, where));
    if (!pts.length) throw new TypeError(`TnMap.${where}: пустая рамка`);
    let s = 90, w = 180, n = -90, e = -180;
    for (const p of pts) { s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lng); e = Math.max(e, p.lng); }
    return [{ lat: s, lng: w }, { lat: n, lng: e }];
  }

  /** Рамка с запасом ratio от высоты/ширины с каждой стороны — та же формула, что LatLngBounds.pad Leaflet. */
  function padBounds(b, ratio) {
    const [sw, ne] = b;
    const hb = Math.abs(sw.lat - ne.lat) * ratio, wb = Math.abs(sw.lng - ne.lng) * ratio;
    return [{ lat: sw.lat - hb, lng: sw.lng - wb }, { lat: ne.lat + hb, lng: ne.lng + wb }];
  }

  function create(adapter) {
    const missing = ADAPTER_METHODS.filter(m => typeof adapter?.[m] !== 'function');
    if (missing.length) throw new TypeError(`TnMap: адаптеру не хватает ${missing.join(', ')}`);
    const api = {
      get engine() { return adapter.engine; },
      getView: () => adapter.getView(),
      getCenter: () => adapter.getView().center,
      getZoom: () => adapter.getView().zoom,
      setView(v, o = {}) { adapter.setView({ center: latLng(v.center, 'setView'), zoom: zoomOf(v.zoom, 'setView') }, o); },
      panTo(p, o = {}) { adapter.panTo(latLng(p, 'panTo'), o); },
      flyTo(p, zoom, o = {}) { adapter.flyTo(latLng(p, 'flyTo'), zoomOf(zoom, 'flyTo'), o); },
      /** b — [sw, ne] или список точек; o: { padding: px | [x,y], paddingTopLeft, paddingBottomRight, maxZoom, animate }. */
      fitBounds(b, o = {}) { adapter.fitBounds(boundsOf(b, 'fitBounds'), o); },
      getBounds: () => adapter.getBounds(),
      /** Пределы зума карты: { min, max }. */
      getZoomRange: () => adapter.getZoomRange(),
      /**
       * Видимые сейчас линии и точки карты — для 3D-вида: { lines: [{ color, width, opacity, coords: [[lng,lat]…] }],
       * points: [{ name, color, lng, lat }] }. Участники Live сюда не входят (у 3D свой слой).
       */
      collectOverlay: () => adapter.collectOverlay(),
      /** Кнопка или панель на карте: el — DOM-узел, o.position — угол ('topleft'…). Клики дальше узла не идут. Возвращает снятие. */
      addControl: (el, o = {}) => adapter.addControl(el, o),
      /** Пиксели контейнера без округления. */
      project: p => adapter.project(latLng(p, 'project')),
      unproject: pt => adapter.unproject(pt),
      eventToLatLng: e => adapter.eventToLatLng(e),
      eventToPoint: e => adapter.eventToPoint(e),
      resize: () => adapter.resize(),
      getContainer: () => adapter.getContainer(),
      getSize: () => adapter.getSize(),
      /**
       * Всплывающее окно над точкой карты. id — своё имя окна (одно окно на id), content — HTML-строка
       * (уже экранированная вызывающим) или DOM-узел. o: { offset: [x,y], closeButton, autoClose, closeOnClick,
       * className, exclusive } — exclusive: закрыть остальные окна (как openOn Leaflet).
       */
      openPopup(id, p, content, o = {}) { adapter.openPopup(String(id), latLng(p, 'openPopup'), content, o); },
      closePopup: id => adapter.closePopup(id == null ? null : String(id)),
      isPopupOpen: id => adapter.isPopupOpen(String(id)),
      /** Подписка: payload { latlng?, point?, originalEvent? }. Возвращает отписку. */
      on(ev, cb) {
        if (!EVENTS.includes(ev)) throw new TypeError(`TnMap.on: неизвестное событие ${ev}`);
        return adapter.on(ev, cb);
      },
      _adapter: adapter,
    };
    return api;
  }

  const api = { create, ADAPTER_METHODS, EVENTS, boundsOf, padBounds };
  root.TnMap = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
