import wd, time, json
from wd import click, dlg, CLEAN, setv, key, focus_map
s = wd.session(); R = wd.Rec(s, 's12')
s.js(CLEAN); wd.st(s)
opens = lambda: wd.open_by(s, '#toolbar button[title="Настройки программы"]', 'modal-settings')
VALS = "return Object.fromEntries([...document.querySelectorAll('#modal-settings [id^=setting-]')].map(e=>[e.id.replace('setting-',''), e.type==='checkbox'?e.checked:e.value]))"
R('open settings', opens, extra=VALS)
before = s.js(VALS)
for t, lbl in [('tab-colors','Цвета'),('tab-cache','Кэш карт'),('tab-display','Отображение')]:
    R('tab ' + lbl, lambda t=t: click(s, f'#modal-settings .tab-btn[aria-controls="{t}"]'), extra=f"return document.getElementById('{t}').classList.contains('active')")
R('keyboard ← → tabs', lambda: (click(s, '#modal-settings .tab-btn[aria-controls="tab-display"]'), key(s, '')), extra="return document.activeElement.getAttribute('aria-controls')", shot=False)
# тема — сразу
R('theme light (immediate)', lambda: (click(s, '#modal-settings .tab-btn[aria-controls="tab-display"]'), s.js("const e=document.getElementById('setting-theme'); e.value='light'; e.dispatchEvent(new Event('change'))")), extra="return [document.documentElement.dataset.theme, document.body.className.slice(0,80), getComputedStyle(document.body).backgroundColor]")
NEW = {'icon-size': '32', 'track-width': '6', 'default-radius': '150', 'live-marker-size': '30', 'live-label-size': '16', 'coord-format': 'dd', 'units': 'mi',
       'color-wpt': '#123456', 'track-color-mode': 'fixed', 'color-track': '#ff0000', 'route-color-mode': 'fixed', 'color-route': '#00ff00', 'color-radius-fill': '#0000ff', 'color-radius-stroke': '#ff00ff', 'radius-opacity': '60', 'color-osrm': '#00ffff', 'color-search': '#ffff00'}
def setall():
    for k, v in NEW.items(): setv(s, '#setting-' + k, v)
R('set all values', setall, extra=VALS)
R('Сохранить', lambda: click(s, '#modal-settings .btn-primary'), wait=1.5, extra="const st=JSON.parse(localStorage.getItem('tnd-state')||'{}').settings||{}; return st")
# эффекты
R('effect: new WP radius/color/icon size', lambda: (focus_map(s), key(s, 'w'), wd.xclick(s, 700, 600), s.js("setMode('hand')")), extra="const w=__tnh.wp(-1), st=__tnTest.style(w.id), r=st.radius; return [w.radius, w.color, st.iconCss, st.iconPx, r && r.fill, r && r.stroke, r && r.fillOpacity]")
R('effect: new track color/width', lambda: (focus_map(s), key(s, 't'), wd.xclick(s, 500, 500), wd.xclick(s, 600, 500), wd.xclick(s, 650, 520, double=True)), extra="const t=__tnh.track(-1); return [t.name, t.color, t.width, __tnTest.style(t.id).width]")
R('effect: coord format in statusbar', lambda: wd.xdo('mousemove', '800', '450'), extra="return [document.getElementById('sb-coords')?.textContent, document.querySelector('[data-widget=coords] .tn-widget-value')?.textContent]")
R('effect: units (track km?)', None, extra="return [...document.querySelectorAll('.tn-widget-caption')].map(e=>e.textContent).concat([document.getElementById('ruler-panel')?.innerText.slice(0,40)])")
# кэш
R('cache: toggle enabled off', lambda: (opens(), click(s, '#modal-settings .tab-btn[aria-controls="tab-cache"]'), click(s, '#setting-cache-enabled')), extra="return [localStorage.getItem('tnd-cache-settings'), document.getElementById('cache-max-val')?.textContent, document.getElementById('modal-settings').innerText.match(/Занято[^\\n]*|Тайлов[^\\n]*/g)]")
R('cache: enabled on + max 2 + prefetch', lambda: (click(s, '#setting-cache-enabled'), setv(s, '#setting-cache-max-size', '2'), click(s, '#setting-cache-prefetch')), extra="return [localStorage.getItem('tnd-cache-settings'), document.getElementById('cache-max-val')?.textContent]")
R('cache: 🗑 Очистить весь кэш', lambda: click(s, '#tab-cache button[onclick="clearTileCache()"]'), wait=1, extra="return [document.getElementById('modal-dialog').classList.contains('open'), document.getElementById('modal-dialog-message').innerText.slice(0,100), document.getElementById('tab-cache').innerText.replace(/\\s+/g,' ').slice(0,300)]")
if s.js("return document.getElementById('modal-dialog').classList.contains('open')"): R('cache clear confirm', lambda: dlg(s), wait=1.5, extra="return document.getElementById('tab-cache').innerText.replace(/\\s+/g,' ').slice(0,300)")
R('workdir path', None, extra="return document.getElementById('setting-workdir-path')?.textContent || document.getElementById('setting-workdir-path')?.value")
R('📂 Открыть в проводнике', lambda: click(s, '#tab-cache button[onclick="openWorkDir()"]'), wait=1.5, extra="return null")
R('Закрыть', lambda: click(s, '#modal-settings .btn-row .btn-secondary, #modal-settings button.btn-secondary[onclick="closeModal(\'modal-settings\')"]'), extra="return document.getElementById('modal-settings').classList.contains('open')")
json.dump({'before': before}, open(wd.A + '/logs/s12-before.json', 'w'), ensure_ascii=False)
# перезапуск
s.js("saveState()"); time.sleep(2)
s = wd.session(new=True); s.c('POST', '/window/rect', {'width': 1600, 'height': 1000, 'x': 0, 'y': 0}); time.sleep(1)
R2 = wd.Rec(s, 's12r')
R2('after restart: settings', lambda: wd.open_by(s, '#toolbar button[title="Настройки программы"]', 'modal-settings'), extra=VALS)
R2('after restart: theme', None, extra="return [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor, localStorage.getItem('tnd-cache-settings')]")
R2.save(); R.save()
