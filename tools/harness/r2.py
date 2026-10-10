import wd, time, os, json
from wd import click, dlg, CLEAN, setv, key, focus_map
s = wd.session(); R = wd.Rec(s, 'r2')
s.js(CLEAN); wd.st(s)
main = s.c('GET', '/window')
R('v2 version/title', None, extra="return [document.title, document.getElementById('about-version').textContent, __tnTest.stats().wp, __tnTest.stats().tracks, __tnTest.stats().routes]")
# 1 toolbar smoke
items = s.js("return [...document.querySelectorAll('#toolbar button')].map((b,i)=>[i, b.title||b.getAttribute('aria-label')||'', !!(b.offsetWidth&&b.offsetHeight)])")
for i, t, v in items:
    if not v or t in ('Очистить поиск',): continue
    def f(i=i):
        s.js(CLEAN); time.sleep(0.3); wd.click(s, '#toolbar button', idx=[x[0] for x in items if x[2] and x[1] != 'Очистить поиск'].index(i) if False else 0) if False else None
        e = s.find('#toolbar button')[i]; s.click(e)
    R('tb: ' + t, f, wait=1.2, extra="return [...document.querySelectorAll('.modal-overlay.open')].map(e=>e.id).concat([currentMode])", shot=False)
    s.js(CLEAN); s.js("try{ if (objectsLocked) toggleLock(); }catch(e){} try{ if (liveState.isOpen) toggleLive(); }catch(e){}")
# 2 Обзор on map + widgets
R('Обзор на карте', lambda: (focus_map(s), key(s, 'w'), click(s, wd.ctl(s, 'hand'))), extra="return [currentMode, document.getElementById('sb-mode').textContent]")
R('виджеты: клик по полосе не ставит точку в режиме W', lambda: (focus_map(s), key(s, 'w'), click(s, '#tn-widgets [data-widget="zoom"], #tn-widgets .tn-widget')), extra="return [__tnTest.stats().wp, currentMode]")
s.js("setMode('hand')")
R('виджеты: скрыть/показать', lambda: (click(s, '#tn-widgets-toggle'), click(s, '#tn-widgets-toggle')), extra="return localStorage.getItem('tnd-widgets-hidden')")
# 3 WP props: пустая широта
def wp_empty():
    wd.open_by(s, '#toolbar button[title="Список точек"]', 'modal-wpts')
    wd.xclick_el(s, '#wpt-tbody tr:nth-child(1) td.wpt-name', button=3)
    click(s, '#ctx-menu [onclick="ctxAction(\'props\')"]')
    window_lat = s.js("const w = __tnh.selWp(); return w && w.lat")
    setv(s, '#prop-lat', ''); click(s, '#modal-wpt-props .btn-primary')
    return window_lat
R('WP свойства: пустая широта', wp_empty, extra="const w = __tnh.selWp(); return [w && w.lat, document.getElementById('modal-wpt-props').classList.contains('open')]")
# 4 Ozi WPT
R('Ozi WPT импорт', lambda: (wd.q(s, wd.A + '/home/Загрузки/audit-ozi.wpt'), s.js("openFile('.wpt', loadWPT)")), wait=2, extra="return __tnTest.entities().wp.slice(-6).map(w=>[w.name, w.desc])")
s.js(CLEAN)
# 5 трек ПКМ
def rtrack():
    s.js(CLEAN); s.js("const p=__tnh.pts(__tnh.longTrack().id); __tnh.go(p[150]||p[0], 16)"); time.sleep(1.5)
    p = s.js("const p=__tnh.pts(__tnh.longTrack().id); return __tnh.xy(__tnh.mid(p[150], p[151]))")
    wd.xclick(s, p[0], p[1], button=3)
