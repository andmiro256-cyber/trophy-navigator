// Trophy Navigator Desktop — анализ трека (0.9.33), как в AlpineQuest / Locus.
// Выбрал трек → «Анализ» → снизу панель: график высоты, скорости или уклона по расстоянию или времени,
// полная статистика (время в движении и на стоянках, скорости, высоты, самые крутые участки,
// остановки, отрезки по километрам), выделение участка на графике с его статистикой и действиями
// «Обрезать по участку», «Разрезать», «Сохранить отдельно», раскраска трека на карте.
// График и карта связаны: ведёшь по графику — по треку бежит точка; ведёшь по треку на карте — бежит указатель.
// Графики рисуются своим canvas без библиотек: работает без интернета (Race Report — отдельно, Chart.js).
// Расчёты — чистые функции TnTrackAnalysis.calc, проверяются тестами на фикстурах.
(function () {
  'use strict';
  const icon = (name, cls) => (typeof window.tnIcon === 'function' ? window.tnIcon(name, cls) : '');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DASH = '—';
  const RAD = Math.PI / 180;

  // ─── Расчёты ───
  const R_EARTH = 6371000; // как L.LatLng.distanceTo и виджеты
  function haversine(a, b) {
    const dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  const SPEED_WINDOW_MS = 10000; // скорость — по окну ≥ 10 с вокруг точки: GPS-дрожание не даёт пиков
  const SLOPE_WINDOW_M = 60;     // уклон — по окну ≥ 60 м вокруг точки
  const ELE_STEP = 2;            // набор/сброс: гистерезис 2 м, как в виджетах
  const MOVE_KMH = 2;            // медленнее — стоянка (дрожание стоящего GPS даёт 0.5–1.5 км/ч)
  const STOP_MIN_MS = 60000;     // стоянка в списке — от минуты
  const GAP_MS = 300000;         // разрыв записи > 5 мин на месте — тоже стоянка

  /**
   * Ряды по точкам: dist (м от начала), t (мс | null), ele (м | null), speed (км/ч | null), slope (% | null).
   * points — [{lat,lng}], pointsData — [{time?, ele?, speed? (м/с)}] (как у треков приложения).
   */
  function series(points, pointsData) {
    const pts = points || [], pd = pointsData || [];
    const n = pts.length;
    const dist = new Array(n), t = new Array(n), ele = new Array(n), speed = new Array(n), slope = new Array(n);
    let d = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) d += haversine(pts[i - 1], pts[i]);
      dist[i] = d;
      const tm = pd[i]?.time ? Date.parse(pd[i].time) : NaN;
      t[i] = Number.isFinite(tm) ? tm : null;
      const e = pd[i]?.ele == null ? NaN : Number(pd[i].ele);
      ele[i] = Number.isFinite(e) ? e : null;
    }
    for (let i = 0; i < n; i++) {
      const rec = pd[i]?.speed == null ? NaN : Number(pd[i].speed);
      if (Number.isFinite(rec)) { speed[i] = rec * 3.6; continue; }
      speed[i] = null;
      if (t[i] == null) continue;
      let a = i, b = i;
      while ((a > 0 || b < n - 1) && !(t[a] != null && t[b] != null && t[b] - t[a] >= SPEED_WINDOW_MS)) {
        if (a > 0) a--;
        if (b < n - 1) b++;
      }
      if (t[a] != null && t[b] != null && t[b] > t[a]) speed[i] = (dist[b] - dist[a]) / ((t[b] - t[a]) / 1000) * 3.6;
    }
    for (let i = 0; i < n; i++) {
      slope[i] = null;
      if (ele[i] == null) continue;
      // окно по расстоянию ±SLOPE_WINDOW_M/2; стоянка (точки на одном месте) входит в окно целиком
      let a = i, b = i;
      const half = SLOPE_WINDOW_M / 2;
      while (a > 0 && dist[i] - dist[a] < half) a--;
      while (b < n - 1 && dist[b] - dist[i] < half) b++;
      while (a > 0 && dist[a] - dist[a - 1] < 1) a--;
      while (b < n - 1 && dist[b + 1] - dist[b] < 1) b++;
      // наклон прямой МНК «высота от расстояния» по точкам окна: дрейф высоты GPS на стоянке
      // (много точек в одном месте) почти не влияет, в отличие от разности крайних точек
      // точки сначала усредняются по 5-метровым корзинам расстояния: стоянка — одна точка, а не облако
      const bins = new Map();
      for (let j = a; j <= b; j++) {
        if (ele[j] == null) continue;
        const key = Math.floor(dist[j] / 5), v = bins.get(key) || { d: 0, e: 0, c: 0 };
        v.d += dist[j]; v.e += ele[j]; v.c++;
        bins.set(key, v);
      }
      let k = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const v of bins.values()) {
        const x = v.d / v.c, y = v.e / v.c;
        k++; sx += x; sy += y; sxx += x * x; sxy += x * y;
      }
      const den = k * sxx - sx * sx;
      if (k >= 2 && dist[b] - dist[a] >= SLOPE_WINDOW_M / 2 && den > 0) slope[i] = (k * sxy - sx * sy) / den * 100;
    }
    const hasTime = t.filter(x => x != null).length >= 2 && t[n - 1] != null && t[0] != null && t[n - 1] > t[0];
    return { n, points: pts, dist, t, ele, speed, slope, hasTime, hasEle: ele.some(x => x != null) };
  }

  /** Время точки или линейная оценка между ближайшими точками со временем. */
  function timeAtIndex(S, i) {
    if (S.t[i] != null) return S.t[i];
    let a = i, b = i;
    while (a > 0 && S.t[a] == null) a--;
    while (b < S.n - 1 && S.t[b] == null) b++;
    if (S.t[a] == null || S.t[b] == null || S.dist[b] === S.dist[a]) return S.t[a] ?? S.t[b] ?? null;
    return S.t[a] + (S.t[b] - S.t[a]) * (S.dist[i] - S.dist[a]) / (S.dist[b] - S.dist[a]);
  }

  /** Статистика участка i0..i1 (включительно) — для всего трека и для выделения. */
  function stats(S, i0 = 0, i1 = S.n - 1) {
    i0 = Math.max(0, i0); i1 = Math.min(S.n - 1, i1);
    const out = { i0, i1, distM: i1 > i0 ? S.dist[i1] - S.dist[i0] : 0, points: i1 - i0 + 1,
      totalMs: null, movingMs: null, stoppedMs: null, avgKmh: null, movingKmh: null, maxKmh: null,
      eleMin: null, eleMax: null, up: null, down: null, climbPct: null, descentPct: null, avgSlopePct: null, stops: [] };
    // высоты, набор/сброс, крутизна
    let ref = null, first = null, last = null;
    for (let i = i0; i <= i1; i++) {
      const e = S.ele[i];
      if (e != null) {
        if (out.eleMin == null || e < out.eleMin) out.eleMin = e;
        if (out.eleMax == null || e > out.eleMax) out.eleMax = e;
        if (first == null) first = i;
        last = i;
        if (ref == null) { ref = e; out.up = 0; out.down = 0; } else if (e - ref >= ELE_STEP) { out.up += e - ref; ref = e; } else if (ref - e >= ELE_STEP) { out.down += ref - e; ref = e; }
      }
      const s = S.slope[i];
      if (s != null) {
        if (out.climbPct == null || s > out.climbPct) out.climbPct = s;
        if (out.descentPct == null || s < out.descentPct) out.descentPct = s;
      }
    }
    if (first != null && last > first && S.dist[last] > S.dist[first]) out.avgSlopePct = (S.ele[last] - S.ele[first]) / (S.dist[last] - S.dist[first]) * 100;
    // время, движение, стоянки
    const ta = timeAtIndex(S, i0), tb = timeAtIndex(S, i1);
    if (S.hasTime && ta != null && tb != null && tb > ta) {
      out.totalMs = tb - ta;
      let moving = 0, movingDist = 0, run = null;
      const closeRun = i => {
        if (run && run.ms >= STOP_MIN_MS) out.stops.push({ i0: run.i0, i1: i, startMs: run.start, durMs: run.ms, lat: S.points[run.i0].lat, lng: S.points[run.i0].lng });
        run = null;
      };
      for (let i = i0 + 1; i <= i1; i++) {
        const t0 = timeAtIndex(S, i - 1), t1 = timeAtIndex(S, i);
        if (t0 == null || t1 == null || t1 <= t0) continue;
        const dt = t1 - t0, ds = S.dist[i] - S.dist[i - 1];
        const kmh = ds / (dt / 1000) * 3.6;
        const still = kmh < MOVE_KMH || (dt > GAP_MS && kmh < MOVE_KMH * 2);
        if (still) {
          if (!run) run = { i0: i - 1, start: t0, ms: 0 };
          run.ms += dt;
        } else {
          closeRun(i - 1);
          moving += dt; movingDist += ds;
        }
      }
      closeRun(i1);
      out.movingMs = moving;
      out.stoppedMs = out.totalMs - moving;
      out.avgKmh = out.distM / 1000 / (out.totalMs / 3600000);
      out.movingKmh = moving > 0 ? movingDist / 1000 / (moving / 3600000) : null;
    }
    for (let i = i0; i <= i1; i++) {
      const v = S.speed[i];
      if (v != null && (out.maxKmh == null || v > out.maxKmh)) out.maxKmh = v;
    }
    return out;
  }

  /** Отрезки по километрам (последний — неполный): {km, fromM, toM, durMs, avgKmh, up, down}. */
  function kmSplits(S, stepM = 1000) {
    const out = [];
    if (S.n < 2) return out;
    const total = S.dist[S.n - 1];
    // индекс-и-доля по расстоянию, время — интерполяцией
    const timeAtDist = m => {
      let lo = 0, hi = S.n - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S.dist[mid] <= m) lo = mid; else hi = mid; }
      const ta = timeAtIndex(S, lo), tb = timeAtIndex(S, hi);
      if (ta == null || tb == null) return null;
      const span = S.dist[hi] - S.dist[lo];
      return span > 0 ? ta + (tb - ta) * (m - S.dist[lo]) / span : ta;
    };
    const idxAtDist = m => { let i = 0; while (i < S.n - 1 && S.dist[i] < m) i++; return i; };
    for (let k = 0; k * stepM < total; k++) {
      const from = k * stepM, to = Math.min(total, (k + 1) * stepM);
      if (to - from < 1) break;
      const s = stats(S, idxAtDist(from), idxAtDist(to));
      const ta = S.hasTime ? timeAtDist(from) : null, tb = S.hasTime ? timeAtDist(to) : null;
      const durMs = ta != null && tb != null && tb > ta ? tb - ta : null;
      out.push({ km: k + 1, fromM: from, toM: to, durMs, avgKmh: durMs ? (to - from) / 1000 / (durMs / 3600000) : null, up: s.up, down: s.down });
    }
    return out;
  }

  /** Индекс точки ряда с ближайшим x (xs — по возрастанию). */
  function nearestIndex(xs, x) {
    let lo = 0, hi = xs.length - 1;
    if (hi < 0) return -1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    return Math.abs(xs[hi] - x) < Math.abs(x - xs[lo]) ? hi : lo;
  }

  /** «Красивые» деления оси: шаг 1/2/5·10^k, около count штук. */
  function niceTicks(min, max, count = 4) {
    if (!(max > min)) return [min];
    const raw = (max - min) / count, p = 10 ** Math.floor(Math.log10(raw));
    // шаг 1/2/5·10^k, у которого число делений ближе всего к count
    const step = [1, 2, 5, 10].map(m => m * p).reduce((b, s) => (Math.abs((max - min) / s - count) < Math.abs((max - min) / b - count) ? s : b));
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  /** Цвет раскраски: доля 0..1 → синий (низко) → зелёный → жёлтый → красный (высоко). */
  function rampColor(f) {
    const x = Math.max(0, Math.min(1, Number.isFinite(f) ? f : 0));
    return `hsl(${Math.round(220 - 220 * x)}, 85%, 48%)`; // theme-check: data
  }
  /** Границы шкалы раскраски по 5-му и 95-му процентилю: одиночный выброс не съедает всю палитру. */
  function rampRange(values) {
    const v = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!v.length) return null;
    const q = p => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
    const lo = q(0.05), hi = q(0.95);
    return hi > lo ? [lo, hi] : [v[0], v[v.length - 1] > v[0] ? v[v.length - 1] : v[0] + 1];
  }

  // ─── Форматирование ───
  function fmtDist(m) {
    if (!Number.isFinite(m)) return DASH;
    if (m < 1000) return `${Math.round(m)} м`;
    return m < 10000 ? `${(m / 1000).toFixed(2)} км` : `${(m / 1000).toFixed(1)} км`;
  }
  function fmtDur(ms) {
    if (!Number.isFinite(ms)) return DASH;
    const min = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h} ч ${m} мин` : `${m} мин`;
  }
  const fmtKmh = v => (Number.isFinite(v) ? `${v.toFixed(1)} км/ч` : DASH);
  const fmtM = v => (Number.isFinite(v) ? `${Math.round(v)} м` : DASH);
  const fmtPct = v => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : DASH);
  const hhmm = ms => (Number.isFinite(ms) ? new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : DASH);

  const METRICS = {
    ele: { label: 'Высота', unit: 'м', key: 'ele', fmt: v => `${Math.round(v)} м`, ramp: 'ниже … выше' },
    speed: { label: 'Скорость', unit: 'км/ч', key: 'speed', fmt: v => `${v.toFixed(1)} км/ч`, ramp: 'медленно … быстро' },
    slope: { label: 'Уклон', unit: '%', key: 'slope', fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`, ramp: 'спуск … подъём' },
  };

  // ─── Состояние панели ───
  /* global map, tracks, selectedTrackId, trackCanvasRenderer, pushUndo, snapshotTrackGeometry, restoreTrackGeometry,
     removeTrackObject, createTrackFromPoints, touchTrack, updateTrackList, saveState, showToast, cloneTrackPointsData */
  const appMap = () => (typeof map !== 'undefined' ? map : null);
  const trackById = id => { try { return (typeof tracks !== 'undefined' ? tracks : []).find(t => t.id === id) || null; } catch { return null; } };
  const toast = (msg, kind) => (typeof showToast === 'function' ? showToast(msg, kind) : undefined);
  const st = {
    trackId: null, S: null, sig: '', metric: 'ele', axis: 'dist', color: 'none',
    hover: -1, sel: null, drag: null, panel: null, canvas: null, marker: null, colorLayer: null, timer: 0, raf: 0,
  };
  const sigOf = t => `${t.id}|${t.points.length}|${t.updatedAt || ''}|${t.points[0]?.lat}|${t.points[t.points.length - 1]?.lng}`;

  function xs() {
    const S = st.S;
    return st.axis === 'time' && S.hasTime ? S.dist.map((_, i) => timeAtIndex(S, i)) : S.dist;
  }

  function open(id) {
    const t = trackById(id ?? (typeof selectedTrackId !== 'undefined' ? selectedTrackId : null));
    if (!t || (t.points || []).length < 2) { toast('Выберите трек минимум из двух точек'); return; }
    ensurePanel();
    if (st.trackId !== t.id) { clearColoring(); st.sel = null; st.hover = -1; }
    st.trackId = t.id;
    load(t);
    st.panel.hidden = false;
    document.body.classList.add('tna-open');
    renderAll();
    clearInterval(st.timer);
    st.timer = setInterval(checkChanged, 1000);
    window.dispatchEvent(new Event('resize'));
  }
  function close() {
    if (!st.panel) return;
    clearColoring();
    hideMarker();
    st.panel.hidden = true;
    st.trackId = null; st.S = null; st.sel = null;
    document.body.classList.remove('tna-open');
    clearInterval(st.timer);
    window.dispatchEvent(new Event('resize'));
  }
  function load(t) {
    st.S = series(t.points, t.pointsData);
    st.sig = sigOf(t);
    if (st.axis === 'time' && !st.S.hasTime) st.axis = 'dist';
    if (st.metric === 'ele' && !st.S.hasEle && st.S.hasTime) st.metric = 'speed';
  }
  function checkChanged() {
    const t = trackById(st.trackId);
    if (!t || t.points.length < 2) { close(); return; }
    if (sigOf(t) === st.sig) return;
    load(t);
    st.sel = null;
    renderAll();
    if (st.color !== 'none') applyColoring();
  }
  /** Выбор другого трека при открытой панели — панель переходит на него. */
  function onSelect(id) { if (st.trackId != null && id !== st.trackId && trackById(id)) open(id); }

  // ─── Разметка ───
  function ensurePanel() {
    if (st.panel) return;
    injectCss();
    const host = document.getElementById('map') || document.body;
    const p = document.createElement('div');
    p.id = 'tn-track-analysis';
    p.hidden = true;
    p.innerHTML = `
      <div class="tna-head">
        <span class="tna-title" data-tna="title"></span>
        <div class="tna-seg" role="group" aria-label="График" data-tna="metrics">
          ${Object.entries(METRICS).map(([k, m]) => `<button type="button" data-tna-metric="${k}">${m.label}</button>`).join('')}
        </div>
        <div class="tna-seg" role="group" aria-label="Ось X" data-tna="axes">
          <button type="button" data-tna-axis="dist">Расстояние</button><button type="button" data-tna-axis="time">Время</button>
        </div>
        <label class="tna-color">Раскраска
          <select data-tna="color" aria-label="Раскраска трека на карте">
            <option value="none">нет</option><option value="speed">по скорости</option><option value="ele">по высоте</option><option value="slope">по уклону</option>
          </select></label>
        <span class="tna-legend" data-tna="legend" hidden></span>
        <button type="button" class="tn-icon-btn tn-icon-btn-s tna-close" data-tna="close" title="Закрыть анализ" aria-label="Закрыть анализ">${icon('close')}</button>
      </div>
      <div class="tna-body">
        <div class="tna-chart-col">
          <div class="tna-selbar" data-tna="selbar" hidden></div>
          <div class="tna-chart"><canvas data-tna="canvas"></canvas><div class="tna-tip" data-tna="tip" hidden></div>
            <div class="tna-empty" data-tna="empty" hidden></div></div>
        </div>
        <div class="tna-stats" data-tna="stats"></div>
      </div>`;
    ['mousedown', 'pointerdown', 'dblclick', 'wheel', 'contextmenu', 'click'].forEach(ev => p.addEventListener(ev, e => e.stopPropagation()));
    host.appendChild(p);
    st.panel = p;
    st.canvas = p.querySelector('[data-tna="canvas"]');
    p.addEventListener('click', onPanelClick);
    p.querySelector('[data-tna="color"]').addEventListener('change', e => { st.color = e.target.value; applyColoring(); renderHead(); });
    const cv = st.canvas;
    cv.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !st.S) return;
      const i = indexAtEvent(e);
      st.drag = { from: i, x: e.clientX, id: e.pointerId };
      try { cv.setPointerCapture?.(e.pointerId); } catch { /* уже отпущен */ }
    });
    cv.addEventListener('pointermove', e => {
      if (!st.S) return;
      const i = indexAtEvent(e);
      setHover(i, 'chart');
      if (st.drag && Math.abs(e.clientX - st.drag.x) > 3) { st.sel = order(st.drag.from, i); renderSelection(); draw(); }
    });
    const end = e => {
      if (!st.drag) return;
      const moved = Math.abs(e.clientX - st.drag.x) > 3;
      const i = indexAtEvent(e);
      if (moved) { st.sel = order(st.drag.from, i); if (st.sel[1] - st.sel[0] < 1) st.sel = null; }
      st.drag = null;
      if (!moved && e.type === 'pointerup') panTo(i);
      renderSelection(); draw();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { if (!st.drag) setHover(-1, 'chart'); });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => draw()).observe(p.querySelector('.tna-chart'));
    const m = appMap();
    if (m?.on) {
      m.on('mousemove', e => {
        if (st.trackId == null || st.panel.hidden || !st.S) return;
        if (st.raf) return;
        const ll = e.latlng;
        st.raf = (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : f => setTimeout(f, 16))(() => {
          st.raf = 0;
          setHover(nearestOnMap(ll), 'map');
        });
      });
    }
  }
  const order = (a, b) => (a <= b ? [a, b] : [b, a]);

  function onPanelClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tnaMetric) { st.metric = b.dataset.tnaMetric; renderHead(); draw(); return; }
    if (b.dataset.tnaAxis) { if (b.dataset.tnaAxis === 'time' && !st.S?.hasTime) return; st.axis = b.dataset.tnaAxis; renderHead(); draw(); return; }
    if (b.dataset.tna === 'close') { close(); return; }
    if (b.dataset.tnaStop != null) { const s = stats(st.S).stops[+b.dataset.tnaStop]; if (s) { st.sel = [s.i0, s.i1]; renderSelection(); draw(); panTo(s.i0); } return; }
    if (b.dataset.tnaKm != null) { const k = kmSplits(st.S)[+b.dataset.tnaKm]; if (k) { const ia = st.S.dist.findIndex(d => d >= k.fromM); let ib = st.S.dist.findIndex(d => d >= k.toM); if (ib < 0) ib = st.S.n - 1; st.sel = [Math.max(0, ia), ib]; renderSelection(); draw(); panTo(ia); } return; }
    const act = b.dataset.tnaAct;
    if (act === 'clear-sel') { st.sel = null; renderSelection(); draw(); }
    else if (act) segmentAction(act);
  }

  // ─── Заголовок, статистика, участок ───
  function renderAll() { renderHead(); renderStats(); renderSelection(); draw(); }
  function renderHead() {
    const t = trackById(st.trackId), p = st.panel;
    p.querySelector('[data-tna="title"]').textContent = t ? `Анализ: ${t.name || 'трек'}` : 'Анализ трека';
    p.querySelectorAll('[data-tna-metric]').forEach(b => {
      b.classList.toggle('active', b.dataset.tnaMetric === st.metric);
      const has = b.dataset.tnaMetric === 'speed' ? st.S?.hasTime || st.S?.speed.some(v => v != null) : st.S?.hasEle;
      b.disabled = !has;
      b.title = has ? '' : (b.dataset.tnaMetric === 'speed' ? 'В треке нет времени точек' : 'В треке нет высот');
    });
    p.querySelectorAll('[data-tna-axis]').forEach(b => {
      b.classList.toggle('active', b.dataset.tnaAxis === st.axis);
      b.disabled = b.dataset.tnaAxis === 'time' && !st.S?.hasTime;
    });
    p.querySelector('[data-tna="color"]').value = st.color;
    const lg = p.querySelector('[data-tna="legend"]');
    lg.hidden = st.color === 'none';
    if (!lg.hidden) lg.innerHTML = `<span class="tna-ramp"></span>${esc(METRICS[st.color].ramp)}`;
  }
  const row = (k, v) => `<div class="tna-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  function renderStats() {
    const S = st.S, s = stats(S), splits = kmSplits(S);
    const html = [
      '<div class="tna-group">Время</div>',
      row('Всего', fmtDur(s.totalMs)), row('В движении', fmtDur(s.movingMs)), row('На стоянках', fmtDur(s.stoppedMs)),
      row('Старт — финиш', S.hasTime ? `${hhmm(timeAtIndex(S, 0))} — ${hhmm(timeAtIndex(S, S.n - 1))}` : DASH),
      '<div class="tna-group">Расстояние и скорость</div>',
      row('Длина', fmtDist(s.distM)), row('Средняя', fmtKmh(s.avgKmh)), row('Средняя в движении', fmtKmh(s.movingKmh)), row('Максимальная', fmtKmh(s.maxKmh)),
      '<div class="tna-group">Высота</div>',
      row('Мин. / макс.', s.eleMin != null ? `${Math.round(s.eleMin)} / ${Math.round(s.eleMax)} м` : DASH),
      row('Набор / сброс', s.up != null ? `+${Math.round(s.up)} / −${Math.round(s.down)} м` : DASH),
      row('Круче всего вверх', fmtPct(s.climbPct)), row('Круче всего вниз', fmtPct(s.descentPct)),
      `<details class="tna-list"${s.stops.length ? '' : ' hidden'}><summary>Остановки: ${s.stops.length}</summary>`
        + s.stops.map((x, i) => `<button type="button" class="tna-item" data-tna-stop="${i}"><span>${hhmm(x.startMs)}</span><b>${fmtDur(x.durMs)}</b></button>`).join('') + '</details>',
      `<details class="tna-list"${splits.length > 1 ? '' : ' hidden'}><summary>По километрам: ${splits.length}</summary>`
        + '<div class="tna-km-head"><span>км</span><span>время</span><span>скорость</span><span>±высота</span></div>'
        + splits.map((k, i) => `<button type="button" class="tna-item tna-km" data-tna-km="${i}"><span>${k.toM - k.fromM < 999 ? `${k.km}*` : k.km}</span><span>${fmtDur(k.durMs)}</span><span>${Number.isFinite(k.avgKmh) ? k.avgKmh.toFixed(1) : DASH}</span><span>${k.up != null ? `+${Math.round(k.up)}/−${Math.round(k.down)}` : DASH}</span></button>`).join('') + '</details>',
    ];
    st.panel.querySelector('[data-tna="stats"]').innerHTML = html.join('');
  }
  function renderSelection() {
    const bar = st.panel.querySelector('[data-tna="selbar"]');
    if (!st.sel || !st.S) { bar.hidden = true; bar.innerHTML = ''; return; }
    const s = stats(st.S, st.sel[0], st.sel[1]);
    const parts = [fmtDist(s.distM), s.totalMs != null ? fmtDur(s.totalMs) : null, s.avgKmh != null ? `ср. ${fmtKmh(s.avgKmh)}` : null,
      s.up != null ? `+${Math.round(s.up)} / −${Math.round(s.down)} м` : null, s.avgSlopePct != null ? `уклон ${fmtPct(s.avgSlopePct)}` : null].filter(Boolean);
    bar.hidden = false;
    bar.innerHTML = `<span class="tna-sel-info"><b>Участок:</b> ${esc(parts.join(' · '))}</span>
      <button type="button" class="btn-secondary btn-sm" data-tna-act="trim" title="Оставить в треке только этот участок">Обрезать по участку</button>
      <button type="button" class="btn-secondary btn-sm" data-tna-act="split" title="Разрезать трек по краям участка">Разрезать</button>
      <button type="button" class="btn-secondary btn-sm" data-tna-act="extract" title="Новый трек из участка, исходный не меняется">Сохранить отдельно</button>
      <button type="button" class="tn-icon-btn tn-icon-btn-s" data-tna-act="clear-sel" title="Снять выделение" aria-label="Снять выделение">${icon('close')}</button>`;
  }

  // ─── Действия с участком (с отменой через Ctrl+Z, как прочие правки трека) ───
  function segmentAction(act) {
    const t = trackById(st.trackId);
    if (!t || !st.sel) return;
    const [a, b] = st.sel;
    const pd = t.pointsData || [];
    const slicePd = (x, y) => (pd.length ? (typeof cloneTrackPointsData === 'function' ? cloneTrackPointsData(pd.slice(x, y + 1)) : pd.slice(x, y + 1).map(o => ({ ...o }))) : []);
    if (b - a < 1) { toast('Участок слишком короткий'); return; }
    if (act === 'trim') {
      if (a === 0 && b === t.points.length - 1) { toast('Выделен весь трек — обрезать нечего'); return; }
      pushUndo({ type: 'trackGeometry', track: t, snapshot: snapshotTrackGeometry(t) });
      const snap = { points: t.points.slice(a, b + 1), pointsData: slicePd(a, b), updatedAt: t.updatedAt, source: t.source, syncedAt: t.syncedAt };
      restoreTrackGeometry(t, snap);
      touchTrack(t);
      done(t.id, 'Трек обрезан по участку (Ctrl+Z — вернуть)');
    } else if (act === 'split') {
      const cuts = [a > 0 ? a : null, b < t.points.length - 1 ? b : null].filter(x => x != null);
      if (!cuts.length) { toast('Выделен весь трек — разрезать негде'); return; }
      const bounds = [0, ...cuts, t.points.length - 1];
      const undo = { type: 'splitTrack', originalTrack: t, snapshot: snapshotTrackGeometry(t), originalIndex: tracks.indexOf(t) };
      const parts = [];
      for (let k = 1; k < bounds.length; k++) parts.push([bounds[k - 1], bounds[k]]);
      const { color, width, pointSize } = t;
      removeTrackObject(t);
      undo.createdTracks = parts.map(([x, y], k) => {
        const nt = createTrackFromPoints(t.points.slice(x, y + 1), `${t.name} (${k + 1})`, { color, width, pointSize });
        nt.pointsData = slicePd(x, y);
        touchTrack(nt);
        return nt;
      });
      pushUndo(undo);
      const mid = undo.createdTracks[a > 0 ? 1 : 0];
      if (typeof selectedTrackId !== 'undefined') selectedTrackId = mid.id; // eslint-disable-line no-global-assign
      st.trackId = mid.id;
      done(mid.id, `Трек разрезан на ${parts.length} части (Ctrl+Z — вернуть)`);
    } else if (act === 'extract') {
      const nt = createTrackFromPoints(t.points.slice(a, b + 1), `${t.name} — участок`, { color: undefined, width: t.width, pointSize: t.pointSize });
      nt.pointsData = slicePd(a, b);
      touchTrack(nt);
      pushUndo({ type: 'createTrack', track: nt });
      done(t.id, `Участок сохранён отдельным треком «${nt.name}» (Ctrl+Z — убрать)`);
    }
  }
  function done(id, msg) {
    st.sel = null;
    if (typeof updateTrackList === 'function') updateTrackList();
    if (typeof saveState === 'function') saveState();
    const t = trackById(id);
    if (t) { load(t); renderAll(); if (st.color !== 'none') applyColoring(); }
    toast(`✓ ${msg}`);
  }

  // ─── График ───
  function chartBox() {
    const cv = st.canvas, wrap = cv.parentElement;
    const w = Math.max(10, wrap.clientWidth), h = Math.max(10, wrap.clientHeight);
    return { w, h, l: 52, r: 12, t: 10, b: 22 };
  }
  function indexAtEvent(e) {
    const r = st.canvas.getBoundingClientRect?.() || { left: 0 };
    const B = chartBox(), X = xs();
    const x0 = X[0], x1 = X[X.length - 1];
    const fx = (e.clientX - r.left - B.l) / Math.max(1, B.w - B.l - B.r);
    return nearestIndex(X, x0 + Math.max(0, Math.min(1, fx)) * (x1 - x0));
  }
  function cssVar(name, fb) {
    try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb; } catch { return fb; }
  }
  function draw() {
    if (!st.canvas || !st.S || st.panel.hidden) return;
    const S = st.S, M = METRICS[st.metric], vals = S[M.key], X = xs();
    const B = chartBox();
    const dpr = window.devicePixelRatio || 1;
    const cv = st.canvas;
    cv.width = Math.round(B.w * dpr); cv.height = Math.round(B.h * dpr);
    cv.style.width = `${B.w}px`; cv.style.height = `${B.h}px`;
    const g = cv.getContext?.('2d');
    const empty = st.panel.querySelector('[data-tna="empty"]');
    const finite = vals.filter(v => v != null);
    empty.hidden = finite.length >= 2;
    empty.textContent = st.metric === 'ele' ? 'В треке нет высот' : st.metric === 'speed' ? 'В треке нет времени точек — скорость не посчитать' : 'Нет высот — уклон не посчитать';
    if (!g || finite.length < 2) { g?.clearRect(0, 0, cv.width, cv.height); return; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, B.w, B.h);
    let lo = Math.min(...finite), hi = Math.max(...finite);
    if (st.metric === 'speed') lo = Math.min(0, lo);
    if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
    const pad = (hi - lo) * 0.06; lo -= st.metric === 'speed' && lo === 0 ? 0 : pad; hi += pad;
    const x0 = X[0], x1 = X[X.length - 1] > x0 ? X[X.length - 1] : x0 + 1;
    const W = B.w - B.l - B.r, H = B.h - B.t - B.b;
    const px = x => B.l + (x - x0) / (x1 - x0) * W, py = v => B.t + (1 - (v - lo) / (hi - lo)) * H;
    const cText = cssVar('--text-muted', 'gray'), cGrid = cssVar('--border', 'gray'), cLine = cssVar('--primary', 'dodgerblue');
    g.font = '11px sans-serif'; g.fillStyle = cText; g.strokeStyle = cGrid; g.lineWidth = 1;
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const v of niceTicks(lo, hi, 4)) {
      const y = Math.round(py(v)) + 0.5;
      g.globalAlpha = 0.5; g.beginPath(); g.moveTo(B.l, y); g.lineTo(B.l + W, y); g.stroke(); g.globalAlpha = 1;
      g.fillText(st.metric === 'speed' ? `${+v.toFixed(1)}` : st.metric === 'slope' ? `${+v.toFixed(1)}%` : `${Math.round(v)}`, B.l - 6, y);
    }
    g.textAlign = 'center'; g.textBaseline = 'top';
    const tickX = st.axis === 'time' ? niceTimeTicks(x0, x1) : niceTicks(x0 / 1000, x1 / 1000, 6).map(v => v * 1000);
    for (const v of tickX) {
      const x = px(v);
      if (x < B.l - 1 || x > B.l + W + 1) continue;
      g.fillText(st.axis === 'time' ? hhmm(v) : `${+(v / 1000).toFixed(2)} км`, x, B.t + H + 5);
    }
    // выделение
    if (st.sel) {
      g.fillStyle = cLine; g.globalAlpha = 0.14;
      g.fillRect(px(X[st.sel[0]]), B.t, px(X[st.sel[1]]) - px(X[st.sel[0]]), H);
      g.globalAlpha = 1;
    }
    // линия и заливка; пропуски значений — разрывы
    g.strokeStyle = cLine; g.lineWidth = 1.6; g.fillStyle = cLine;
    let path = [];
    const flush = () => {
      if (path.length > 1) {
        g.beginPath(); path.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        g.globalAlpha = 0.12; g.lineTo(path[path.length - 1][0], B.t + H); g.lineTo(path[0][0], B.t + H); g.closePath(); g.fill(); g.globalAlpha = 1;
      }
      path = [];
    };
    // прореживание до ширины графика: на 50 тыс. точек — те же ~2 точки на пиксель
    const step = Math.max(1, Math.floor(vals.length / (W * 2)));
    for (let i = 0; i < vals.length; i += step) {
      if (vals[i] == null || X[i] == null) { flush(); continue; }
      path.push([px(X[i]), py(vals[i])]);
    }
    if (vals[vals.length - 1] != null && X[vals.length - 1] != null) path.push([px(X[vals.length - 1]), py(vals[vals.length - 1])]);
    flush();
    if (st.metric === 'slope' && lo < 0 && hi > 0) { g.strokeStyle = cText; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(B.l, py(0)); g.lineTo(B.l + W, py(0)); g.stroke(); g.globalAlpha = 1; }
    // указатель
    const tip = st.panel.querySelector('[data-tna="tip"]');
    if (st.hover >= 0 && st.hover < S.n && X[st.hover] != null) {
      const x = px(X[st.hover]);
      g.strokeStyle = cText; g.lineWidth = 1; g.beginPath(); g.moveTo(x, B.t); g.lineTo(x, B.t + H); g.stroke();
      if (vals[st.hover] != null) { g.fillStyle = cLine; g.beginPath(); g.arc(x, py(vals[st.hover]), 3.5, 0, 2 * Math.PI); g.fill(); }
      tip.hidden = false;
      tip.innerHTML = tipHtml(st.hover);
      const tw = tip.offsetWidth || 160;
      tip.style.left = `${Math.min(B.w - tw - 4, Math.max(4, x + 10))}px`;
      tip.style.top = `${B.t + 2}px`;
    } else tip.hidden = true;
  }
  function niceTimeTicks(t0, t1) {
    const span = t1 - t0, steps = [5, 10, 15, 30, 60, 120, 180, 360, 720].map(m => m * 60000);
    const step = steps.find(s => span / s <= 6) || 1440 * 60000;
    const out = [];
    const off = new Date(t0).getTimezoneOffset() * 60000; // деления по местному времени
    for (let v = Math.ceil((t0 - off) / step) * step + off; v <= t1; v += step) out.push(v);
    return out;
  }
  function tipHtml(i) {
    const S = st.S, parts = [`<b>${fmtDist(S.dist[i])}</b>`];
    const tm = S.hasTime ? timeAtIndex(S, i) : null;
    if (tm != null) parts.push(hhmm(tm));
    if (S.ele[i] != null) parts.push(`${Math.round(S.ele[i])} м`);
    if (S.speed[i] != null) parts.push(fmtKmh(S.speed[i]));
    if (S.slope[i] != null) parts.push(fmtPct(S.slope[i]));
    return parts.join(' · ');
  }

  // ─── Связь с картой ───
  function setHover(i, from) {
    if (i === st.hover) return;
    st.hover = i;
    draw();
    if (i < 0) { hideMarker(); return; }
    const p = st.S?.points[i];
    const m = appMap();
    if (!p || !m || !window.L) return;
    if (!st.marker) st.marker = L.circleMarker(p, { radius: 6, weight: 2, color: cssVar('--background', 'white'), fillColor: cssVar('--primary', 'dodgerblue'), fillOpacity: 1, interactive: false });
    st.marker.setLatLng(p);
    if (!m.hasLayer(st.marker)) st.marker.addTo(m);
    void from;
  }
  function hideMarker() { const m = appMap(); if (st.marker && m?.hasLayer(st.marker)) m.removeLayer(st.marker); }
  function panTo(i) {
    const p = st.S?.points[i], m = appMap();
    if (p && m?.panTo) m.panTo(p);
    setHover(i, 'chart');
  }
  const MAP_HIT_PX = 24;
  /** Ближайшая к курсору точка трека в пикселях экрана; -1 — дальше MAP_HIT_PX. */
  function nearestOnMap(ll) {
    const m = appMap();
    if (!m?.latLngToContainerPoint || !ll) return -1;
    const c = m.latLngToContainerPoint(ll);
    let best = -1, bd = MAP_HIT_PX * MAP_HIT_PX;
    const P = st.S.points;
    for (let i = 0; i < P.length; i++) {
      const q = m.latLngToContainerPoint(P[i]);
      const d = (q.x - c.x) ** 2 + (q.y - c.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // ─── Раскраска трека на карте ───
  const RAMP_STEPS = 24;
  const PANEL_H = 260; // высота панели; полоса виджетов и нижние кнопки Leaflet поднимаются на неё
  function clearColoring() {
    const m = appMap(), t = trackById(st.trackId);
    if (st.colorLayer && m?.hasLayer(st.colorLayer)) m.removeLayer(st.colorLayer);
    st.colorLayer = null;
    if (t?.polyline?.setStyle) t.polyline.setStyle({ opacity: 0.85 });
  }
  /** Отрезки одного цвета подряд — одна линия: на 10 тыс. точек — сотни слоёв, не тысячи. */
  function coloredRuns(S, metric) {
    const vals = S[metric];
    const range = rampRange(vals);
    if (!range) return [];
    const [lo, hi] = range;
    const bucket = v => (v == null ? -1 : Math.round(Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * (RAMP_STEPS - 1)));
    const runs = [];
    let cur = null;
    for (let i = 1; i < S.n; i++) {
      const k = bucket(vals[i] ?? vals[i - 1]);
      if (!cur || cur.k !== k) { cur = { k, pts: [S.points[i - 1]] }; runs.push(cur); }
      cur.pts.push(S.points[i]);
    }
    return runs.map(r => ({ color: r.k < 0 ? null : rampColor(r.k / (RAMP_STEPS - 1)), pts: r.pts }));
  }
  function applyColoring() {
    clearColoring();
    const t = trackById(st.trackId), m = appMap();
    if (!t || !m || !window.L || st.color === 'none' || !st.S) return;
    const runs = coloredRuns(st.S, st.color);
    if (!runs.length) { toast(st.color === 'speed' ? 'Нет времени точек — раскрасить по скорости нельзя' : 'Нет высот — раскрасить нельзя'); return; }
    const opts = { weight: (t.width || 3) + 2, opacity: 0.95, interactive: false, renderer: typeof trackCanvasRenderer !== 'undefined' ? trackCanvasRenderer : undefined };
    st.colorLayer = L.layerGroup(runs.filter(r => r.color).map(r => L.polyline(r.pts, { ...opts, color: r.color })));
    st.colorLayer.addTo(m);
    if (t.polyline?.setStyle) t.polyline.setStyle({ opacity: 0.25 });
  }

  function injectCss() {
    if (document.getElementById('tn-track-analysis-css')) return;
    const s = document.createElement('style');
    s.id = 'tn-track-analysis-css';
    s.textContent = `
      #tn-track-analysis { position: absolute; left: 0; right: 0; bottom: 0; height: ${PANEL_H}px; z-index: 950;
        display: flex; flex-direction: column; background: var(--surface); color: var(--text-primary);
        border-top: 1px solid var(--border); box-shadow: var(--shadow-2); font-size: 12px; cursor: default; }
      #tn-track-analysis[hidden] { display: none; }
      body.tna-open #tn-widgets { bottom: ${PANEL_H}px; }
      body.tna-open #tn-widgets-toggle { bottom: ${PANEL_H + 12}px; }
      body.tna-open.tn-widgets-on #tn-widgets-toggle { bottom: ${PANEL_H + 16}px; }
      body.tna-open .leaflet-bottom { bottom: ${PANEL_H}px; }
      body.tna-open.tn-widgets-on .leaflet-bottom { bottom: calc(${PANEL_H}px + var(--tn-widgets-bottom, 58px)); }
      #tn-track-analysis [hidden] { display: none !important; }
      .tna-head { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
      .tna-title { font-weight: 600; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .tna-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
      .tna-seg button { border: 0; background: transparent; color: var(--text-secondary); padding: 3px 9px; font: inherit; cursor: pointer; }
      .tna-seg button + button { border-left: 1px solid var(--border); }
      .tna-seg button.active { background: var(--primary); color: var(--on-primary); }
      .tna-seg button:disabled { opacity: 0.4; cursor: default; }
      .tna-color { display: inline-flex; align-items: center; gap: 6px; color: var(--text-secondary); }
      .tna-legend { display: inline-flex; align-items: center; gap: 6px; color: var(--text-muted); }
      .tna-ramp { width: 70px; height: 8px; border-radius: 4px;
        background: linear-gradient(90deg, ${rampColor(0)}, ${rampColor(0.33)}, ${rampColor(0.66)}, ${rampColor(1)}); } /* theme-check: data */
      .tna-close { margin-left: auto; }
      .tna-body { flex: 1; min-height: 0; display: flex; }
      .tna-chart-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .tna-selbar { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
      .tna-sel-info { margin-right: auto; }
      .tna-chart { position: relative; flex: 1; min-height: 0; }
      .tna-chart canvas { position: absolute; inset: 0; cursor: crosshair; touch-action: none; }
      .tna-tip { position: absolute; pointer-events: none; background: var(--surface-top); border: 1px solid var(--border);
        border-radius: 6px; padding: 3px 7px; white-space: nowrap; box-shadow: var(--shadow-2); }
      .tna-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
      .tna-stats { width: 300px; flex: none; overflow-y: auto; border-left: 1px solid var(--border); padding: 4px 10px 8px; }
      .tna-group { margin: 8px 0 2px; color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
      .tna-row { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
      .tna-row span { color: var(--text-secondary); }
      .tna-list { margin-top: 8px; }
      .tna-list summary { cursor: pointer; color: var(--text-secondary); }
      .tna-item { display: flex; justify-content: space-between; width: 100%; border: 0; background: transparent; color: inherit;
        font: inherit; padding: 2px 4px; border-radius: 4px; cursor: pointer; text-align: left; }
      .tna-item:hover { background: var(--bg-hover); }
      .tna-km, .tna-km-head { display: grid; grid-template-columns: 32px 1fr 1fr 1fr; gap: 4px; }
      .tna-km-head { color: var(--text-muted); font-size: 11px; padding: 2px 4px; }`;
    document.head.appendChild(s);
  }

  window.TnTrackAnalysis = {
    open, close, onSelect,
    isOpen: () => st.trackId != null && !!st.panel && !st.panel.hidden,
    calc: { haversine, series, stats, kmSplits, timeAtIndex, nearestIndex, niceTicks, rampColor, rampRange, coloredRuns },
    _st: st, _setHover: setHover, _segmentAction: segmentAction, _applyColoring: applyColoring,
  };
})();
