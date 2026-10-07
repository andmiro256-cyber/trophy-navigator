/*
 * Плавный зум карты Leaflet колесом, тачпадом и щипком (идея — Leaflet.SmoothWheelZoom, MIT; кода оттуда нет).
 *
 * Стандартный ScrollWheelZoom Leaflet ждёт паузу (debounce), потом запускает анимацию setZoomAround, а события,
 * пришедшие во время анимации, применяются после zoomend — зум идёт ступеньками и «догоняет» пальцы.
 * Здесь каждое событие сразу сдвигает целевой зум, а карта каждый кадр (requestAnimationFrame) подходит
 * к цели на долю оставшегося пути — точка под курсором (между пальцами) остаётся на месте.
 *
 * Шаг события:
 * - тачпад двумя пальцами (TrophyNavMapsCore.looksLikeTouchpad) — линейно по пикселям: −deltaY / wheelPxPerZoomLevel;
 * - щипок в WebView2/Chromium приходит как Ctrl+колесо с deltaY ≈ −100·ln(scale) — свой коэффициент, точно по масштабу;
 * - щелчок колеса мыши (строки/страницы или крупный целый шаг) — полуровня.
 * Жест: zoomstart/movestart в начале; кадры — map._move(..., { pinch: true }) как у щипка Leaflet на сенсорном
 * экране (растровые слои масштабируют уже загруженные тайлы, мост MapLibre двигает камеру на событии zoom);
 * zoomend/moveend один раз — когда цель достигнута и событий нет endIdleMs.
 */
