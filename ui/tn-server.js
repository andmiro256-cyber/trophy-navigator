// Trophy Navigator Desktop — окно «Связь с сервером» и правила синхронизации, общие с Android.
//
// 1. Состояние сервера берётся из запросов, которые приложение и так делает (каталог карт, лицензия,
//    синхронизация, Live): fetch к trophynav.ru/api/… наблюдается, новых эндпоинтов нет. Точка на кнопке
//    «Сервер» показывает последний такой ответ. «Обновить состояние» — повторный запрос каталога карт
//    (тот же GET /api/tiles-catalog.json, что при запуске) и проверка лицензии (checkLicenseOnServer).
// 2. «Получить с сервера» только добавляет (как SyncMerge.addMissingByName на Android): объект с названием,
//    которое уже есть на устройстве (trim + без учёта регистра), не заменяется; ничего локального не удаляется;
//    повтор названия в ответе сервера — одна копия.
(function () {
  'use strict';

  const TNServer = {
    apiBase: 'https://trophynav.ru',
    /** Последний ответ trophynav.ru/api: { ok, ms, at, status, path } или null */
    last: null,
    /** Сколько считать наблюдение свежим для точки на кнопке (дольше — серая) */
    staleMs: 30 * 60 * 1000,
  };

  // ─── мелочи ───
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (name, cls) => (typeof window.tnIcon === 'function' ? window.tnIcon(name, cls || 'tn-ico-t') : '');
  const nowMs = () => Date.now();
  function lsGet(key) { try { return window.localStorage.getItem(key); } catch { return null; } }
  function lsSet(key, value) { try { window.localStorage.setItem(key, value); } catch { /* приватный режим */ } }
  function lsJson(key) { const raw = lsGet(key); if (!raw) return null; try { return JSON.parse(raw); } catch { return null; } }

  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }
  const countWord = (n, one, few, many) => `${n} ${plural(n, one, few, many)}`;

  /** «сегодня, 14:05» / «07.10.2026 14:05»; нет даты — «—». */
  function fmtWhen(iso, now = nowMs()) {
    const t = iso ? new Date(iso).getTime() : NaN;
    if (!Number.isFinite(t)) return '—';
    const d = new Date(t), today = new Date(now), p2 = n => String(n).padStart(2, '0');
    const hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
    const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    return sameDay ? `сегодня, ${hm}` : `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${hm}`;
  }
  function fmtDate(iso) {
    const t = iso ? new Date(iso).getTime() : NaN;
    if (!Number.isFinite(t)) return null;
    const d = new Date(t), p2 = n => String(n).padStart(2, '0');
    return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`;
  }
  /** Machine id сокращённо: «A1B2C3…9F0E»; короткий — как есть. */
  function shortId(id) {
    const s = String(id || '').trim();
    if (!s) return '—';
    return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
  }

  // ─── наблюдение за запросами к trophynav.ru/api ───
  function urlOf(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    if (input && typeof input.href === 'string') return input.href;
    return '';
  }
  function isApiUrl(url) { return typeof url === 'string' && url.startsWith(TNServer.apiBase + '/api/'); }

  /** Записать ответ (или его отсутствие) сервера. ok — сервер ответил (код < 500). */
  function note(ok, ms, extra = {}) {
    TNServer.last = { ok: !!ok, ms: Number.isFinite(ms) ? Math.round(ms) : null, at: new Date(extra.at ?? nowMs()).toISOString(),
      status: extra.status ?? null, path: extra.path || '' };
    updateDot();
    if (isPanelOpen()) renderServerSection();
    return TNServer.last;
  }

  function installFetchObserver(win = window) {
    const orig = win.fetch;
    if (typeof orig !== 'function' || orig.__tnServerObserved) return;
    const perf = () => (win.performance && typeof win.performance.now === 'function' ? win.performance.now() : Date.now());
    const observed = function (input, init) {
      const url = urlOf(input);
      if (!isApiUrl(url)) return orig.apply(this, arguments);
      const started = perf();
      const path = url.slice(TNServer.apiBase.length).split('?')[0];
      let p;
      try { p = orig.apply(this, arguments); } catch (e) { note(false, null, { path }); throw e; }
      return Promise.resolve(p).then(resp => {
        note(!!resp && resp.status < 500, perf() - started, { status: resp?.status ?? null, path });
        return resp;
      }, err => {
        note(false, null, { path });
        throw err;
      });
    };
    observed.__tnServerObserved = true;
    win.fetch = observed;
  }

  /** Состояние для точки: 'ok' | 'bad' | 'unknown' (не проверялся или наблюдение старое). */
  function dotState(last = TNServer.last, now = nowMs()) {
    if (!last) return 'unknown';
    const age = now - new Date(last.at).getTime();
    if (!Number.isFinite(age) || age > TNServer.staleMs) return 'unknown';
    return last.ok ? 'ok' : 'bad';
  }
  const DOT_TITLE = { ok: 'Сервер доступен', bad: 'Сервер не отвечает', unknown: 'Связь с сервером не проверялась' };

  function updateDot() {
    const dot = document.getElementById('server-state-dot');
    if (!dot) return;
    const state = dotState();
    dot.className = `server-state-dot ${state}`;
    dot.title = DOT_TITLE[state];
    const btn = dot.closest('button');
    if (btn) btn.title = `Связь с сервером — ${DOT_TITLE[state].toLowerCase()}`;
  }

  // ─── «Получить с сервера»: только добавить ───
  /** Как SyncMerge.nameKey на Android: trim + нижний регистр. */
  function nameKey(name) { return String(name ?? '').trim().toLowerCase(); }

  /** Как SyncMerge.addMissingByName: локальные без изменений и в своём порядке, с сервера — новые названия (первая копия). */
  function addMissingByName(local, server, nameOf) {
    const onDevice = new Set((local || []).map(item => nameKey(nameOf(item))));
    const fromServer = new Set();
    const merged = [...(local || [])];
    let added = 0, skipped = 0, duplicates = 0;
    (server || []).forEach(item => {
      const key = nameKey(nameOf(item));
      if (fromServer.has(key)) { duplicates++; return; }
      fromServer.add(key);
      if (onDevice.has(key)) { skipped++; return; }
      merged.push(item); added++;
    });
    return { merged, added, skipped, duplicates };
  }

  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const validPoint = p => !!p && finite(p.lat) && finite(p.lng);
  const emptyStat = () => ({ added: 0, skipped: 0, duplicates: 0, invalid: 0 });

  /**
   * Слить ответ сервера с локальным состоянием, только добавляя.
   * Локальные точки/треки/маршруты/GPX, наборы, настройки, вид карты и активный набор не меняются.
   * Номера (id) добавленных объектов, совпавшие с локальными, заменяются свободными; ссылки КП→WP в
   * добавленных маршрутах переводятся на итоговые id (точка, пропущенная из-за совпадения названия, —
   * на локальную точку с этим названием).
   * @returns {{ state, stats, added }} added — только добавленные объекты (для файлов в рабочей папке).
   */
  function mergeAddOnly(localState, remoteState, checks = {}, opts = {}) {
    const local = localState || {};
    const remote = remoteState || {};
    const syncTime = opts.syncTime || new Date().toISOString();
    const source = opts.source || remote._source || 'sync';
    const makeWaypointId = opts.makeWaypointId || (() => `wp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
    const mark = item => ({ ...item, source: item.source || source, syncedAt: item.syncedAt || syncTime });
    const list = v => (Array.isArray(v) ? v.filter(item => item && typeof item === 'object') : []);

    const state = {
      ...local,
      counters: { ...(local.counters || {}) },
      waypointSets: list(local.waypointSets).map(s => ({ ...s })),
      waypoints: [...list(local.waypoints)],
      tracks: [...list(local.tracks)],
      routes: [...list(local.routes)],
      gpxFiles: [...list(local.gpxFiles)],
    };
    const stats = { waypoints: emptyStat(), tracks: emptyStat(), routes: emptyStat(), gpx: emptyStat() };
    const added = { waypointSets: [], waypoints: [], tracks: [], routes: [], gpxFiles: [] };
    const counters = state.counters;
    const remoteCounters = remote.counters || {};
    const maxNum = (...values) => Math.max(0, ...values.filter(finite));

    // Точки: server id → итоговый id на устройстве (для ссылок КП→WP)
    const wpIdMap = new Map();
    if (checks.waypoints) {
      const localByKey = new Map();
      state.waypoints.forEach(w => { const k = nameKey(w.name); if (!localByKey.has(k)) localByKey.set(k, w); });
      const usedIds = new Set(state.waypoints.map(w => (w.id == null ? '' : String(w.id))).filter(Boolean));
      const remoteSets = list(remote.waypointSets);
      const localSetByKey = new Map();
      state.waypointSets.forEach(s => { const k = nameKey(s.name); if (!localSetByKey.has(k)) localSetByKey.set(k, s); });
      let nextSetId = maxNum(counters.waypointSetIdCounter, ...state.waypointSets.map(s => s.id + 1), ...remoteSets.map(s => s.id + 1)) || 1;
      const setMap = new Map();
      const newSet = name => {
        const set = { id: nextSetId++, name, visible: true };
        state.waypointSets.push(set); added.waypointSets.push(set);
        localSetByKey.set(nameKey(name), set);
        return set.id;
      };
      const resolveSet = serverSetId => {
        if (setMap.has(serverSetId)) return setMap.get(serverSetId);
        const serverSet = remoteSets.find(s => s.id === serverSetId);
        let id;
        if (serverSet) {
          const same = localSetByKey.get(nameKey(serverSet.name));
          id = same ? same.id : newSet(String(serverSet.name || '').trim() || 'С сервера');
          if (!same && serverSet.visible === false) added.waypointSets[added.waypointSets.length - 1].visible = false;
        } else {
          const active = state.waypointSets.find(s => s.id === local.activeSetId) || state.waypointSets[0];
          id = active ? active.id : newSet('С сервера');
        }
        setMap.set(serverSetId, id);
        return id;
      };
      const seen = new Map(); // nameKey → итоговый id
      list(remote.waypoints).forEach(sw => {
        const key = nameKey(sw.name);
        const serverId = sw.id == null ? '' : String(sw.id);
        const mapId = id => { if (serverId && !wpIdMap.has(serverId)) wpIdMap.set(serverId, id); };
        if (seen.has(key)) { stats.waypoints.duplicates++; mapId(seen.get(key)); return; }
        if (localByKey.has(key)) {
          stats.waypoints.skipped++;
          seen.set(key, localByKey.get(key).id);
          mapId(localByKey.get(key).id);
          return;
        }
        if (!finite(sw.lat) || !finite(sw.lng)) { stats.waypoints.invalid++; return; }
        const id = serverId && !usedIds.has(serverId) ? sw.id : makeWaypointId();
        usedIds.add(String(id));
        const wp = mark({ ...sw, id, setId: resolveSet(sw.setId) });
        state.waypoints.push(wp); added.waypoints.push(wp);
        seen.set(key, id);
        mapId(id);
        stats.waypoints.added++;
      });
      counters.waypointSetIdCounter = Math.max(nextSetId, maxNum(counters.waypointSetIdCounter));
      counters.wpCounter = maxNum(counters.wpCounter, remoteCounters.wpCounter) || counters.wpCounter;
    }

    // Треки и маршруты: id — целые; совпавший с локальным получает следующий свободный
    const addLines = (type, counterKey, isValid, adapt) => {
      const localItems = state[type];
      const usedIds = new Set(localItems.map(item => item.id).filter(Number.isInteger));
      const remoteItems = list(remote[type]);
      let nextId = maxNum(counters[counterKey], ...localItems.map(i => i.id + 1), ...remoteItems.map(i => i.id + 1)) || 1;
      const onDevice = new Set(localItems.map(item => nameKey(item.name)));
      const fromServer = new Set();
      const stat = stats[type];
      remoteItems.forEach(item => {
        const key = nameKey(item.name);
        if (fromServer.has(key)) { stat.duplicates++; return; }
        fromServer.add(key);
        if (onDevice.has(key)) { stat.skipped++; return; }
        if (!isValid(item)) { stat.invalid++; return; }
        const id = Number.isInteger(item.id) && !usedIds.has(item.id) ? item.id : nextId++;
        usedIds.add(id);
        const out = adapt(mark({ ...item, id }));
        localItems.push(out); added[type].push(out);
        stat.added++;
      });
      counters[counterKey] = Math.max(nextId, ...[...usedIds].map(id => id + 1), maxNum(counters[counterKey]));
    };
    const lineValid = item => Array.isArray(item.points) && item.points.length >= 2 && item.points.every(validPoint);
    if (checks.tracks) addLines('tracks', 'trackIdCounter', item => Array.isArray(item.points) && item.points.filter(validPoint).length >= 2, t => t);
    if (checks.routes) {
      addLines('routes', 'routeIdCounter', lineValid, r => {
        if (!Array.isArray(r.pointWaypointIds)) return r;
        return { ...r, pointWaypointIds: r.pointWaypointIds.map(v => (v != null && wpIdMap.has(String(v)) ? wpIdMap.get(String(v)) : (v ?? null))) };
      });
    }

    // GPX-файлы — тоже по названию
    if (checks.gpx) {
      const usedIds = new Set(state.gpxFiles.map(g => (g.id == null ? '' : String(g.id))).filter(Boolean));
      const res = addMissingByName(state.gpxFiles, list(remote.gpxFiles), g => g.name);
      stats.gpx.skipped = res.skipped; stats.gpx.duplicates = res.duplicates;
      res.merged.slice(state.gpxFiles.length).forEach(g => {
        if (typeof g.content !== 'string') { stats.gpx.invalid++; return; }
        let id = g.id;
        if (id == null || usedIds.has(String(id))) id = `gpx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        usedIds.add(String(id));
        const file = mark({ ...g, id });
        state.gpxFiles.push(file); added.gpxFiles.push(file);
        stats.gpx.added++;
      });
    }

    return { state, stats, added };
  }

  function addedTotal(stats) {
    return ['waypoints', 'tracks', 'routes', 'gpx'].reduce((sum, k) => sum + (stats?.[k]?.added || 0), 0);
  }

  /** «Добавлено: 2 точки, 1 маршрут, 0 треков. Уже было на устройстве, не тронуто: 3» */
  function formatPullSummary(stats) {
    const s = stats || {};
    const n = k => s[k]?.added || 0;
    let text = `Добавлено: ${countWord(n('waypoints'), 'точка', 'точки', 'точек')}, ${countWord(n('routes'), 'маршрут', 'маршрута', 'маршрутов')}, ${countWord(n('tracks'), 'трек', 'трека', 'треков')}`;
    if (n('gpx') > 0) text += `, ${countWord(n('gpx'), 'GPX-файл', 'GPX-файла', 'GPX-файлов')}`;
    const skipped = ['waypoints', 'routes', 'tracks', 'gpx'].reduce((sum, k) => sum + (s[k]?.skipped || 0), 0);
    if (skipped > 0) text += `. Уже было на устройстве, не тронуто: ${skipped}`;
    const invalid = ['waypoints', 'routes', 'tracks', 'gpx'].reduce((sum, k) => sum + (s[k]?.invalid || 0), 0);
    if (invalid > 0) text += `. Пропущено без координат: ${invalid}`;
    return text;
  }

  // ─── последний обмен ───
  const EXCHANGE_KEY = { push: 'tnd-sync-last-push', pull: 'tnd-sync-last-pull' };
  function rememberExchange(kind, text, at = new Date().toISOString()) {
    if (!EXCHANGE_KEY[kind]) return;
    lsSet(EXCHANGE_KEY[kind], JSON.stringify({ at, text: String(text || '') }));
    if (isPanelOpen()) render();
  }

  /**
   * Новый файл в рабочей папке: существующий никогда не перезаписывается — берётся «имя (2).gpx» и т. д.
   * createNew — атомарная проверка плагина fs (если он её не знает — остаётся проверка exists).
   * @returns путь записанного файла или null.
   */
  async function writeNewTextFile(dir, base, ext, content, fs = window.__TAURI__?.fs) {
    if (!fs?.writeTextFile) return null;
    const clean = String(base || '').trim() || 'sync';
    for (let n = 1; n < 100; n++) {
      const path = `${dir}/${n === 1 ? clean : `${clean} (${n})`}${ext}`;
      try { if (fs.exists && await fs.exists(path)) continue; } catch { /* не знаем — пробуем createNew */ }
      try {
        await fs.writeTextFile(path, content, { createNew: true });
        return path;
      } catch (e) {
        if (fs.exists && await fs.exists(path).catch(() => false)) continue;
        throw e;
      }
    }
    return null;
  }

  // ─── «Очистить данные на сервере» — как на Android: та же отправка, пустые списки ───
  async function clearServerData() {
    const g = window;
    if (typeof g.isPremiumAvailable === 'function' && !g.isPremiumAvailable()) { g.showToast?.('Синхронизация доступна по лицензии'); return false; }
    g.saveSyncConfig?.();
    const cfg = g.getSyncConfig?.() || {};
    if (!cfg.email || !cfg.syncKey) { g.showToast?.('Привяжите email для синхронизации'); return false; }
    const ok = await g.tndConfirmDanger?.('Все точки, треки, маршруты и GPX-файлы этого аккаунта будут удалены с сервера. Данные на этом компьютере не изменятся.', 'Очистить данные на сервере?');
    if (!ok) return false;
    const updatedAt = new Date().toISOString();
    const data = {
      version: typeof APP_STATE_VERSION !== 'undefined' ? APP_STATE_VERSION : 1,
      waypoints: { items: [], waypointSets: [], replace: true, updatedAt },
      tracks: { items: [], replace: true, updatedAt },
      routes: { items: [], replace: true, updatedAt },
      gpx: { items: [], replace: true, updatedAt },
      gpxFiles: [],
    };
    g.updateSyncStatus?.('Очистка сервера...', false);
    try {
      const deviceId = await g.getMachineIdAsync?.();
      const resp = await fetch(g.syncApiUrl('/api/sync/push'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...g.syncHeaders() },
        body: JSON.stringify({ data, deviceId, deviceType: 'desktop', timestamp: updatedAt }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || !body.ok) throw new Error(body.error || `HTTP ${resp.status}`);
      g.updateSyncStatus?.('Подключено', true);
      lsSet('tnd-sync-last', updatedAt);
      rememberExchange('push', 'данные на сервере очищены', updatedAt);
      g.showToast?.('Данные на сервере очищены');
      return true;
    } catch (e) {
      g.updateSyncStatus?.('Ошибка очистки', false);
      g.showToast?.('Не удалось очистить данные на сервере');
      return false;
    }
  }

  // ─── состояние для окна ───
  const PLAN_LABEL = { full: 'Full — Android + Desktop + Server', desktop: 'Navigator Pro', pro: 'Navigator Pro' };

  /** Собрать всё, что показывает окно, из уже известных данных (без запросов). */
  function gatherStatus(now = nowMs()) {
    const g = window;
    const lic = lsJson('tnd-license');
    let trialDays = null;
    try { if (!lic && typeof g.getTrialDaysLeft === 'function') trialDays = g.getTrialDaysLeft(); } catch { /* нет */ }
    let machineId = lsGet('tnd-machine-id');
    try { if (typeof _cachedMachineId !== 'undefined' && _cachedMachineId) machineId = _cachedMachineId; } catch { /* нет */ }
    const cfg = lsJson('tnd-sync-config') || {};
    let version = null;
    try { version = typeof g.getCurrentAppVersion === 'function' ? g.getCurrentAppVersion() : null; } catch { /* нет */ }
    let live = { connected: false, error: false, online: 0, total: 0 };
    try {
      if (typeof liveState !== 'undefined' && liveState) {
        const devices = Array.isArray(liveState.devices) ? liveState.devices : [];
        const isOnline = typeof liveIsOnline === 'function' ? d => liveIsOnline(d, now) : () => false;
        live = { connected: !!liveState.isPolling, error: (liveState.consecutiveErrors || 0) >= 3,
          online: liveState.isPolling ? devices.filter(isOnline).length : 0, total: liveState.isPolling ? devices.length : 0 };
      }
    } catch { /* Live ещё не загружен */ }
    let onlineMinutes = 5;
    try { if (typeof LIVE_OFFLINE_TIMEOUT === 'number') onlineMinutes = Math.round(LIVE_OFFLINE_TIMEOUT / 60000); } catch { /* по умолчанию 5 */ }
    let updatePending = false;
    try { updatePending = !!((typeof pendingUpdateRid !== 'undefined' && pendingUpdateRid) || (typeof pendingManualUpdateUrl !== 'undefined' && pendingManualUpdateUrl)); } catch { /* нет */ }
    let updateText = '';
    try { updateText = g.document.getElementById('update-status')?.textContent?.trim() || ''; } catch { /* нет */ }
    return {
      now,
      server: TNServer.last ? { ...TNServer.last } : null,
      license: lic ? { plan: lic.plan || null, until: lic.expiry || null, serverUntil: lic.serverUntil || null, checkedAt: lic.checkedAt || null } : null,
      trialDays,
      machineId: machineId || null,
      sync: {
        email: (cfg.email || lsGet('tnd-sync-email') || '').trim() || null,
        linked: !!(cfg.email && (cfg.syncKey || cfg.apiKey)),
        lastAt: lsGet('tnd-sync-last'),
        push: lsJson(EXCHANGE_KEY.push),
        pull: lsJson(EXCHANGE_KEY.pull),
      },
      version,
      updateText,
      updatePending,
      live,
      onlineMinutes,
    };
  }

  // ─── окно ───
  const row = (k, v, cls = '') => `<div class="srv-row"><span class="srv-k">${esc(k)}</span><span class="srv-v ${cls}">${v}</span></div>`;
  const title = (icon, text) => `<div class="sync-section-title srv-title">${ico(icon)}${esc(text)}</div>`;

  function serverSectionHtml(s) {
    const state = dotState(s.server, s.now);
    let status;
    if (!s.server) status = `<span class="server-state-dot unknown"></span>Ещё не проверялся`;
    else if (s.server.ok) status = `<span class="server-state-dot ${state}"></span>Доступен`;
    else status = `<span class="server-state-dot ${state === 'unknown' ? 'unknown' : 'bad'}"></span>Недоступен`;
    const cls = !s.server ? 'status-muted' : s.server.ok ? 'status-ok' : 'status-err';
    return title('globe', 'Сервер trophynav.ru')
      + row('Состояние', status, `srv-state ${cls}`)
      + row('Время ответа', s.server?.ok && s.server.ms != null ? `${esc(s.server.ms)} мс` : '—')
      + row('Проверено', esc(s.server ? fmtWhen(s.server.at, s.now) : '—'));
  }

  function licenseSectionHtml(s) {
    let html = title('lock', 'Лицензия');
    if (!s.license) {
      const trial = Number.isFinite(s.trialDays) && s.trialDays > 0;
      html += row('План', trial ? `Пробный период — ${esc(s.trialDays)} дн.` : 'Нет лицензии', trial ? 'status-warn' : 'status-err');
      html += row('Действует до', '—');
      html += row('Подтверждена сервером', '—');
    } else {
      const until = fmtDate(s.license.until);
      const active = s.license.until && new Date(s.license.until).getTime() > s.now;
      html += row('План', esc(PLAN_LABEL[s.license.plan] || s.license.plan || 'Navigator Pro'), active ? 'status-ok' : 'status-err');
      html += row('Действует до', esc(until ? (active ? until : `${until} — истекла`) : '—'));
      if (s.license.serverUntil) html += row('Сервер до', esc(fmtDate(s.license.serverUntil) || '—'));
      html += row('Подтверждена сервером', esc(fmtWhen(s.license.checkedAt, s.now)));
    }
    html += row('Устройство', `<span title="${esc(s.machineId || '')}">${esc(shortId(s.machineId))}</span>`, 'srv-mono');
    return html;
  }

  function syncSectionHtml(s) {
    const ex = e => (e && e.text ? `${esc(e.text)} <span class="srv-when">(${esc(fmtWhen(e.at, s.now))})</span>` : '—');
    return title('cloud-sync', 'Синхронизация')
      + row('Email', s.sync.email ? esc(s.sync.email) : 'не привязан', s.sync.email ? '' : 'status-muted')
      + row('Последний обмен', esc(fmtWhen(s.sync.lastAt, s.now)))
      + row('Отправлено', ex(s.sync.push))
      + row('Получено', ex(s.sync.pull))
      + `<div class="srv-actions">`
      + `<button type="button" class="btn-secondary" data-srv="push">${ico('cloud-upload')}Отправить на сервер</button>`
      + `<button type="button" class="btn-secondary" data-srv="pull">${ico('cloud-download')}Получить с сервера</button>`
      + `</div>`;
  }

  function updateSectionHtml(s) {
    return title('download', 'Обновления приложения')
      + row('Текущая версия', esc(s.version || '—'))
      + (s.updateText ? `<div class="srv-note" id="srv-update-text">${esc(s.updateText)}</div>` : `<div class="srv-note" id="srv-update-text"></div>`)
      + `<div class="srv-actions"><button type="button" class="btn-secondary" data-srv="update">${ico('cloud-sync')}Проверить обновление</button>`
      + (s.updatePending ? `<button type="button" class="btn-secondary" data-srv="about">${ico('info')}Установить в «О программе»</button>` : '')
      + `</div>`;
  }

  function liveSectionHtml(s) {
    const l = s.live;
    const state = !l.connected ? 'не подключено' : l.error ? 'нет связи' : 'подключено';
    const cls = !l.connected ? 'status-muted' : l.error ? 'status-err' : 'status-ok';
    return title('signal', 'Live')
      + row('Подключение', state, cls)
      + row(`В сети (точка не старше ${s.onlineMinutes} мин)`, l.connected ? `${esc(l.online)} из ${esc(l.total)}` : '—');
  }

  function renderPanelHtml(s) {
    return `<div class="srv-section" id="srv-server">${serverSectionHtml(s)}</div>`
      + `<div class="srv-section">${licenseSectionHtml(s)}</div>`
      + `<div class="srv-section">${syncSectionHtml(s)}</div>`
      + `<div class="srv-section">${updateSectionHtml(s)}</div>`
      + `<div class="srv-section">${liveSectionHtml(s)}</div>`;
  }

  const STYLE = `
  .server-btn .tb-icon { position: relative; }
  .server-state-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--text-hint); flex-shrink: 0; }
  .server-btn .server-state-dot { position: absolute; right: -3px; bottom: -1px; box-shadow: 0 0 0 2px var(--bar-bg); }
  .server-state-dot.ok { background: var(--success); }
  .server-state-dot.bad { background: var(--error); }
  .srv-state .server-state-dot { margin-right: 6px; }
  .srv-section { padding-bottom: 6px; border-bottom: 1px solid var(--row-border); }
  .srv-section:last-child { border-bottom: none; }
  .srv-title { display: flex; align-items: center; gap: 6px; margin: 10px 0 4px; }
  .srv-footer { margin: 0; padding: 10px 18px 14px; border-top: 1px solid var(--row-border); flex-shrink: 0; }
  .srv-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 3px 0; font-size: var(--fs-s); }
  .srv-k { color: var(--text-secondary); }
  .srv-v { color: var(--text-primary); font-weight: 600; text-align: right; overflow-wrap: anywhere; }
  .srv-v.status-ok { color: var(--success-text); }
  .srv-v.status-warn { color: var(--warning-text); }
  .srv-v.status-err { color: var(--error-text); }
  .srv-v.status-muted { color: var(--text-muted); font-weight: 500; }
  .srv-state { display: inline-flex; align-items: center; }
  .srv-mono { font-family: var(--font-mono); font-weight: 500; }
  .srv-when { color: var(--text-muted); font-weight: 500; }
  .srv-note { font-size: var(--fs-xs); color: var(--text-muted); margin: 2px 0; min-height: 0; }
  .srv-actions { display: flex; gap: 8px; margin: 8px 0 4px; flex-wrap: wrap; }
  .srv-actions .btn-secondary { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; }
  `;

  function ensureStyle() {
    if (document.getElementById('tn-server-style')) return;
    const st = document.createElement('style');
    st.id = 'tn-server-style';
    st.textContent = STYLE;
    document.head.appendChild(st);
  }

  function ensurePanel() {
    ensureStyle();
    let overlay = document.getElementById('modal-server');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-server';
    overlay.innerHTML = `<div class="modal" id="modal-server-win" role="dialog" aria-labelledby="modal-server-title" style="top:60px;right:70px;left:auto;width:440px">
      <div class="modal-header" onmousedown="startDrag(event,'modal-server-win')">
        <span class="modal-title" id="modal-server-title">${ico('server', '')}Связь с сервером</span>
        <button type="button" class="modal-close" onclick="closeModal('modal-server')" aria-label="Закрыть">${ico('close', '')}</button>
      </div>
      <div class="modal-body"><div id="srv-body"></div></div>
      <div class="btn-row srv-footer">
        <button type="button" class="btn-primary" data-srv="refresh">${ico('refresh')}Обновить состояние</button>
        <button type="button" class="btn-secondary" onclick="closeModal('modal-server')">Закрыть</button>
      </div>
    </div>`;
    overlay.addEventListener('click', onPanelClick);
    document.body.appendChild(overlay);
    return overlay;
  }

  function isPanelOpen() {
    return !!document.getElementById('modal-server')?.classList.contains('open');
  }

  function render() {
    const body = document.getElementById('srv-body');
    if (body) body.innerHTML = renderPanelHtml(gatherStatus());
  }
  function renderServerSection() {
    const el = document.getElementById('srv-server');
    if (el) el.innerHTML = serverSectionHtml(gatherStatus());
  }

  let busy = false;
  async function withBusy(btn, fn) {
    if (busy) return;
    busy = true;
    const buttons = [...document.querySelectorAll('#modal-server [data-srv]')];
    buttons.forEach(b => { b.disabled = true; });
    try { await fn(); } finally {
      busy = false;
      buttons.forEach(b => { b.disabled = false; });
      render();
    }
  }

  function onPanelClick(e) {
    const btn = e.target.closest?.('[data-srv]');
    if (!btn) return;
    const g = window;
    const action = btn.getAttribute('data-srv');
    if (action === 'push') withBusy(btn, async () => { await g.syncPush?.(); });
    else if (action === 'pull') withBusy(btn, async () => { await g.syncPull?.(); });
    else if (action === 'update') withBusy(btn, async () => { await g.checkForUpdates?.(false); });
    else if (action === 'refresh') withBusy(btn, refresh);
    else if (action === 'about') { g.closeModal?.('modal-server'); g.openModal?.('modal-about'); }
  }

  /** «Обновить состояние»: запрос каталога карт (тот же, что при запуске) + проверка лицензии. */
  async function refresh() {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    try {
      await fetch(`${TNServer.apiBase}/api/tiles-catalog.json`, { cache: 'no-store', signal: ctrl?.signal });
    } catch { /* записано наблюдателем */ } finally { if (timer) clearTimeout(timer); }
    try { if (typeof window.checkLicenseOnServer === 'function') await window.checkLicenseOnServer(); } catch { /* нет связи */ }
  }

  function openServerPanel() {
    ensurePanel();
    render();
    if (typeof window.openModal === 'function') window.openModal('modal-server');
    else document.getElementById('modal-server').classList.add('open');
  }

  function init() {
    ensureStyle();
    updateDot();
    // точка сереет, когда наблюдение устарело
    setInterval(updateDot, 60000);
  }

  installFetchObserver(window);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  Object.assign(TNServer, {
    nameKey, addMissingByName, mergeAddOnly, addedTotal, formatPullSummary, rememberExchange, writeNewTextFile,
    clearServerData, gatherStatus, renderPanelHtml, dotState, updateDot, note, installFetchObserver, shortId, fmtWhen,
    openServerPanel, refresh, render, plural,
  });
  window.TNServer = TNServer;
  window.openServerPanel = openServerPanel;
})();
