/*
 * Leaflet-адаптер фасада TnMap (план MapLibre v3, R1/R7; этап 0б, пакет 0б.5). Единственное место, где
 * разрешены вызовы Leaflet для камеры, проекции и событий; переходный и резервный движок.
 *
 * Проекция — без округления до целого пикселя (latLngToContainerPoint Leaflet округляет); всё, что отдаётся
 * наружу, — простые {lat,lng} и {x,y}. Плавный зум (smooth-zoom.js) остаётся на самой карте Leaflet.
 */
(function (root) {
  'use strict';

  function create(map) {
    const L = root.L;
    const ll = p => L.latLng(p.lat, p.lng);
    const plain = q => ({ lat: q.lat, lng: q.lng });
    const pad = v => (v == null ? undefined : Array.isArray(v) ? L.point(v[0], v[1]) : L.point(v, v));
    const fitOpts = (o = {}) => {
      const out = {};
      if (o.padding != null) out.padding = pad(o.padding);
      if (o.paddingTopLeft != null) out.paddingTopLeft = pad(o.paddingTopLeft);
      if (o.paddingBottomRight != null) out.paddingBottomRight = pad(o.paddingBottomRight);
      if (o.maxZoom != null) out.maxZoom = o.maxZoom;
      if (o.animate != null) out.animate = o.animate;
      return out;
    };
    // Leaflet называет события указателя по-своему
    const EV = { pointerdown: 'mousedown', pointermove: 'mousemove', pointerup: 'mouseup' };
    const toPayload = e => {
      const out = { originalEvent: e?.originalEvent || null };
      if (e?.latlng) out.latlng = plain(e.latlng);
      if (e?.containerPoint) out.point = { x: e.containerPoint.x, y: e.containerPoint.y };
      return out;
    };

    return {
      engine: 'leaflet',
      map,
      getView() { const c = map.getCenter(); return { center: plain(c), zoom: map.getZoom(), bearing: 0, pitch: 0 }; },
      setView(v, o = {}) { map.setView(ll(v.center), v.zoom, o.animate == null ? {} : { animate: o.animate }); },
      panTo(p, o = {}) { map.panTo(ll(p), o.animate == null ? {} : { animate: o.animate }); },
      flyTo(p, zoom, o = {}) { map.flyTo(ll(p), zoom, o.durationMs != null ? { duration: o.durationMs / 1000 } : {}); },
      fitBounds(b, o) { map.fitBounds(L.latLngBounds(ll(b[0]), ll(b[1])), fitOpts(o)); },
      getBounds() { const b = map.getBounds(); return [plain(b.getSouthWest()), plain(b.getNorthEast())]; },
      project(p) {
        const pt = map.project(ll(p)).subtract(map.getPixelOrigin()).add(map._getMapPanePos());
        return { x: pt.x, y: pt.y };
      },
      unproject(pt) {
        return plain(map.unproject(L.point(pt.x, pt.y).add(map.getPixelOrigin()).subtract(map._getMapPanePos())));
      },
      eventToLatLng: e => plain(map.mouseEventToLatLng(e)),
      eventToPoint: e => { const p = map.mouseEventToContainerPoint(e); return { x: p.x, y: p.y }; },
      resize: () => map.invalidateSize(),
      getContainer: () => map.getContainer(),
      getSize: () => { const s = map.getSize(); return { x: s.x, y: s.y }; },
      on(ev, cb) {
        const name = EV[ev] || ev;
        const h = e => cb(toPayload(e));
        map.on(name, h);
        return () => map.off(name, h);
      },
    };
  }

  const api = { create };
  root.TnMapLeaflet = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