R('трек: ПКМ по линии', rtrack, extra="return [__tnTest.stats().routes, ['ctx-menu','ctx-menu-map','ctx-menu-track'].map(i=>document.getElementById(i).classList.contains('open'))]")
s.js(CLEAN)
# 6 свои карты ✕
R('свои карты: ✕ удалить', lambda: (wd.open_by(s, '#btn-map-layer', 'modal-layers'), click(s, '#custom-layers-list [title="Удалить"]')), wait=0.8, extra="return [customLayers.map(l=>l.name), currentBaseLayerName]")
s.js("setLayer('OpenStreetMap')"); s.js(CLEAN)
# 7 офлайн Вкл/🗑
R('офлайн: Вкл', lambda: (wd.open_by(s, '#toolbar button[title^="Офлайн карты"]', 'modal-offline'), click(s, '#modal-offline .tab-btn[aria-controls="tab-offline-list"]'), click(s, '#offline-maps-list .omc-btn')), wait=2, extra="return [document.querySelector('#offline-maps-list .omc-btn')?.getAttribute('onclick'), __tnh.offline()]")
s.js(CLEAN)
# 8 открыть папку
R('настройки: открыть папку', lambda: (wd.open_by(s, '#toolbar button[title="Настройки программы"]', 'modal-settings'), click(s, 'button[onclick="openWorkDir()"]')), wait=1.5, extra="return null")
s.js(CLEAN)
R('TN Maps: открыть папку', lambda: (s.js("window.TrophyNavMaps.openWindow()"), time.sleep(3), click(s, '#modal-tnmaps [data-tnmaps-act="folder"]')), wait=1.5, extra="return document.querySelector('#modal-tnmaps [data-tnmaps-act=\"folder\"]') ? 'есть' : 'нет кнопки'")
s.js(CLEAN)
# 9 DnD
import subprocess
s.js("window.__dd=[]; for (const ev of ['tauri://drag-drop']) window.__TAURI__.event.listen(ev, e=>window.__dd.push(JSON.stringify(e.payload).slice(0,150)));")
def drag():
    p = subprocess.Popen(['python3', wd.HERE + '/dnd_src.py', wd.A + '/home/Загрузки/audit-route.gpx', '1380', '860']); time.sleep(2)
    wd.xdo('mousemove', '--sync', '1450', '890'); time.sleep(0.2); wd.xdo('mousedown', '1'); time.sleep(0.3)
    for i in range(1, 16): wd.xdo('mousemove', '--sync', str(1450 - 40*i), str(890 - 25*i)); time.sleep(0.1)
    time.sleep(0.4); wd.xdo('mouseup', '1'); time.sleep(2)
    try: p.wait(2)
    except Exception: p.kill()
R('DnD GPX на карту', drag, extra="return [__tnTest.stats().routes, window.__dd]")
# 10 coord format
R('формат координат dd', lambda: (wd.open_by(s, '#toolbar button[title="Настройки программы"]', 'modal-settings'), setv(s, '#setting-coord-format', 'dd'), click(s, '#modal-settings .btn-primary'), wd.xdo('mousemove', '800', '450')), extra="return document.getElementById('sb-coords').textContent")
s.js("document.getElementById('setting-coord-format').value='dm'")
# 11 sync names
R('синхронизация: подписи', lambda: wd.open_by(s, '#toolbar button[title="Облачная синхронизация"]', 'modal-sync'), extra="return [...document.querySelectorAll('#modal-sync button')].map(b=>b.innerText.trim())")
s.js(CLEAN)
# 12 3D двойной клик
R('3D: двойной клик по кнопке', lambda: (s.js("setLayer('tnmap:ingushetia')"), time.sleep(3), wd.xclick_el(s, wd.ctl(s, 'threeD'), wait=0.05), wd.xclick_el(s, wd.ctl(s, 'threeD'), wait=0.05)), wait=6, extra="return [document.querySelectorAll('#tn3d-root').length, document.querySelectorAll('#tn3d-root canvas').length]")
R('3D: Esc', lambda: key(s, ''), wait=1.5, extra="return document.querySelectorAll('#tn3d-root').length")
R('TN Maps: тема Контраст', lambda: (wd.open_by(s, '#btn-map-layer', 'modal-layers'), click(s, '#tnmaps-layers [data-tnmaps-theme="contrast"]')), wait=3, extra="return localStorage.getItem('tnd-tnmaps-theme')")
s.js("setLayer('OpenStreetMap')"); s.js(CLEAN)
R('ошибки консоли за прогон', None, extra="return window.__audit.errors.slice(-5)", shot=False)
R.save()
