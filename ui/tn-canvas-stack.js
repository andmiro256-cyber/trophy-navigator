/*
 * Сквозные события для стопки холстов Leaflet (0.9.35).
 *
 * У карты несколько холстов в одной панели: линии треков, точки треков, общий (круги, линейка…).
 * Мышь получает только верхний — и если под курсором нет его объекта, событие уходило карте,
 * минуя холсты ниже. Так, после первого показа точек трека их холст перекрывал линии: клик по
 * треку ничего не открывал, ПКМ давал меню карты, в правке не вставлялась точка и не работал «Разбить».
 *
 * Здесь холст без своего попадания передаёт событие ближайшему холсту ниже в той же панели;
 * самый нижний ведёт себя как обычный Leaflet (отдаёт событие карте). Опирается на внутренние
 * методы L.Canvas 1.9 (_onClick, _onMouseMove, _handleMouseOut) — при смене Leaflet проверить.
 */
(function (root) {
  'use strict';

  function hitsOwn(r, e) {
    const p = r._map.mouseEventToLayerPoint(e);
    for (let o = r._drawFirst; o; o = o.next) {
      const l = o.layer;
      if (l.options.interactive && l._containsPoint(p)) return true;
    }
    return false;
  }

  // ближайший холст ниже в той же панели (холсты стоят в порядке добавления, верхний — последний)
  function below(r) {
    for (let el = r._container && r._container.previousElementSibling; el; el = el.previousElementSibling) {
      if (el._tndCanvas && el._tndCanvas._map) return el._tndCanvas;
    }
    return null;
  }

  function outAll(r, e) {
    for (let b = below(r); b; b = below(b)) b._handleMouseOut(e);
  }

  function install(L) {
    const P = L.Canvas.prototype;
    if (P._tndStack) return;
    P._tndStack = true;
    const initContainer = P._initContainer, onClick = P._onClick, onMouseMove = P._onMouseMove, handleMouseOut = P._handleMouseOut;

    P._initContainer = function () {
      initContainer.apply(this, arguments);
      this._container._tndCanvas = this;
    };
    P._onClick = function (e) {
      const b = this._map && !hitsOwn(this, e) ? below(this) : null;
      if (b) return b._onClick(e);
      return onClick.call(this, e);
    };
    P._onMouseMove = function (e) {
      if (!this._map || this._map.dragging.moving() || this._map._animatingZoom) return;
      const b = hitsOwn(this, e) ? null : below(this);
      if (!b) { outAll(this, e); return onMouseMove.call(this, e); }
      handleMouseOut.call(this, e);
      b._onMouseMove(e);
      // курсор определяется верхним холстом: «рука», если под ним объект нижнего
      let hovered = false;
      for (let c = b; c && !hovered; c = below(c)) hovered = !!c._hoveredLayer;
      L.DomUtil[hovered ? 'addClass' : 'removeClass'](this._container, 'leaflet-interactive');
    };
    P._handleMouseOut = function (e) {
      handleMouseOut.call(this, e);
      // уход мыши с верхнего холста — уход и с нижних (их mouseout сам не придёт)
      if (e && e.type === 'mouseout') { L.DomUtil.removeClass(this._container, 'leaflet-interactive'); outAll(this, e); }
    };
  }

  const api = { install, hitsOwn, below };
  root.TndCanvasStack = api;
  if (root.L && root.L.Canvas) install(root.L);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
