// Trophy Navigator Desktop — полоса виджетов внизу карты, как нижняя панель Android
// (карточки «крупное значение + подпись», одинаковой ширины, скругление, цвета темы).
// Новых расчётов нет: значения берутся из того, что уже есть в приложении —
// строка состояния (координаты курсора, масштаб), trackLen()/routeLen() для выбранных
// трека и маршрута, часы. Полосу можно скрыть (запоминается).
(function () {
  'use strict';
  const LS_KEY = 'tnd-widgets-hidden';
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } };

  const CARDS = [
    { id: 'coords', caption: 'курсор', wide: true },
    { id: 'zoom', caption: 'масштаб' },
    { id: 'track', caption: 'км трек' },
    { id: 'route', caption: 'км маршрут' },
    { id: 'time', caption: 'время' },
  ];

  let bar, toggle, last = {};

  function set(id, value, caption) {
    const key = `${value}\u0000${caption || ''}`;
    if (last[id] === key) return;
    last[id] = key;
    const card = bar.querySelector(`[data-widget="${id}"]`);
    card.querySelector('.tn-widget-value').textContent = value;
    if (caption) card.querySelector('.tn-widget-caption').textContent = caption;
  }

  function refresh() {
    if (!bar || bar.hidden) return;
    const text = id => document.getElementById(id)?.textContent?.trim() || '—';
    set('coords', text('sb-coords'));
    set('zoom', `Z${text('sb-zoom')}`);
    try {
      const t = typeof tracks !== 'undefined' && typeof selectedTrackId !== 'undefined'
        ? tracks.find(x => x.id === selectedTrackId) : null;
      set('track', t && typeof trackLen === 'function' ? trackLen(t).toFixed(1) : '—',
        t ? `км · ${t.name}` : 'км трек');
    } catch { set('track', '—', 'км трек'); }
    try {
      const r = typeof routes !== 'undefined' && typeof selectedRouteId !== 'undefined'
        ? routes.find(x => x.id === selectedRouteId) : null;
      set('route', r && typeof routeLen === 'function' ? routeLen(r).toFixed(1) : '—',
        r ? `км · ${r.points.length} WP` : 'км маршрут');
    } catch { set('route', '—', 'км маршрут'); }
    set('time', new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
  }

  function apply(hidden) {
    bar.hidden = hidden;
    document.body.classList.toggle('tn-widgets-on', !hidden);
    toggle.setAttribute('aria-pressed', String(!hidden));
    toggle.title = hidden ? 'Показать виджеты' : 'Скрыть виджеты';
    toggle.innerHTML = window.tnIcon ? window.tnIcon(hidden ? 'gauge' : 'close', 'tn-ico-xs') : (hidden ? '▴' : '▾');
    lsSet(LS_KEY, hidden ? '1' : '0');
    if (!hidden) { last = {}; refresh(); }
    window.dispatchEvent(new Event('resize'));
  }

  function init() {
    const mapEl = document.getElementById('map');
    if (!mapEl || document.getElementById('tn-widgets')) return;
    bar = document.createElement('div');
    bar.id = 'tn-widgets';
    bar.setAttribute('aria-label', 'Виджеты');
    bar.innerHTML = CARDS.map(c => `
      <div class="tn-widget${c.wide ? ' wide' : ''}" data-widget="${c.id}">
        <div class="tn-widget-value">—</div>
        <div class="tn-widget-caption">${c.caption}</div>
      </div>`).join('');
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'tn-widgets-toggle';
    toggle.addEventListener('click', e => { e.stopPropagation(); apply(!bar.hidden); });
    for (const el of [bar, toggle]) {
      ['mousedown', 'dblclick', 'wheel', 'contextmenu'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));
    }
    mapEl.appendChild(bar);
    mapEl.appendChild(toggle);
    apply(lsGet(LS_KEY) === '1');
    // строка состояния обновляется на движение мыши/зум — повторяем за ней сразу
    const obs = new MutationObserver(refresh);
    ['sb-coords', 'sb-zoom'].forEach(id => {
      const el = document.getElementById(id);
      if (el) obs.observe(el, { childList: true, characterData: true, subtree: true });
    });
    setInterval(refresh, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
  else setTimeout(init, 0);
})();
