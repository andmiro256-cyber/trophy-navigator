// Trophy Navigator Desktop — поиск по скачанным картам и голосовой поиск (0.9.31, решение Андрея 09.10).
//
// 1. TnPlaces — названия из скачанных карт TrophyNav Maps (Rust: tnmaps_places → src/places.rs):
//    все населённые пункты области, урочища, высоты. Нечёткое совпадение по «звучанию»: ищется и
//    без интернета, и с ошибками распознавания («Солочя» → Солотча, «у шмор» → Ушмор).
// 2. Голос — кнопка с микрофоном в строке поиска: запись и распознавание Whisper в приложении
//    (Rust: src/voice.rs, модель 57 МБ скачивается один раз). Короткая фраза: «Солотча»,
//    «поехали в Касимов», «найди деревню Ушмор» — служебные слова убираются, падеж приводится.
// Без сервера и платных сервисов. Онлайн-поиск (Photon) работает рядом, как раньше.
(function () {
  'use strict';
  const invoke = (cmd, args) => window.__TAURI_INTERNALS__?.invoke?.(cmd, args) ?? Promise.reject(new Error('нет Tauri'));
  const toast = (m, k) => (typeof window.showToast === 'function' ? window.showToast(m, k) : undefined);
  const RAD = Math.PI / 180;

  // ─── Нормализация и «звучание» ───
  const COMMAND = new Set(['поехали', 'поехать', 'едем', 'ехать', 'поедем', 'езжай', 'найди', 'найти', 'найдите', 'покажи', 'показать',
    'где', 'проложи', 'проложить', 'построй', 'построить', 'маршрут', 'путь', 'дорога', 'дорогу', 'навигация', 'карта', 'пожалуйста',
    'хочу', 'давай', 'нам', 'мне', 'туда', 'в', 'во', 'на', 'до', 'к', 'ко', 'около', 'возле', 'рядом']);
  // «с», «по», «под» не выбрасываем: Whisper режет название на куски («с по склипике» = Спас-Клепики)
  const KIND = new Set(['деревня', 'деревню', 'деревни', 'деревне', 'село', 'села', 'селе', 'селу', 'посёлок', 'поселок', 'посёлка', 'поселка',
    'посёлке', 'поселке', 'город', 'города', 'городе', 'городу', 'урочище', 'урочища', 'хутор', 'хутора', 'станция', 'станцию', 'станции',
    'пгт', 'кордон', 'кордона']);

  /** Фраза → запрос: «Поехали в Касимов!» → «Касимов», «найди деревню у шмор» → «у шмор». */
  function cleanPhrase(text) {
    const words = String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\- ]+/g, ' ').split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < words.length - 1 && (COMMAND.has(words[i]) || KIND.has(words[i]))) i++;
    const rest = words.slice(i).filter((w, k, a) => !(KIND.has(w) && a.length > 1));
    return rest.join(' ');
  }
  /** Варианты падежа последнего слова: «Касимове» → «Касимов», «Солотчу» → «Солотча». */
  function caseVariants(q) {
    const out = new Set([q]);
    const m = q.match(/^(.*?)([а-я]+)$/);
    if (!m) return [...out];
    const [, head, w] = m;
    const add = s => { if (s && s.length >= 3) out.add(head + s); };
    if (/у$/.test(w)) add(w.slice(0, -1) + 'а');
    if (/ю$/.test(w)) add(w.slice(0, -1) + 'я');
    if (/(е|и|ы)$/.test(w)) { add(w.slice(0, -1) + 'а'); add(w.slice(0, -1)); add(w.slice(0, -1) + 'о'); }
    if (/(ом|ой|ем|ей)$/.test(w)) { add(w.slice(0, -2)); add(w.slice(0, -2) + 'а'); }
    if (/а$/.test(w)) add(w.slice(0, -1)); // «до Касимова» → Касимов
    return [...out];
  }
  /** Ключ звучания: без пробелов и дефисов, безударные гласные и глухие/звонкие согласные слиты. */
  function soundKey(s) {
    let k = String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9]/g, '');
    k = k.replace(/[ъь]/g, '')
      .replace(/я$/, 'а').replace(/тч|дч/g, 'ч').replace(/сч|зч/g, 'ш') // «Солотча» звучит «Солоча»
      .replace(/тс|дс|тьс/g, 'ц').replace(/щ/g, 'ш').replace(/ж/g, 'ш')
      .replace(/[оа]/g, 'а').replace(/[еэияы]/g, 'и').replace(/[юу]/g, 'у')
      .replace(/б/g, 'п').replace(/в/g, 'ф').replace(/г/g, 'к').replace(/д/g, 'т').replace(/з/g, 'с')
      .replace(/(.)\1+/g, '$1');
    return k;
  }
  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m || !n) return m || n;
    let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }
  /** Похожесть 0..1 по звучанию; префикс «Спас» против «Спас-Клепики» тоже считается. */
  function similarity(query, name) {
    const a = soundKey(query), b = soundKey(name);
    if (!a || !b) return 0;
    const full = 1 - lev(a, b) / Math.max(a.length, b.length);
    const pre = b.startsWith(a) && a.length >= 4 ? 0.85 + 0.15 * a.length / b.length : 0;
    return Math.max(full, pre);
  }
  function km(a, b) {
    const s = Math.sin((b.lat - a.lat) * RAD / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin((b.lon - a.lon) * RAD / 2) ** 2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  // ─── Названия скачанных карт ───
  const CLASS_W = { city: 1.0, town: 0.97, village: 0.95, suburb: 0.9, hamlet: 0.9, isolated_dwelling: 0.8, locality: 0.85 };
  const places = { byId: new Map(), loading: null };
  function localIds() {
    try { return (window.TrophyNavMaps?._state?.local || []).map(m => m.id).filter(id => id && id !== 'russia-overview'); } catch { return []; }
  }
  async function loadPlaces() {
    const ids = localIds().filter(id => !places.byId.has(id));
    if (!ids.length) return;
    if (places.loading) return places.loading;
    places.loading = (async () => {
      for (const id of ids) {
        try { places.byId.set(id, await invoke('tnmaps_places', { id })); } catch (e) { places.byId.set(id, []); console.warn('places', id, e); }
      }
    })().finally(() => { places.loading = null; });
    return places.loading;
  }
  /** Нечёткий поиск по скачанным картам: [{name, lat, lon, cls, layer, score, km}] лучшие сверху. */
  async function searchLocal(query, { limit = 6, center = null, min = 0.72 } = {}) {
    await loadPlaces();
    const variants = caseVariants(cleanPhrase(query) || String(query || '').toLowerCase());
    const c = center || (typeof map !== 'undefined' && map?.getCenter ? (() => { const x = map.getCenter(); return { lat: x.lat, lon: x.lng }; })() : null);
    const out = [];
    for (const list of places.byId.values()) {
      for (const p of list) {
        let s = 0;
        for (const v of variants) s = Math.max(s, similarity(v, p.n));
        if (s < min) continue;
        const d = c ? km(c, p) : 0;
        const w = p.l === 'place' ? (CLASS_W[p.c] || 0.85) : 0.8;
        // похожесть главное; ближе к карте и крупнее — выше при равной похожести
        out.push({ name: p.n, lat: p.lat, lon: p.lon, cls: p.c, layer: p.l, score: s * w - Math.min(d, 500) / 5000, sim: s, km: d });
      }
    }
    out.sort((a, b) => b.score - a.score);
    const seen = new Set();
    return out.filter(r => { const k = r.name + Math.round(r.lat * 50) + Math.round(r.lon * 50); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit);
  }
  /** Названия рядом с центром карты — подсказка распознавателю (Whisper лучше пишет знакомые слова). */
  async function nearbyNames(n = 60) {
    await loadPlaces();
    if (typeof map === 'undefined' || !map?.getCenter) return [];
    const c = map.getCenter(), cc = { lat: c.lat, lon: c.lng };
    const all = [];
    for (const list of places.byId.values()) for (const p of list) if (p.l === 'place') all.push([km(cc, p), p.n]);
    all.sort((a, b) => a[0] - b[0]);
    return [...new Set(all.slice(0, n * 2).map(x => x[1]))].slice(0, n);
  }

  // ─── Голос ───
  const MIC_SVG = '<svg class="tn-ico tn-ico-s" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  const v = { state: 'idle', timer: 0, btn: null, bar: null, tick: 0, until: 0, hide: 0 };
  /** Плашка под строкой поиска: что сейчас происходит и как отменить (09.10: цвета микрофона мало). */
  function showBar(html, kind = 'info', ms = 0) {
    if (!v.bar) return;
    clearTimeout(v.hide);
    v.bar.className = `tnv-bar tnv-${kind}`;
    v.bar.innerHTML = html;
    v.bar.hidden = false;
    if (ms) v.hide = setTimeout(() => { v.bar.hidden = true; }, ms);
  }
  function hideBar() { if (v.bar) { clearTimeout(v.hide); v.bar.hidden = true; } }
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CANCEL_BTN = '<button type="button" class="tnv-x" data-tnv-cancel title="Отменить (Esc)" aria-label="Отменить">✕</button>';
  function setState(s, title) {
    v.state = s;
    clearInterval(v.tick);
    if (s === 'rec') {
      const draw = () => {
        const left = Math.max(0, Math.ceil((v.until - Date.now()) / 1000));
        showBar(`<span class="tnv-dot"></span><b>Слушаю…</b> скажите название · ещё ${left} с · 🎤 или Enter — готово ${CANCEL_BTN}`, 'rec');
      };
      draw(); v.tick = setInterval(draw, 250);
    } else if (s === 'busy') showBar(`<span class="tnv-spin"></span><b>Распознаю…</b> Esc — отменить ${CANCEL_BTN}`, 'busy');
    else if (s === 'download') showBar(`<span class="tnv-spin"></span>${esc(title || 'Скачиваю модель распознавания…')} ${CANCEL_BTN}`, 'busy');
    if (!v.btn) return;
    v.btn.classList.toggle('tnv-rec', s === 'rec');
    v.btn.classList.toggle('tnv-busy', s === 'busy' || s === 'download');
    v.btn.title = title || (s === 'rec' ? 'Слушаю… нажмите, чтобы закончить' : s === 'busy' ? 'Распознаю…' : 'Голосовой поиск: скажите название');
    v.btn.setAttribute('aria-pressed', String(s === 'rec'));
  }
  async function ensureModel() {
    const st = await invoke('voice_status');
    if (st.model) return true;
    const mb = Math.round((st.size || 6e7) / 1048576);
    const ask = typeof window.tndConfirm === 'function'
      ? await window.tndConfirm(`Для голосового поиска нужна модель распознавания речи (${mb} МБ). Скачать один раз? Дальше голос работает без интернета.`, 'Голосовой поиск')
      : window.confirm(`Скачать модель распознавания речи (${mb} МБ)?`);
    if (!ask) return false;
    setState('download', 'Скачиваю модель распознавания…');
    const ev = window.__TAURI__?.event;
    let un = null;
    if (ev?.listen) un = await ev.listen('voice-model-progress', e => { const p = e.payload || {}; if (p.total) setState('download', `Скачиваю модель распознавания: ${Math.round(p.done / p.total * 100)}%`); });
    try { await invoke('voice_download_model'); showBar('✓ Голосовой поиск готов — нажмите 🎤 и скажите название', 'ok', 4000); return true; } finally { if (un) un(); setState('idle'); }
  }
  async function start() {
    if (v.state !== 'idle') return;
    try {
      if (!(await ensureModel())) return;
      await invoke('voice_start');
      v.until = Date.now() + 4500;
      setState('rec');
      clearTimeout(v.timer);
      v.timer = setTimeout(stop, 4500); // фраза — пара слов; дольше не ждём
    } catch (e) { setState('idle'); showBar(`⚠ ${esc(e?.message || e)}`, 'err', 6000); }
  }
  async function stop() {
    clearTimeout(v.timer);
    if (v.state !== 'rec') return;
    setState('busy');
    try {
      const hint = (await nearbyNames(40).catch(() => [])).join(', ');
      // отменили, пока собирали подсказку: запись уже остановлена voice_cancel — voice_stop не зовём (ревью Тома 2702)
      if (v.state !== 'busy') return;
      const r = await invoke('voice_stop', { prompt: hint });
      if (v.state !== 'busy') return; // отменили, пока распознавалось
      const said = String(r?.text || '').trim();
      v.mic = r ? `микрофон ${Math.round((r.rate || 0) / 1000)} кГц, громкость ${Math.round((r.peak || 0) * 100)}%` : '';
      setState('idle');
      if (!said) { showBar(`Не расслышал — нажмите 🎤 и скажите название ещё раз, чуть громче <span class="tnv-mic">${esc(v.mic || '')}</span>`, 'err', 6000); return; }
      await applyPhrase(said);
    } catch (e) {
      const msg = String(e?.message || e);
      // после отмены поздняя ошибка («запись не идёт», «отменено») не показывается
      if (v.state === 'busy' && !/отменено/.test(msg)) showBar(`⚠ ${esc(msg)}`, 'err', 6000);
    } finally { if (v.state === 'busy') setState('idle'); }
  }
  async function cancel() {
    clearTimeout(v.timer);
    if (v.state === 'idle') return;
    setState('idle');
    showBar('Отменено', 'info', 1500);
    try { await invoke('voice_cancel'); } catch { /* уже закончилось */ }
  }
  /** Распознанная фраза → строка поиска: лучшее совпадение со скачанной картой или очищенная фраза. */
  async function applyPhrase(said) {
    const q = cleanPhrase(said) || said;
    const local = await searchLocal(said, { limit: 1, min: 0.8 }).catch(() => []);
    const best = local[0];
    const input = document.getElementById('search-input');
    const query = best ? best.name : q.replace(/(^|\s)\S/g, s => s.toUpperCase());
    input.value = query;
    const clear = document.getElementById('search-clear');
    if (clear) clear.style.display = 'block';
    const heard = said.replace(/[.!?]+$/, '');
    // голосом ищут, чтобы туда посмотреть: сразу к лучшему результату (Андрей 09.10)
    if (typeof window.nominatimSearch === 'function') {
      await window.nominatimSearch(query);
      const first = document.querySelector('#search-results .search-result-item');
      if (first && typeof window.goToSearchResult === 'function' && typeof window.searchResultArgs === 'function') {
        const args = window.searchResultArgs(first);
        window.goToSearchResult(...args);
        showBar(`🎤 «${esc(heard)}» → <b>${esc(args[2])}</b> <span class="tnv-mic">${esc(v.mic || '')}</span>`, 'ok', 5000);
      } else {
        showBar(`🎤 «${esc(heard)}» — ничего не нашлось. Скажите иначе или впишите вручную <span class="tnv-mic">${esc(v.mic || '')}</span>`, 'err', 7000);
      }
    } else {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function mount() {
    const box = document.querySelector('.toolbar-search-box');
    const input = document.getElementById('search-input');
    if (!box || !input || document.getElementById('search-voice')) return;
    const st = document.createElement('style');
    st.textContent = `
      #search-voice { appearance: none; background: transparent; border: 0; border-radius: var(--radius-xs); color: var(--text-muted);
        cursor: pointer; width: 28px; height: 28px; flex: 0 0 28px; display: inline-flex; align-items: center; justify-content: center; }
      #search-voice:hover { background: var(--bg-hover); color: var(--text-primary); }
      #search-voice.tnv-rec { color: var(--error); animation: tnv-pulse 1s ease-in-out infinite; }
      #search-voice.tnv-busy { color: var(--primary); opacity: 0.7; cursor: progress; }
      @keyframes tnv-pulse { 50% { background: var(--error-soft); } }
      .search-local-tag { font-size: 10px; color: var(--text-muted); margin-left: 6px; }
      .tnv-bar { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 4050; display: flex; align-items: center; gap: 8px;
        padding: 8px 10px; border-radius: var(--radius-m); background: var(--modal-bg); color: var(--text-primary);
        border: 1px solid var(--card-stroke); border-left: 4px solid var(--primary); box-shadow: var(--panel-shadow); font-size: 12px; line-height: 1.35; }
      .tnv-bar[hidden] { display: none; }
      .tnv-bar.tnv-rec { border-left-color: var(--error); }
      .tnv-bar.tnv-ok { border-left-color: var(--success); }
      .tnv-bar.tnv-err { border-left-color: var(--warning); }
      .tnv-mic { color: var(--text-muted); font-size: 10px; }
      .tnv-x { margin-left: auto; appearance: none; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: var(--radius-xs); }
      .tnv-x:hover { background: var(--bg-hover); color: var(--text-primary); }
      .tnv-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--error); flex: none; animation: tnv-blink 1s ease-in-out infinite; }
      .tnv-spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--primary); border-right-color: transparent; flex: none; animation: tnv-rot 0.8s linear infinite; }
      @keyframes tnv-blink { 50% { opacity: 0.25; } }
      @keyframes tnv-rot { to { transform: rotate(360deg); } }`;
    document.head.appendChild(st);
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'search-voice'; b.innerHTML = MIC_SVG;
    b.setAttribute('aria-label', 'Голосовой поиск');
    b.addEventListener('click', () => (v.state === 'rec' ? stop() : v.state === 'idle' ? start() : cancel()));
    box.appendChild(b);
    const bar = document.createElement('div');
    bar.className = 'tnv-bar'; bar.hidden = true; bar.setAttribute('role', 'status'); bar.setAttribute('aria-live', 'polite');
    bar.addEventListener('click', e => { if (e.target.closest('[data-tnv-cancel]')) cancel(); });
    (box.parentElement || box).appendChild(bar);
    v.bar = bar;
    document.addEventListener('keydown', e => {
      if (v.state === 'idle') return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
      else if (e.key === 'Enter' && v.state === 'rec') { e.preventDefault(); e.stopPropagation(); stop(); }
    }, true);
    v.btn = b; setState('idle');
    pinUnderSearch(box);
    // загрузить названия заранее, без спешки: первый поиск не ждёт
    setTimeout(() => loadPlaces().catch(() => {}), 4000);
  }
  /**
   * Список результатов и плашка голоса — position: fixed под строкой поиска. Панель инструментов обрезает
   * всё ниже себя (#toolbar overflow-y: hidden — защита от переполнения на узких экранах), и список
   * результатов с position: absolute лежал ПОД картой: поиск «не работал вообще», находил только Enter (09.10).
   */
  function pinUnderSearch(box) {
    const results = document.getElementById('search-results');
    const place = () => {
      const r = box.getBoundingClientRect();
      if (!r.width) return;
      if (results) {
        const w = Math.max(r.width, Math.min(380, window.innerWidth - 16));
        const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
        Object.assign(results.style, { position: 'fixed', top: `${Math.round(r.bottom + 2)}px`, left: `${Math.round(left)}px`, right: 'auto', width: `${Math.round(w)}px`, zIndex: '4060' });
      }
      if (v.bar) {
        const w = Math.max(r.width, 300);
        const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
        Object.assign(v.bar.style, { position: 'fixed', top: `${Math.round(r.bottom + 4)}px`, left: `${Math.round(left)}px`, right: 'auto', width: `${Math.round(w)}px` });
      }
    };
    place();
    window.addEventListener('resize', place);
    if (typeof ResizeObserver === 'function') new ResizeObserver(place).observe(box);
    // строка раздвигается при вводе и панель прокручивается на узком окне — пересчитать
    box.addEventListener('focusin', () => setTimeout(place, 200));
    document.getElementById('toolbar')?.addEventListener('scroll', place, { passive: true });
    if (results && typeof MutationObserver === 'function') new MutationObserver(place).observe(results, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  window.TnPlaces = { searchLocal, loadPlaces, nearbyNames, cleanPhrase, caseVariants, soundKey, similarity, _places: places, _applyPhrase: applyPhrase, _voice: v, _cancel: cancel, _stop: stop };
})();
