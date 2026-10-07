/*
 * 3D-вид TrophyNav Maps (путь B): отдельная карта MapLibre GL JS поверх области карты — наклон, поворот,
 * настоящий рельеф из <id>.dem.mbtiles (setTerrain), 3D-здания, небо. Точки, треки и маршруты с основной
 * карты — GeoJSON, только просмотр. Основная карта Leaflet под 3D-видом не меняется; «2D»/Esc возвращает её
 * в то же место.
 *
 * Управление: колесо и тачпад — правило в TrophyNavMapsCore.wheelGesture; правая кнопка или Ctrl+перетаскивание —
 * наклон и поворот (MapLibre); Shift+стрелки — наклон/поворот (клавиатура MapLibre); ползунки и кнопки на панели.
 */
(function () {
  'use strict';

  const Core = window.TrophyNavMapsCore;
  const LS_EXAG = 'tnd-tnmaps-3d-exaggeration';
  const LS_HINT = 'tnd-tnmaps-3d-hint-seen';
  const ENTER_PITCH = 60;
  const ROTATE_STEP = 15;
  /* global map */
  const leafletMap = () => (typeof map !== 'undefined' ? map : null);
  const toast = (msg, type) => { if (typeof window.showToast === 'function') window.showToast(msg, type); };
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } };
  const ico = (name, cls) => (typeof window.tnIcon === 'function' ? window.tnIcon(name, cls) : '');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const view = {
    root: null,      // оверлей
    ml: null,        // maplibregl.Map
    id: null,        // область
    hasDem: false,
    wheel: {},       // состояние жеста колеса
    pending: { pitch: 0, bearing: 0 },
    raf: 0,
    onResize: null,
    onKey: null,
    opening: null,   // Promise открытия, пока оно идёт (двойной клик по «3D» — одно открытие)
    seq: 0,          // номер открытия; close() его меняет — незавершённое открытие ничего не создаёт
  };

  // ─── стили (только переменные темы приложения) ───
  function injectCss() {
    if (document.getElementById('tn3d-style')) return;
    const st = document.createElement('style');
    st.id = 'tn3d-style';
    st.textContent = `
      #tn3d-root { position:fixed; z-index:4000; background:var(--bg-base); outline:none; }
      #tn3d-root .tn3d-map { position:absolute; inset:0; }
      #tn3d-root .tn3d-panel { position:absolute; top:10px; left:10px; width:250px; display:flex; flex-direction:column; gap:8px;
        background:var(--modal-bg); color:var(--text-primary); border:1px solid var(--card-stroke); border-radius:var(--radius-l);
        box-shadow:var(--panel-shadow); padding:12px; font-size:12px; }
      #tn3d-root .tn3d-title { display:flex; align-items:center; justify-content:space-between; gap:6px; font-weight:700; font-size:14px; }
      #tn3d-root .tn3d-sub { font-size:11px; color:var(--text-muted); font-weight:400; }
      #tn3d-root .tn3d-row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
      #tn3d-root .tn3d-row label { min-width:92px; color:var(--text-secondary); }
      #tn3d-root .tn3d-row input[type=range] { flex:1; min-width:80px; }
      #tn3d-root .tn3d-val { min-width:34px; text-align:right; color:var(--text-secondary); font-variant-numeric:tabular-nums; }
      #tn3d-root .tn3d-btn { min-height:30px; font-size:12px; font-weight:700; padding:4px 12px; border-radius:var(--radius-pill); cursor:pointer;
        border:0; background:var(--plain-btn); color:var(--text-primary); }
      #tn3d-root .tn3d-btn:hover { background-image:linear-gradient(var(--hover), var(--hover)); }
      #tn3d-root .tn3d-btn.primary { background:var(--primary); color:var(--on-primary); }
      #tn3d-root .tn3d-note { font-size:11px; color:var(--text-warning); }
      #tn3d-root .tn3d-hint { font-size:11px; color:var(--text-muted); line-height:1.4; }
      #tn3d-root .tn3d-hint b { color:var(--text-secondary); font-weight:600; }
      #tn3d-root .tn3d-tip { position:absolute; left:50%; bottom:28px; transform:translateX(-50%); max-width:560px;
        background:var(--modal-bg); color:var(--text-primary); border:1px solid var(--card-stroke); border-left:4px solid var(--primary); border-radius:var(--radius-m);
        box-shadow:var(--panel-shadow); padding:10px 14px; font-size:13px; display:flex; gap:12px; align-items:center; }
      #tn3d-root .tn3d-tip[hidden] { display:none; }
      .tn3d-control a { font-weight:700; font-size:12px; width:30px !important; }
      .tn3d-control.tn3d-off { display:none; }
    `;
    document.head.appendChild(st);
  }

  // ─── точки, треки, маршруты с основной карты (как видны сейчас) ───
  function collectOverlay() {
    const lmap = leafletMap();
    const lines = [], points = [];
    if (!lmap) return { lines, points };
    lmap.eachLayer(layer => {
      if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
        const flat = layer.getLatLngs().flat(3).filter(p => p && Number.isFinite(p.lat));
        if (flat.length < 2) return;
        lines.push({
          type: 'Feature',
          properties: {
            color: layer.options.color || '#4adf7a',  // theme-check: data (цвет на карте)
            width: Number(layer.options.weight) || 3,
            opacity: layer.options.opacity ?? 0.9,
          },
          geometry: { type: 'LineString', coordinates: flat.map(p => [p.lng, p.lat]) },
        });
      } else if (layer instanceof L.Marker) {
        if (layer._liveDev) return;  // участники Live — свой слой 'tn-live' (цвет по свежести, обновляется)
        const ll = layer.getLatLng();
        const wp = layer.wpData;
        const tip = layer.getTooltip?.()?.getContent?.();
        const name = wp?.name || layer.options.title || (typeof tip === 'string' ? tip.replace(/<[^>]*>/g, '') : '');
        points.push({
          type: 'Feature',
          properties: { name: String(name || ''), color: wp?.color || '#df7a4a' },  // theme-check: data (цвет на карте)
          geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
        });
      }
    });
    return { lines, points };
  }

  function addOverlay(ml) {
    const { lines, points } = collectOverlay();
    const add = () => {
      if (ml.getSource('tn-user-lines')) return;
      ml.addSource('tn-user-lines', { type: 'geojson', data: { type: 'FeatureCollection', features: lines } });
      ml.addSource('tn-user-points', { type: 'geojson', data: { type: 'FeatureCollection', features: points } });
      ml.addLayer({ id: 'tn-user-lines-casing', type: 'line', source: 'tn-user-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': ['+', ['get', 'width'], 3], 'line-opacity': 0.75 } });  // theme-check: data (цвет на карте)
      ml.addLayer({ id: 'tn-user-lines', type: 'line', source: 'tn-user-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['+', ['get', 'width'], 1], 'line-opacity': ['get', 'opacity'] } });
      ml.addLayer({ id: 'tn-user-points', type: 'circle', source: 'tn-user-points',
        paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,  // theme-check: data (цвет на карте)
          'circle-pitch-alignment': 'viewport' } });
      ml.addLayer({ id: 'tn-user-labels', type: 'symbol', source: 'tn-user-points',
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Roboto Medium'], 'text-size': 13, 'text-offset': [0, 1.1],
          'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': '#1a2030', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } });  // theme-check: data (цвет на карте)
    };
    if (ml.isStyleLoaded()) add(); else ml.once('load', add);
    if (ml.isStyleLoaded()) addLive(ml); else ml.once('load', () => addLive(ml));
    return lines.length + points.length;
  }

  // ─── участники Live: те же, что в списке (фильтр группы), цвет — свежесть последней точки ───
  // Цвета — данные карты (как на маркерах), не UI: зелёный ≤ 5 мин, жёлтый ≤ 1 ч, красный дольше
  const LIVE_COLORS = ['match', ['get', 'age'], 'online', '#2E7D32', 'recent', '#F9A825', 'old', '#C62828', '#9E9E9E'];  // theme-check: data (цвет на карте)
  const liveFeatures = () => (typeof window.tndLive3d?.features === 'function' ? window.tndLive3d.features() : []);
  function addLive(ml) {
    if (ml.getSource('tn-live')) return;
    ml.addSource('tn-live', { type: 'geojson', data: { type: 'FeatureCollection', features: liveFeatures() } });
    ml.addLayer({ id: 'tn-live', type: 'circle', source: 'tn-live',
      paint: { 'circle-radius': 7, 'circle-color': LIVE_COLORS, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,  // theme-check: data (цвет на карте)
        'circle-opacity': ['case', ['==', ['get', 'age'], 'online'], 1, 0.55],
        'circle-stroke-opacity': ['case', ['==', ['get', 'age'], 'online'], 1, 0.55],
        'circle-pitch-alignment': 'viewport' } });
    ml.addLayer({ id: 'tn-live-labels', type: 'symbol', source: 'tn-live',
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Roboto Medium'], 'text-size': 13, 'text-offset': [0, 1.1],
        'text-anchor': 'top', 'text-optional': true },
      paint: { 'text-color': '#1a2030', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6,  // theme-check: data (цвет на карте)
        'text-opacity': ['case', ['==', ['get', 'age'], 'online'], 1, 0.7] } });
    ml.on('click', 'tn-live', e => {
      const f = e.features?.[0];
      const html = f && window.tndLive3d?.popupHtml?.(f.properties.id);
      if (!html) return;
      new window.maplibregl.Popup({ offset: 12, maxWidth: '260px' }).setLngLat(f.geometry.coordinates).setHTML(html).addTo(ml);
    });
    ml.on('mouseenter', 'tn-live', () => { ml.getCanvas().style.cursor = 'pointer'; });
    ml.on('mouseleave', 'tn-live', () => { ml.getCanvas().style.cursor = ''; });
  }
  /** После каждого опроса Live (index.html liveProcessDevices): обновить участников, если 3D открыт. */
  function setLive(features) {
    const src = view.ml?.getSource?.('tn-live');
    if (src) src.setData({ type: 'FeatureCollection', features: Array.isArray(features) ? features : liveFeatures() });
  }

  // ─── управление ───
  function applyPending() {
    view.raf = 0;
    const ml = view.ml;
    if (!ml) return;
    const { pitch, bearing } = view.pending;
    view.pending = { pitch: 0, bearing: 0 };
    ml.jumpTo({
      pitch: Math.max(0, Math.min(Core.MAX_PITCH, ml.getPitch() + pitch)),
      bearing: ml.getBearing() + bearing,
    });
  }

  function onWheel(e) {
    if (!view.ml) return;
    e.preventDefault();
    e.stopPropagation();
    const g = Core.wheelGesture(e, view.wheel, performance.now());
    if (g.kind === 'zoom') {
      const rect = view.ml.getCanvas().getBoundingClientRect();
      const around = view.ml.unproject([e.clientX - rect.left, e.clientY - rect.top]);
      view.ml.easeTo({ zoom: view.ml.getZoom() + g.dZoom, around, duration: e.ctrlKey ? 0 : 120 });
      return;
    }
    // Наклон и поворот копятся и применяются раз в кадр — тачпад шлёт события чаще, чем рисуется карта
    view.pending.pitch += g.dPitch;
    view.pending.bearing += g.dBearing;
    if (!view.raf) view.raf = requestAnimationFrame(applyPending);
  }

  function syncPanel() {
    const ml = view.ml, root = view.root;
    if (!ml || !root) return;
    const p = Math.round(ml.getPitch());
    const slider = root.querySelector('[data-tn3d=pitch]');
    if (slider && document.activeElement !== slider) slider.value = String(p);
    root.querySelector('[data-tn3d-val=pitch]').textContent = `${p}°`;
    const b = ((Math.round(ml.getBearing()) % 360) + 360) % 360;
    root.querySelector('[data-tn3d-val=bearing]').textContent = `${b}°`;
  }

  function onPanel(e) {
    const ml = view.ml;
    const t = e.target;
    const act = t.closest?.('[data-tn3d-act]')?.dataset.tn3dAct;
    if (act && e.type === 'click') {
      if (act === 'close') close();
      else if (act === 'left') ml?.easeTo({ bearing: ml.getBearing() - ROTATE_STEP, duration: 250 });
      else if (act === 'right') ml?.easeTo({ bearing: ml.getBearing() + ROTATE_STEP, duration: 250 });
      else if (act === 'north') ml?.easeTo({ bearing: 0, duration: 400 });
      else if (act === 'top') ml?.easeTo({ pitch: 0, duration: 400 });
      else if (act === 'tip-ok') { view.root.querySelector('.tn3d-tip').hidden = true; lsSet(LS_HINT, '1'); }
      return;
    }
    if (t.matches?.('[data-tn3d=pitch]') && e.type === 'input') ml?.jumpTo({ pitch: Number(t.value) });
    if (t.matches?.('[data-tn3d=exag]') && e.type === 'input') {
      const v = Core.normalizeExaggeration(t.value);
      root().querySelector('[data-tn3d-val=exag]').textContent = `×${v.toFixed(1)}`;
      lsSet(LS_EXAG, String(v));
      if (view.hasDem && ml?.getSource('terrain')) ml.setTerrain({ source: 'terrain', exaggeration: v });
    }
  }
  const root = () => view.root;

  function placeOverMap() {
    const el = document.getElementById('map');
    if (!el || !view.root) return;
    const r = el.getBoundingClientRect();
    Object.assign(view.root.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    view.ml?.resize();
  }

  function buildRoot(id, hasDem, exag, objects) {
    const el = document.createElement('div');
    el.id = 'tn3d-root';
    el.tabIndex = -1;
    const name = window.TrophyNavMaps.regionName(id);
    el.innerHTML = `
      <div class="tn3d-map"></div>
      <div class="tn3d-panel" role="group" aria-label="3D-вид">
        <div class="tn3d-title"><span>${ico('terrain', 'tn-ico-t')}3D · TrophyNav Maps<br><span class="tn3d-sub">${esc(name)}</span></span>
          <button type="button" class="tn3d-btn primary" data-tn3d-act="close" title="Вернуться к обычной карте (Esc)">2D</button></div>
        <div class="tn3d-row"><label>Наклон</label><input type="range" min="0" max="${Core.MAX_PITCH}" step="1" value="${ENTER_PITCH}" data-tn3d="pitch">
          <span class="tn3d-val" data-tn3d-val="pitch">${ENTER_PITCH}°</span></div>
        <div class="tn3d-row"><label>Сила рельефа</label><input type="range" min="${Core.EXAGGERATION_MIN}" max="${Core.EXAGGERATION_MAX}" step="0.1"
          value="${exag}" data-tn3d="exag" ${hasDem ? '' : 'disabled'}><span class="tn3d-val" data-tn3d-val="exag">×${exag.toFixed(1)}</span></div>
        ${hasDem ? '' : '<div class="tn3d-note">Рельеф для этой области не скачан — наклон и здания работают, горы плоские.</div>'}
        <div class="tn3d-row"><label>Поворот <span class="tn3d-val" data-tn3d-val="bearing">0°</span></label>
          <button type="button" class="tn3d-btn" data-tn3d-act="left" title="Повернуть влево" aria-label="Повернуть влево">${ico('rotate-left', 'tn-ico-s')}</button>
          <button type="button" class="tn3d-btn" data-tn3d-act="right" title="Повернуть вправо" aria-label="Повернуть вправо">${ico('refresh', 'tn-ico-s')}</button></div>
        <div class="tn3d-row">
          <button type="button" class="tn3d-btn" data-tn3d-act="north">Север вверх</button>
          <button type="button" class="tn3d-btn" data-tn3d-act="top">Сверху</button></div>
        <div class="tn3d-hint">
          <b>Тачпад:</b> два пальца вверх-вниз — наклон, влево-вправо — поворот, щипок — масштаб.<br>
          <b>Мышь:</b> колесо — масштаб, Shift+колесо — наклон, правая кнопка (или Ctrl) и тянуть — наклон и поворот.<br>
          <b>Клавиши:</b> Shift+стрелки — наклон и поворот, Esc — обычная карта.<br>
          Точки и треки здесь только для просмотра${objects ? '' : ' (на карте их нет)'}.
        </div>
      </div>
      <div class="tn3d-tip" ${lsGet(LS_HINT) ? 'hidden' : ''}>
        <span>Два пальца на тачпаде: вверх-вниз — наклон, влево-вправо — поворот; щипок — масштаб</span>
        <button type="button" class="tn3d-btn primary" data-tn3d-act="tip-ok">Понятно</button>
      </div>`;
    return el;
  }

  // ─── открыть / закрыть ───
  /** Повторный вызов, пока 3D открыт или открывается, ничего не создаёт: один оверлей, одна карта MapLibre. */
  function open(explicitId) {
    if (view.ml) return Promise.resolve();
    if (view.opening) return view.opening;
    const seq = ++view.seq;
    const p = doOpen(explicitId, seq).finally(() => { if (view.opening === p) view.opening = null; });
    view.opening = p;
    return p;
  }

  async function doOpen(explicitId, seq) {
    const stale = () => seq !== view.seq;
    const tn = window.TrophyNavMaps;
    const lmap = leafletMap();
    if (!tn || !lmap) return;
    if (!tn.hasWebGL()) {
      toast('⚠ 3D-вид недоступен: в этой системе нет WebGL (видеодрайвер). Обычная карта работает как раньше.', 'warning');
      return;
    }
    await tn.refreshLocal().catch(() => {});
    if (stale()) return;
    const c = lmap.getCenter();
    // Область под центром карты; карта на экране — если её область здесь (иначе 3D показал бы пустоту)
    const here = tn.regionAt(c.lat, c.lng, tn.activeId());
    const id = explicitId || here;
    if (!id) {
      toast('⚠ Для 3D нужна скачанная карта TrophyNav Maps этой местности — «Карта и слои» → «Карты областей»', 'warning');
      return;
    }
    injectCss();
    const exag = Core.normalizeExaggeration(lsGet(LS_EXAG));
    try {
      await tn.ensureLibs();
      const local = tn.localEntry(id);
      const style = Core.to3dStyle(await tn.buildStyleFor(id), local, tn.STYLE_BASE, exag);
      // Пока грузились библиотеки и стиль, 3D могли закрыть (Esc) — тогда ничего не создавать
      if (stale()) return;
      // Остатки прежнего вида (не должно быть, но второй оверлей поверх — хуже): убрать
      teardown();
      view.id = id;
      view.hasDem = !!local?.dem;
      const objects = collectOverlay();
      view.root = buildRoot(id, view.hasDem, exag, objects.lines.length + objects.points.length);
      document.body.appendChild(view.root);
      placeOverMap();
      const ml = new window.maplibregl.Map({
        container: view.root.querySelector('.tn3d-map'),
        style,
        center: [c.lng, c.lat],
        // Leaflet считает масштаб в тайлах 256 px, MapLibre — 512 px
        zoom: Math.max(0, lmap.getZoom() - 1),
        pitch: ENTER_PITCH,
        maxPitch: Core.MAX_PITCH,
        attributionControl: false,
        scrollZoom: false,      // колесо — свой обработчик (тачпад: наклон/поворот)
        dragRotate: true,       // правая кнопка / Ctrl+перетаскивание
        pitchWithRotate: true,
        keyboard: true,         // Shift+стрелки
      });
      view.ml = ml;
      ml.on('styleimagemissing', e => tn.addTopoImage(ml, e.id));
      ml.on('error', e => {
        if (e?.error?.name === 'TnNoTile') return;
        console.warn('TrophyNav 3D:', e?.error?.message || e);
      });
      ml.on('move', syncPanel);
      ml.getCanvas().addEventListener('webglcontextlost', () => {
        if (view.ml !== ml) return;
        toast('⚠ Видеокарта сбросила 3D-вид (WebGL). Возврат к обычной карте.', 'warning');
        close();
      }, { once: true });
      addOverlay(ml);
      ml.getCanvasContainer().addEventListener('wheel', onWheel, { passive: false });
      ['click', 'input'].forEach(t => view.root.querySelector('.tn3d-panel').addEventListener(t, onPanel));
      view.root.querySelector('.tn3d-tip').addEventListener('click', onPanel);
      // Клавиши не уходят в основное окно (там свои сочетания)
      view.root.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
      view.onKey = e => { if (e.key === 'Escape' && view.ml) { e.preventDefault(); e.stopPropagation(); close(); } };
      window.addEventListener('keydown', view.onKey, true);
      view.onResize = () => placeOverMap();
      window.addEventListener('resize', view.onResize);
      ml.getCanvas().focus();
      document.dispatchEvent(new CustomEvent('tnmaps:3d', { detail: { open: true, id } }));
    } catch (e) {
      if (stale()) return;
      console.warn('TrophyNav 3D: не открылся', e);
      close(true);
      toast(`⚠ 3D-вид не открылся: ${e?.message || e}`, 'warning');
    }
  }

  function close(silent) {
    const ml = view.ml, lmap = leafletMap();
    if (ml && lmap && !silent) {
      const c = ml.getCenter();
      lmap.setView([c.lat, c.lng], Math.min(lmap.getMaxZoom(), ml.getZoom() + 1), { animate: false });
    }
    // Незавершённое открытие больше ничего не создаст
    view.seq++;
    view.opening = null;
    teardown();
    document.dispatchEvent(new CustomEvent('tnmaps:3d', { detail: { open: false } }));
  }

  /** Снять карту MapLibre (WebGL), оверлей и обработчики окна. */
  function teardown() {
    const ml = view.ml;
    if (view.raf) cancelAnimationFrame(view.raf);
    view.raf = 0;
    view.ml = null;
    try { ml?.remove(); } catch (e) { console.warn('TrophyNav 3D: remove', e); }
    view.root?.remove();
    view.root = null;
    if (view.onKey) window.removeEventListener('keydown', view.onKey, true);
    if (view.onResize) window.removeEventListener('resize', view.onResize);
    view.onKey = view.onResize = null;
    // Чужой #tn3d-root (оставленный прежним открытием) тоже убрать
    document.querySelectorAll?.('#tn3d-root').forEach(el => el.remove());
  }

  // ─── кнопка «3D» на карте (видна, когда на экране TrophyNav Maps) ───
  function addMapButton() {
    const lmap = leafletMap();
    if (!lmap || !L.Control) return;
    const Ctl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const box = L.DomUtil.create('div', 'leaflet-bar tn3d-control tn3d-off');
        const a = L.DomUtil.create('a', '', box);
        a.href = '#'; a.textContent = '3D'; a.title = '3D-вид: наклон, поворот, рельеф';
        a.setAttribute('role', 'button');
        L.DomEvent.on(a, 'click', ev => { L.DomEvent.preventDefault(ev); L.DomEvent.stopPropagation(ev); open(); });
        L.DomEvent.disableClickPropagation(box);
        this._box = box;
        return box;
      },
    });
    const ctl = new Ctl();
    lmap.addControl(ctl);
    document.addEventListener('tnmaps:active', e => ctl._box?.classList.toggle('tn3d-off', !e.detail?.id));
    if (window.TrophyNavMaps?.activeId?.()) ctl._box.classList.remove('tn3d-off');
  }

  function init() {
    injectCss();
    addMapButton();
  }

  window.TrophyNav3D = { open, close, isOpen: () => !!view.ml, _view: view, collectOverlay, setLive };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
