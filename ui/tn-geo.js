/*
 * Геофункции и адаптер координат для перехода 2D-карты на MapLibre (план v3, контракт R1).
 *
 * Домен — {lat, lng} в градусах WGS-84 (как сегодня у треков, маршрутов и WP); GeoJSON-пары [lng, lat]
 * живут только внутри адаптеров карты. Расстояние — ровно L.CRS.Earth.distance из Leaflet 1.9
 * (гаверсинус, R = 6 371 000 м), чтобы длины, радиусы WP и Race Report не сдвинулись ни на метр при смене
 * движка. Эллипсоид — отдельное решение, сюда не входит.
 *
 * Чистые функции без DOM и без Leaflet — tests/tn-geo.test.mjs (сверка с leaflet.js побайтно).
 */
(function (root) {
  'use strict';

  const R = 6371000;                 // L.CRS.Earth.R
  const RAD = Math.PI / 180;
  const MERCATOR_MAX_LAT = 85.0511287798;

  /** Валидная точка домена: конечные числа, |lat| ≤ 90, |lng| ≤ 180. Ноль — валидное значение. */
  function isValidLatLng(p) {
    if (!p || typeof p !== 'object') return false;
    const lat = p.lat, lng = p.lng;
    return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
      && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  }

  /** {lat,lng} → [lng, lat]. Бросает на невалидной точке: null/NaN не превращаются в 0. */
  function toLngLat(p) {
    if (!isValidLatLng(p)) throw new TypeError(`tn-geo: невалидная точка ${JSON.stringify(p)}`);
    return [p.lng, p.lat];
  }

  /** [lng, lat] → {lat, lng}. */
  function fromLngLat(t) {
    if (!Array.isArray(t) || t.length < 2) throw new TypeError('tn-geo: ожидалась пара [lng, lat]');
    const p = { lat: Number(t[1]), lng: Number(t[0]) };
    if (!isValidLatLng(p)) throw new TypeError(`tn-geo: невалидная пара ${JSON.stringify(t)}`);
    return p;
  }

  /**
   * Линия для отображения: долготы «разворачиваются» через ±180°, чтобы отрезок 179.95 → −179.95 был
   * коротким, а не полосой через весь мир. Данные не меняются — только то, что уходит в GeoJSON.
   */
  function unwrapLine(points) {
    const out = [];
    let prev = null;
    for (const p of points || []) {
      let lng = p.lng;
      if (prev !== null) {
        while (lng - prev > 180) lng -= 360;
        while (lng - prev < -180) lng += 360;
      }
      out.push([lng, clampForMercator(p.lat)]);
      prev = lng;
    }
    return out;
  }

  /** Широта для отображения в Web Mercator (±85.05112878°). Данные не меняются. */
  function clampForMercator(lat) {
    return Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat));
  }

  /** Метры между точками — тот же порядок операций, что L.CRS.Earth.distance (Leaflet 1.9.4). */
  function distance(a, b) {
    const lat1 = a.lat * RAD, lat2 = b.lat * RAD;
    const sinDLat = Math.sin((b.lat - a.lat) * RAD / 2);
    const sinDLon = Math.sin((b.lng - a.lng) * RAD / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return R * c;
  }

  /** Расстояние в пикселях между точками экрана (вместо Point.distanceTo Leaflet). */
  function screenDistance(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  /** Начальный азимут a → b, градусы 0..360 (0 — север, по часовой). */
  function bearing(a, b) {
    const φ1 = a.lat * RAD, φ2 = b.lat * RAD, Δλ = (b.lng - a.lng) * RAD;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }

  /** Точка на расстоянии meters по азимуту bearingDeg от p — та же сфера R. */
  function destination(p, bearingDeg, meters) {
    const δ = meters / R, θ = bearingDeg * RAD;
    const φ1 = p.lat * RAD, λ1 = p.lng * RAD;
    const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
    const φ2 = Math.asin(Math.max(-1, Math.min(1, sinφ2)));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * sinφ2);
    let lng = λ2 / RAD;
    lng = ((lng + 540) % 360) - 180;
    return { lat: φ2 / RAD, lng };
  }

  /**
   * Геодезический круг радиуса WP: замкнутое кольцо точек (первая = последняя). segments 64..128 —
   * по контракту R1; по умолчанию 96. Радиус — метры на земле, не пиксели.
   */
  function circlePolygon(center, radiusM, segments = 96) {
    const n = Math.max(64, Math.min(128, Math.round(segments) || 96));
    const ring = [];
    for (let i = 0; i < n; i++) ring.push(destination(center, (360 * i) / n, radiusM));
    ring.push({ ...ring[0] });
    return ring;
  }

  /**
   * Куски трека (0.9.34: GPX trkseg → pointsData[i].seg = 1 у первой точки куска, i > 0): массив кусков
   * точек — для MultiLineString и длины без прыжков через разрыв.
   */
  function trackSegments(points, pointsData) {
    const pts = points || [];
    const out = [[]];
    pts.forEach((p, i) => {
      if (i > 0 && pointsData?.[i]?.seg && out[out.length - 1].length) out.push([]);
      out[out.length - 1].push(p);
    });
    return out[0].length ? out : [];
  }

  /** Длина трека в метрах без прыжков через разрывы кусков — та же сумма, что trackLen() приложения. */
  function trackLength(points, pointsData) {
    let d = 0;
    for (let i = 1; i < (points?.length || 0); i++) if (!pointsData?.[i]?.seg) d += distance(points[i - 1], points[i]);
    return d;
  }

  const api = {
    R, MERCATOR_MAX_LAT,
    isValidLatLng, toLngLat, fromLngLat, unwrapLine, clampForMercator,
    distance, screenDistance, bearing, destination, circlePolygon, trackSegments, trackLength,
  };
  root.TnGeo = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