(function (root) {
  'use strict';

  const DEFAULTS = {
    wheelPxPerZoomLevel: 120,          // тачпад: пикселей прокрутки на уровень
    mouseStep: 0.5,                    // щелчок колеса мыши
    pinchPerPx: 1 / (100 * Math.LN2),  // Ctrl+колесо (щипок Chromium): log2(scale) = −deltaY / (100·ln 2)
    maxEventZoom: 2,                   // одно событие не дальше двух уровней (сбойный огромный deltaY)
    ease: 0.3,                         // доля оставшегося пути за кадр 60 Гц
    endIdleMs: 150,                    // тишина после достижения цели — конец жеста
    holdMs: 250,                       // жест тачпада держит свой тип, пока паузы короче
    ignoreSelector: '.leaflet-control, .leaflet-popup',
  };
  const LINE_PX = 33, PAGE_PX = 300, FRAME_MS = 1000 / 60, EPS = 0.002;

  function wheelPx(e) {
    const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1;
    return (e.deltaY || 0) * unit;
  }

  /**
   * Тип и шаг события колеса: { kind: 'pinch' | 'touchpad' | 'mouse', dz }.
   * state держит тип жеста тачпада между событиями (крупный целый шаг посреди жеста — всё ещё тачпад).
   */
  function wheelZoomDelta(e, opts, state, now) {
    const o = Object.assign({}, DEFAULTS, opts);
    const core = root.TrophyNavMapsCore;
    const pixelMode = !e.deltaMode;
    let touchpad = pixelMode && (core ? core.looksLikeTouchpad(e) : Math.abs(e.deltaY || 0) < 50);
    if (!touchpad && pixelMode && state && state.kind === 'touchpad' && now - state.at < o.holdMs) touchpad = true;
    if (state) { state.kind = touchpad ? 'touchpad' : 'mouse'; state.at = now; }
    const px = wheelPx(e);
    const clampEv = dz => Math.max(-o.maxEventZoom, Math.min(o.maxEventZoom, dz));
    if (e.ctrlKey && touchpad) return { kind: 'pinch', dz: clampEv(-px * o.pinchPerPx) };
    if (touchpad) return { kind: 'touchpad', dz: clampEv(-px / o.wheelPxPerZoomLevel) };
    return { kind: 'mouse', dz: px ? -Math.sign(px) * o.mouseStep : 0 };
  }

  function attach(map, options) {
    const L = root.L;
    const o = Object.assign({}, DEFAULTS, options);
    const raf = root.requestAnimationFrame ? f => root.requestAnimationFrame(f) : f => setTimeout(() => f(Date.now()), FRAME_MS);
    const caf = root.cancelAnimationFrame ? id => root.cancelAnimationFrame(id) : id => clearTimeout(id);
    const now = () => (root.performance && root.performance.now ? root.performance.now() : Date.now());
    const s = {
      enabled: true, active: false, firing: false,
      target: 0, zoom: 0, anchorLL: null, anchorPt: null,
      raf: 0, endTimer: 0, lastEventAt: 0, lastFrameAt: 0,
      wheel: {}, pinchStart: null,
    };

    const limit = z => Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), z));

    function begin() {
      if (s.active) return;
      map._stop();
      if (map._animatingZoom) map._onZoomTransitionEnd();
      s.active = true;
      s.zoom = s.target = map.getZoom();
      s.lastFrameAt = 0;
      s.firing = true;
      try { map._moveStart(true, false); } finally { s.firing = false; }
    }

    function setAnchor(pt) {
      s.anchorPt = pt;
      s.anchorLL = map.containerPointToLatLng(pt);
    }

    /** Новая цель; keepAnchor — точка карты под пальцами та же, что в начале щипка (пальцы двигают карту). */
    function setTarget(z, pt, keepAnchor) {
      z = limit(z);
      const base = s.active ? s.target : map.getZoom();
      if (!s.active && Math.abs(z - base) < 1e-9) return false;
      begin();
      if (keepAnchor && s.anchorLL) s.anchorPt = pt; else setAnchor(pt);
      s.target = z;
      s.lastEventAt = now();
      if (s.endTimer) { clearTimeout(s.endTimer); s.endTimer = 0; }
      if (!s.raf) s.raf = raf(frame);
      return true;
    }

    function apply(z) {
      const half = map.getSize().divideBy(2);
      const center = map.unproject(map.project(s.anchorLL, z).subtract(s.anchorPt.subtract(half)), z);
      s.zoom = z;
      map._move(center, z, { pinch: true, round: false });
    }

    function frame(t) {
      s.raf = 0;
      if (!s.active) return;
      // зум поменял кто-то другой (кнопка, setView) — жест кончился
      if (Math.abs(map.getZoom() - s.zoom) > 1e-6) { abort(); return; }
      const ts = typeof t === 'number' ? t : now();
      const dt = s.lastFrameAt ? Math.min(Math.max(ts - s.lastFrameAt, 0), 100) : FRAME_MS;
      s.lastFrameAt = ts;
      const k = 1 - Math.pow(1 - o.ease, dt / FRAME_MS);
      let z = s.zoom + (s.target - s.zoom) * k;
      if (Math.abs(s.target - z) < EPS) z = s.target;
      apply(z);
      if (z !== s.target) s.raf = raf(frame);
      else scheduleEnd();
    }

    function scheduleEnd() {
      if (s.endTimer) clearTimeout(s.endTimer);
      const wait = Math.max(0, s.lastEventAt + o.endIdleMs - now());
      s.endTimer = setTimeout(() => {
        s.endTimer = 0;
        if (!s.active || s.raf) return;
        if (s.pinchStart !== null || now() - s.lastEventAt < o.endIdleMs - 1) { scheduleEnd(); return; }
        finish();
      }, wait);
    }

    function stopTimers() {
      if (s.raf) { caf(s.raf); s.raf = 0; }
      if (s.endTimer) { clearTimeout(s.endTimer); s.endTimer = 0; }
    }

    /** Конец жеста: слои дорисовывают тайлы нового уровня, zoomend/moveend — один раз. */
    function finish() {
      stopTimers();
      if (!s.active) return;
      s.active = false;
      s.firing = true;
      try {
        map.fire('zoom');
        map._moveEnd(true);
      } finally { s.firing = false; }
    }

    /** Чужое движение карты (перетаскивание, кнопка, setView) посреди жеста — уступаем; moveend пришлёт оно. */
    function abort() {
      stopTimers();
      if (!s.active) return;
      s.active = false;
      s.pinchStart = null;
      s.firing = true;
      try { map.fire('zoomend'); } finally { s.firing = false; }
    }

    map.on('movestart zoomstart', () => { if (s.active && !s.firing) abort(); });

    function onWheel(e) {
      if (!s.enabled) return;
      // над кнопками и панелями внутри карты (элементы управления, всплывающие окна) — их собственная прокрутка
      if (e.target && e.target.closest && e.target.closest(o.ignoreSelector)) return;
      const d = wheelZoomDelta(e, o, s.wheel, now());
      e.preventDefault();
      e.stopPropagation();
      if (!d.dz) return;
      setTarget((s.active ? s.target : map.getZoom()) + d.dz, map.mouseEventToContainerPoint(e), false);
    }
    const container = map.getContainer();
    container.addEventListener('wheel', onWheel, { passive: false });

    function clientPoint(x, y) {
      const r = container.getBoundingClientRect();
      return L.point(x - r.left - (container.clientLeft || 0), y - r.top - (container.clientTop || 0));
    }

    /** Щипок с абсолютным масштабом от начала жеста (Linux WebKitGTK через Rust, GestureEvent WebKit). */
    function pinch(phase, scale, x, y) {
      if (!s.enabled) return;
      const pt = clientPoint(x, y);
      if (phase === 0 || s.pinchStart === null) {
        s.pinchStart = s.active ? s.target : map.getZoom();
        setAnchor(pt);
      }
      if (phase === 3) {
        s.pinchStart = null;
        if (s.active) { s.target = s.zoom; s.lastEventAt = now(); if (!s.raf) s.raf = raf(frame); }
        return;
      }
      const sc = Number(scale) > 0 ? Number(scale) : 1;
      setTarget(s.pinchStart + Math.log2(sc), pt, true);
      if (phase === 2) {
        s.pinchStart = null;
        if (s.active && !s.raf) scheduleEnd();
      }
    }

    function disable() { finish(); s.enabled = false; container.removeEventListener('wheel', onWheel, { passive: false }); }

    return {
      onWheel, pinch, finish, disable,
      isActive: () => s.active,
      target: () => (s.active ? s.target : map.getZoom()),
      options: o,
    };
  }

  const api = { attach, wheelZoomDelta, DEFAULTS };
  root.TndSmoothZoom = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
