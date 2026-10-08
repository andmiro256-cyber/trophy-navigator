/*
 * Свой порядок карт в списках окна «Карта и слои» (решение Андрея 08.10): строку карты берут мышью и
 * переносят выше/ниже. Разделы — «Бесплатные» (free), «Premium» (premium), «Мои карты» (custom);
 * TrophyNav Maps — свой модуль, здесь не трогается.
 *
 * Порядок хранится в localStorage (tnd-layer-order) по ключу карты: у карты каталога — e.key, у зашитой — имя,
 * у своей карты — её id. Сортировка — только внутри группы между подзаголовками («ГГЦ / Генштаб (nakarte.me)»
 * и т. п.), поэтому подзаголовки не ломаются; карты, которых нет в сохранённом порядке (новые в каталоге), —
 * в конце своей группы в исходном порядке. Зашитая карта и её эквивалент в каталоге — одна карта (aliases).
 *
 * Жест: нажатие на строку и удержание ~250 мс или сдвиг больше 5 px. Короткий клик — выбор карты, как раньше:
 * на pointerdown строки не пересоздаются (WebKit не шлёт click, если узел mousedown удалён до mouseup), а
 * click после настоящего перетаскивания гасится в фазе захвата.
 */
(function (root) {
  'use strict';

  const LS_KEY = 'tnd-layer-order';
  const SECTIONS = ['free', 'premium', 'custom'];
  const HOLD_MS = 250;
  const MOVE_PX = 5;

  // ═══ Модель (чистые функции — tests/layers-order.test.mjs) ═══
  function normalizeOrders(raw) {
    const out = {};
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    SECTIONS.forEach(s => {
      const list = Array.isArray(src[s]) ? src[s] : [];
      const seen = new Set();
      const keys = list.map(k => String(k ?? '')).filter(k => k && !seen.has(k) && seen.add(k));
      if (keys.length) out[s] = keys;
    });
    return out;
  }

  /**
   * Строки раздела ({title} или {id,…}) в пользовательском порядке. Подзаголовки остаются на месте,
   * карты переставляются внутри своей группы. aliases(id) — все имена той же карты.
   */
  function applyOrder(rows, order, aliases) {
    if (!Array.isArray(rows)) return [];
    const keys = Array.isArray(order) ? order.map(String) : [];
    if (!keys.length) return rows.slice();
    const rankOf = new Map(keys.map((k, i) => [k, i]));
    const rank = row => {
      const names = typeof aliases === 'function' ? [row.id, ...(aliases(row.id) || [])] : [row.id];
      let best = Infinity;
      names.forEach(n => { const r = rankOf.get(String(n)); if (r != null && r < best) best = r; });
      return best;
    };
    const out = [];
    let group = [];
    const flush = () => {
      group.map((row, i) => ({ row, i, r: rank(row) }))
        .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
        .forEach(x => out.push(x.row));
      group = [];
    };
    rows.forEach(row => {
      if (row && row.title) { flush(); out.push(row); } else group.push(row);
    });
    flush();
    return out;
  }

  /** Ключи раздела после переноса fromKey перед (after=false) или после toKey. */
  function moveKey(keys, fromKey, toKey, after) {
    const list = (keys || []).map(String).filter(k => k !== String(fromKey));
    const at = list.indexOf(String(toKey));
    if (at < 0 || String(fromKey) === String(toKey)) return (keys || []).map(String);
    list.splice(after ? at + 1 : at, 0, String(fromKey));
    return list;
  }

  // ═══ Хранилище ═══
  let storage = () => { try { return root.localStorage || null; } catch { return null; } };
  function readOrders() {
    try { return normalizeOrders(JSON.parse(storage()?.getItem(LS_KEY) || 'null')); } catch { return {}; }
  }
  function writeOrders(orders) {
    try { storage()?.setItem(LS_KEY, JSON.stringify(normalizeOrders(orders))); } catch { /* приватный режим, квота */ }
  }
  const getOrder = section => readOrders()[section] || [];
  const hasOrder = section => getOrder(section).length > 0;
  function setOrder(section, keys) {
    const all = readOrders();
    if (keys && keys.length) all[section] = keys; else delete all[section];
    writeOrders(all);
  }

  // Полный порядок ключей раздела на последней отрисовке (включая скрытые карты) — основа для переноса
  const lastKeys = {};
  /** Применить порядок к строкам раздела перед отрисовкой. */
  function apply(section, rows, aliases) {
    const sorted = applyOrder(rows, getOrder(section), aliases);
    lastKeys[section] = sorted.filter(r => r && !r.title && r.id != null).map(r => String(r.id));
    return sorted;
  }

  // ═══ Перетаскивание ═══
  const bound = new Map(); // container → { section, rerender }
  let drag = null;
  let deferred = [];
  // Пока кнопка мыши нажата на строке (даже без перетаскивания), строки не пересоздаются: иначе WebKit съест click
  const busy = () => !!drag;
  /** Перерисовка, пришедшая во время нажатия (каталог загрузился), — после отпускания. true — отложена. */
  function whenIdle(fn) {
    if (busy()) { if (!deferred.includes(fn)) deferred.push(fn); return true; }
    return false;
  }

  const rowsOf = container => [...container.querySelectorAll(':scope > .base-layer[data-order-key]')];
  /** Строки группы строки row: соседи между подзаголовками. */
  function groupOf(row) {
    const out = [row];
    for (let n = row.previousElementSibling; n && !n.classList.contains('layer-section-title'); n = n.previousElementSibling) {
      if (n.matches('.base-layer[data-order-key]')) out.unshift(n);
    }
    for (let n = row.nextElementSibling; n && !n.classList.contains('layer-section-title'); n = n.nextElementSibling) {
      if (n.matches('.base-layer[data-order-key]')) out.push(n);
    }
    return out;
  }
  function clearMarks(container) {
    container.querySelectorAll('.lo-drop-before, .lo-drop-after').forEach(n => n.classList.remove('lo-drop-before', 'lo-drop-after'));
  }

  function onPointerDown(e) {
    if (drag || (e.button != null && e.button !== 0)) return;
    const container = e.currentTarget;
    const row = e.target.closest?.('.base-layer[data-order-key]');
    if (!row || row.parentElement !== container) return;
    if (e.target.closest('button, input, select, a, textarea')) return;
    drag = { container, row, key: row.dataset.orderKey, x: e.clientX, y: e.clientY, pointerId: e.pointerId,
      active: false, moved: false, target: null, after: false, timer: null };
    drag.timer = setTimeout(() => { if (drag && drag.row === row) start(); }, HOLD_MS);
  }
  function start() {
    if (!drag || drag.active) return;
    drag.active = true;
    clearTimeout(drag.timer);
    drag.group = groupOf(drag.row);
    drag.row.classList.add('lo-dragging');
    drag.container.classList.add('lo-drag-on');
  }
  function onPointerMove(e) {
    if (!drag) return;
    const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (dist > MOVE_PX) drag.moved = true;
    if (!drag.active) { if (drag.moved) start(); else return; }
    e.preventDefault?.();
    clearMarks(drag.container);
    // Цель — строка группы под указателем: верхняя половина — вставка перед ней, нижняя — после
    const group = drag.group;
    let target = null, after = false;
    for (const r of group) {
      const b = r.getBoundingClientRect();
      if (e.clientY < b.top + b.height / 2) { target = r; after = false; break; }
      target = r; after = true;
    }
    if (!target || target === drag.row) { drag.target = null; return; }
    drag.target = target;
    drag.after = after;
    target.classList.add(after ? 'lo-drop-after' : 'lo-drop-before');
  }
  function finish(e, cancelled) {
    if (!drag) return;
    const d = drag;
    drag = null;
    clearTimeout(d.timer);
    const info = bound.get(d.container);
    let changed = false;
    if (d.active) {
      d.row.classList.remove('lo-dragging');
      d.container.classList.remove('lo-drag-on');
      clearMarks(d.container);
    }
    if (d.active && !cancelled && d.target && info) {
      const keys = lastKeys[info.section] || rowsOf(d.container).map(r => r.dataset.orderKey);
      const next = moveKey(keys, d.key, d.target.dataset.orderKey, d.after);
      changed = next.join('\n') !== keys.join('\n');
      if (changed) setOrder(info.section, next);
    }
    // Было перетаскивание — click по строке (выбор карты) не нужен; короткий клик доходит до строки как раньше
    if (d.active && (changed || d.moved)) suppressClick(d.container);
    const later = deferred;
    deferred = [];
    if (changed && info?.rerender) later.push(info.rerender);
    if (!later.length) return;
    // После click (он идёт за pointerup в той же задаче) — узел под мышью не должен исчезнуть раньше
    setTimeout(() => [...new Set(later)].forEach(fn => { try { fn(); } catch (err) { console.warn('Порядок карт:', err); } }), 0);
  }
  function suppressClick(container) {
    const kill = ev => { ev.stopPropagation(); ev.preventDefault(); };
    container.addEventListener('click', kill, { capture: true, once: true });
    setTimeout(() => container.removeEventListener('click', kill, { capture: true }), 0);
  }

  /** Подключить перетаскивание к контейнеру раздела (один раз). rerender — перерисовать раздел. */
  function bind(container, section, rerender) {
    if (!container || !SECTIONS.includes(section)) return;
    const was = bound.get(container);
    bound.set(container, { section, rerender });
    if (was) return;
    injectCss(container.ownerDocument);
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    // Отпускание где угодно в окне (указатель мог уйти за край списка)
    const doc = container.ownerDocument;
    if (doc && !doc.__loBound) {
      doc.__loBound = true;
      doc.addEventListener('pointerup', e => finish(e, false));
      doc.addEventListener('pointercancel', e => finish(e, true));
      doc.addEventListener('pointermove', e => { if (drag && !drag.container.contains(e.target)) onPointerMove(e); });
    }
  }

  /** Строка «Сбросить порядок» в конце раздела — только когда свой порядок задан. */
  function resetHtml(section) {
    if (!hasOrder(section)) return '';
    return `<button type="button" class="lo-reset" data-order-reset="${section}" onclick="event.stopPropagation();TnLayerOrder.reset('${section}')" title="Вернуть исходный порядок карт раздела">Сбросить порядок</button>`;
  }
  function appendReset(container, section) {
    if (!container) return;
    container.querySelector(':scope > .lo-reset')?.remove();
    const html = resetHtml(section);
    if (html) container.insertAdjacentHTML('beforeend', html);
  }
  function reset(section) {
    setOrder(section, []);
    for (const [, info] of bound) if (info.section === section && info.rerender) info.rerender();
  }

  function injectCss(doc) {
    if (!doc || doc.getElementById('lo-style')) return;
    const st = doc.createElement('style');
    st.id = 'lo-style';
    st.textContent = `
      .lo-drag-on, .lo-drag-on * { user-select:none; -webkit-user-select:none; cursor:grabbing !important; }
      .base-layer.lo-dragging { opacity:0.55; background:var(--primary-soft); outline:1px dashed var(--primary); outline-offset:-1px; }
      .base-layer.lo-drop-before { box-shadow:0 -2px 0 0 var(--primary); }
      .base-layer.lo-drop-after { box-shadow:0 2px 0 0 var(--primary); }
      .lo-reset { appearance:none; background:none; border:0; padding:2px 10px 4px; font:inherit; font-size:var(--fs-xs); color:var(--primary-text); cursor:pointer; }
      .lo-reset:hover { text-decoration:underline; }
    `;
    doc.head.appendChild(st);
  }

  const api = {
    LS_KEY, SECTIONS, HOLD_MS, MOVE_PX,
    normalizeOrders, applyOrder, moveKey,
    getOrder, setOrder, hasOrder, apply, bind, busy, whenIdle, resetHtml, appendReset, reset,
    _setStorage: fn => { storage = fn; },
  };
  root.TnLayerOrder = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
