/*
 * Порядок разделов окна «Карта и слои» (Андрей 09.10): раздел берут за заголовок и переносят выше/ниже —
 * «Мои карты» вниз или наверх, «Premium» над «Бесплатными» и т. п. «Слои поверх» всегда сверху.
 * Заголовок раздела помечен data-sec; при запуске раздел (заголовок + всё до следующего заголовка) оборачивается
 * в <div class="tnd-sec" data-sec>, и обёртки переставляются. Порядок — localStorage tnd-section-order.
 * Жест как у строк карт (tn-layer-order.js): удержание ~250 мс или сдвиг больше 5 px; клик по «+ Добавить»,
 * «Карты областей» и т. п. внутри заголовка работает как раньше.
 */
(function (root) {
  'use strict';

  const LS_KEY = 'tnd-section-order';
  const DEFAULT = ['tnmaps', 'free', 'premium', 'overlay', 'offline', 'custom'];
  const HOLD_MS = 250;
  const MOVE_PX = 5;

  // ═══ Модель (чистые функции — tests/section-order.test.mjs) ═══
  /** Сохранённый порядок → полный: известные разделы в сохранённом порядке, остальные — следом в исходном. */
  function normalize(saved, all = DEFAULT) {
    const known = new Set(all);
    const seen = new Set();
    const head = (Array.isArray(saved) ? saved : []).map(String).filter(k => known.has(k) && !seen.has(k) && seen.add(k));
    if (!head.length) return all.slice();
    // раздела нет в сохранённом порядке (появился в новой версии) — в конец, в исходном порядке
    const out = head.concat(all.filter(k => !seen.has(k)));
    return out;
  }
  /** Перенести key перед/после target. */
  function move(order, key, target, after) {
    if (key === target) return order.slice();
    const out = order.filter(k => k !== key);
    const i = out.indexOf(target);
    if (i < 0) return order.slice();
    out.splice(after ? i + 1 : i, 0, key);
    return out;
  }
  const isDefault = order => order.join() === DEFAULT.join();

  let storage = () => root.localStorage;
  function load() {
    try { return normalize(JSON.parse(storage()?.getItem(LS_KEY) || 'null')); } catch { return DEFAULT.slice(); }
  }
  function save(order) {
    try {
      if (isDefault(order)) storage()?.removeItem(LS_KEY);
      else storage()?.setItem(LS_KEY, JSON.stringify(order));
    } catch { /* приватный режим */ }
  }

  // ═══ DOM ═══
  let body = null;
  const wraps = () => [...body.querySelectorAll(':scope > .tnd-sec[data-sec]')];

  /** Обернуть разделы и расставить по сохранённому порядку. */
  function init(modalBody) {
    body = modalBody || root.document?.querySelector('#modal-layers .modal-body');
    if (!body || body.__secBound) return;
    body.__secBound = true;
    let cur = null;
    [...body.childNodes].forEach(n => {
      const sec = n.nodeType === 1 && n.dataset?.sec;
      if (sec) {
        cur = body.ownerDocument.createElement('div');
        cur.className = 'tnd-sec';
        cur.dataset.sec = sec;
        body.insertBefore(cur, n);
      }
      if (cur && n !== cur) cur.appendChild(n);
    });
    wraps().forEach(w => {
      const h = w.firstElementChild?.classList.contains('layer-section-title') ? w.firstElementChild : w.firstElementChild?.querySelector(':scope > .layer-section-title');
      if (h && !h.title) h.title = 'Перетащите заголовок, чтобы переставить раздел';
    });
    injectCss(body.ownerDocument);
    arrange(load());
    body.addEventListener('pointerdown', onDown);
    const doc = body.ownerDocument;
    doc.addEventListener('pointermove', onMove);
    doc.addEventListener('pointerup', e => finish(e, false));
    doc.addEventListener('pointercancel', e => finish(e, true));
  }
  function arrange(order) {
    const byKey = new Map(wraps().map(w => [w.dataset.sec, w]));
    order.forEach(k => { const w = byKey.get(k); if (w) body.appendChild(w); });
    body.querySelector(':scope > .tnd-sec-reset')?.remove();
    if (!isDefault(order)) {
      body.insertAdjacentHTML('beforeend', '<button type="button" class="tnd-sec-reset" title="Вернуть исходный порядок разделов">Вернуть порядок разделов</button>');
      body.querySelector(':scope > .tnd-sec-reset').addEventListener('click', e => { e.stopPropagation(); reset(); });
    }
  }
  function reset() { save(DEFAULT); arrange(DEFAULT); }

  let drag = null;
  function onDown(e) {
    if (drag || (e.button != null && e.button !== 0)) return;
    const title = e.target.closest?.('[data-sec]');
    const wrap = title?.parentElement;
    if (!title || !wrap?.classList.contains('tnd-sec') || wrap.parentElement !== body) return;
    // заголовок (у «Скачанных карт» — первый ребёнок обёртки-раздела), а не строки внутри раздела
    const head = title.classList.contains('layer-section-title') ? title : title.querySelector(':scope > .layer-section-title');
    if (!head || !head.contains(e.target)) return;
    if (e.target.closest('button, input, select, a, textarea, [onclick]')) return;
    drag = { wrap, key: wrap.dataset.sec, x: e.clientX, y: e.clientY, active: false, moved: false, target: null, after: false };
    drag.timer = setTimeout(() => { if (drag && drag.wrap === wrap) start(); }, HOLD_MS);
  }
  function start() {
    if (!drag || drag.active) return;
    drag.active = true;
    clearTimeout(drag.timer);
    drag.wrap.classList.add('tnd-sec-dragging');
    body.classList.add('tnd-sec-drag-on');
  }
  function clearMarks() { body.querySelectorAll('.tnd-sec-before, .tnd-sec-after').forEach(n => n.classList.remove('tnd-sec-before', 'tnd-sec-after')); }
  function onMove(e) {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > MOVE_PX) drag.moved = true;
    if (!drag.active) { if (drag.moved) start(); else return; }
    e.preventDefault?.();
    clearMarks();
    let target = null, after = false;
    for (const w of wraps()) {
      const b = w.getBoundingClientRect();
      if (!b.height) continue;  // скрытый раздел («Скачанные карты» без карт)
      if (e.clientY < b.top + b.height / 2) { target = w; after = false; break; }
      target = w; after = true;
    }
    // автопрокрутка у краёв окна
    const r = body.getBoundingClientRect();
    if (e.clientY < r.top + 24) body.scrollTop -= 12; else if (e.clientY > r.bottom - 24) body.scrollTop += 12;
    if (!target || target === drag.wrap) { drag.target = null; return; }
    drag.target = target; drag.after = after;
    target.classList.add(after ? 'tnd-sec-after' : 'tnd-sec-before');
  }
  function finish(e, cancelled) {
    if (!drag) return;
    const d = drag; drag = null;
    clearTimeout(d.timer);
    if (!d.active) return;
    d.wrap.classList.remove('tnd-sec-dragging');
    body.classList.remove('tnd-sec-drag-on');
    clearMarks();
    if (!cancelled && d.target) {
      const next = move(wraps().map(w => w.dataset.sec), d.key, d.target.dataset.sec, d.after);
      save(normalize(next));
      arrange(normalize(next));
    }
    const kill = ev => { ev.stopPropagation(); ev.preventDefault(); };
    body.addEventListener('click', kill, { capture: true, once: true });
    setTimeout(() => body.removeEventListener('click', kill, { capture: true }), 0);
  }

  function injectCss(doc) {
    if (doc.getElementById('tnd-sec-style')) return;
    const st = doc.createElement('style');
    st.id = 'tnd-sec-style';
    st.textContent = `
      .tnd-sec > .layer-section-title[data-sec], .tnd-sec > [data-sec] > .layer-section-title { cursor:grab; }
      .tnd-sec-drag-on, .tnd-sec-drag-on * { user-select:none; -webkit-user-select:none; cursor:grabbing !important; }
      .tnd-sec.tnd-sec-dragging { opacity:0.55; outline:1px dashed var(--primary); outline-offset:2px; border-radius:var(--radius-xs); }
      .tnd-sec.tnd-sec-before { box-shadow:0 -3px 0 0 var(--primary); }
      .tnd-sec.tnd-sec-after { box-shadow:0 3px 0 0 var(--primary); }
      .tnd-sec-reset { display:block; margin:10px auto 2px; appearance:none; background:none; border:0; font:inherit;
        font-size:var(--fs-xs); color:var(--primary-text); cursor:pointer; }
      .tnd-sec-reset:hover { text-decoration:underline; }
    `;
    doc.head.appendChild(st);
  }

  const api = { LS_KEY, DEFAULT, HOLD_MS, MOVE_PX, normalize, move, load, save, init, reset, _setStorage: fn => { storage = fn; } };
  root.TnSectionOrder = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => init());
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
