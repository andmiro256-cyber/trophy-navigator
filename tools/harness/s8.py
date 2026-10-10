import wd, time
from wd import click, dlg, CLEAN, setv, key, focus_map
s = wd.session(); R = wd.Rec(s, 's8')
s.js(CLEAN); wd.st(s); s.js("window.__audit.dialogQueue.length=0")
main = s.c('GET', '/window')
# пустое место карты в Ингушетии
s.js("__tnTest.setView({center:{lat:43.25,lng:44.70},zoom:13})"); time.sleep(2)
MX, MY = 600, 650
def rmap(): s.js(CLEAN); wd.xclick(s, MX, MY, button=3)
M = "return [document.getElementById('ctx-menu-map').classList.contains('open'), [...document.querySelectorAll('#ctx-menu-map .ctx-item')].filter(e=>e.offsetParent).map(e=>e.innerText.trim())]"
R('map right-click', rmap, extra=M)
acts = [('addwpt','Добавить точку здесь',"return [__tnTest.stats().wp, __tnh.wp(-1).name, document.querySelectorAll('.modal-overlay.open').length]"),
        ('center','Центрировать карту',"return [__tnTest.getView().center.lat.toFixed(4), __tnTest.getView().center.lng.toFixed(4)]"),
        ('copycoords','Копировать координаты',"return null"),
        ('measure','Измерить расстояние отсюда',"return [currentMode, typeof rulerPoints!=='undefined'?rulerPoints.length:null]"),
        ('map:yandex-map','Яндекс Карты здесь',"return null"),('map:yandex-panorama','Я.Панорама здесь',"return null"),('map:google-map','Google Maps здесь',"return null"),('map:google-streetview','Street View здесь',"return null"),
        ('routefrom','Маршрут отсюда',"return [document.getElementById('route-from-input')?.value, document.querySelectorAll('.modal-overlay.open').length]"),
        ('routeto','Маршрут сюда',"return [document.getElementById('route-to-input')?.value, [...document.querySelectorAll('.modal-overlay.open')].map(e=>e.id)]")]
for a, lbl, x in acts:
    def f(a=a):
        rmap(); click(s, f"#ctx-menu-map .ctx-item[onclick=\"ctxMapAction('{a}')\"]")
    R('map ctx: ' + lbl, f, wait=1.5, extra=x)
    hs = s.c('GET', '/window/handles')
    if len(hs) > 1:
        for h in hs:
            if h != main:
                s.c('POST', '/window', {'handle': h}); time.sleep(1.5)
                R('  viewer window', None, wait=0.1, extra="return [location.href.slice(0,140), document.title.slice(0,60)]", shot=False)
        wd.closewins(s, main)
    if a == 'measure':
        R('  measure: click 2nd point', lambda: wd.xclick(s, MX + 200, MY - 100), extra="return [currentMode, document.getElementById('ruler-panel')?.innerText.replace(/\\s+/g,' ').slice(0,80)]")
        s.js("setMode('hand')")
s.js(CLEAN); s.js("closeModal('modal-routing')")
# ПКМ по треку
def rtrack():
    s.js(CLEAN)
    s.js("const p=__tnh.pts(__tnh.track(0).id); __tnh.go(p[150], 15)"); time.sleep(1.5)
    p = s.js("return __tnh.xy(__tnh.pts(__tnh.track(0).id)[150])")
    wd.xclick(s, p[0], p[1], button=3)
TM = "return [document.getElementById('ctx-menu-track').classList.contains('open'), document.getElementById('ctx-menu-map').classList.contains('open'), document.getElementById('ctx-menu').classList.contains('open'), [...document.querySelectorAll('#ctx-menu-track .ctx-item')].filter(e=>e.offsetParent).map(e=>e.innerText.trim())]"
R('track right-click', rtrack, extra=TM)
for a, lbl in [('map:yandex-map','Яндекс здесь'),('map:google-streetview','Street View здесь'),('split','Разбить трек здесь'),('delete','Удалить точку'),('delete-track','Удалить весь трек')]:
    def f(a=a):
        rtrack(); click(s, f"#ctx-menu-track .ctx-item[onclick=\"ctxTrackAction('{a}')\"]")
    R('track ctx: ' + lbl, f, wait=1.5, extra="return [__tnTest.stats().tracks, __tnTest.entities().track.map(t=>t.points), document.getElementById('modal-dialog').classList.contains('open'), document.getElementById('modal-dialog-message').innerText]")
    if s.js("return document.getElementById('modal-dialog').classList.contains('open')"):
        R('  confirm', lambda: dlg(s), extra="return [__tnTest.stats().tracks, __tnTest.entities().track.map(t=>t.points)]")
    wd.closewins(s, main)
R('Ctrl+Z after track delete', lambda: (focus_map(s), key(s, 'z', ('ctrl',))), extra="return [__tnTest.stats().tracks, __tnTest.entities().track.map(t=>t.points)]")
# ПКМ по маршруту
def rroute():
    s.js(CLEAN)
    s.js("__tnh.fit(__tnh.pts(__tnh.route(0).id), 0.2)"); time.sleep(1.5)
    p = s.js("const p=__tnh.pts(__tnh.route(0).id); return __tnh.xy(__tnh.mid(p[1], p[2]))")
    wd.xclick(s, p[0], p[1], button=3)
R('route line right-click', rroute, extra=TM)
# ПКМ по точке на карте
def rwp():
    s.js(CLEAN)
    s.js("__tnh.go(__tnh.wpWhere(w=>w.lat>40), 15)"); time.sleep(1.5)
    p = s.js("return __tnh.xy(__tnh.wpWhere(w=>w.lat>40))")
    wd.xclick(s, p[0], p[1], button=3)
R('WP marker right-click', rwp, extra=TM)
R('WP ctx: Двигать', lambda: (rwp(), click(s, "#ctx-menu .ctx-item[onclick=\"ctxAction('move')\"]")), extra="return [currentMode, typeof movingWaypoint!=='undefined'?String(!!movingWaypoint):'n/a']")
R('WP drag (real mouse)', lambda: (lambda p: (wd.xdo('mousemove', str(int(p[0])), str(int(p[1]))), wd.xdo('mousedown', '1'), time.sleep(0.2), wd.xdo('mousemove', str(int(p[0])+80), str(int(p[1])+40)), time.sleep(0.2), wd.xdo('mousemove', str(int(p[0])+120), str(int(p[1])+60)), wd.xdo('mouseup', '1')))(s.js("return __tnh.xy(__tnh.wpWhere(w=>w.lat>40))")), extra="const m=__tnh.wpWhere(w=>w.lat>40); return [m.name, m.lat.toFixed(5), m.lng.toFixed(5)]")
R('Lock + drag (should not move)', lambda: (s.js("if(!objectsLocked) toggleLock()"), (lambda p: (wd.xdo('mousemove', str(int(p[0])), str(int(p[1]))), wd.xdo('mousedown', '1'), time.sleep(0.2), wd.xdo('mousemove', str(int(p[0])+60), str(int(p[1])+60)), wd.xdo('mouseup', '1')))(s.js("return __tnh.xy(__tnh.wpWhere(w=>w.lat>40))"))), extra="const m=__tnh.wpWhere(w=>w.lat>40); return [objectsLocked, m.lat.toFixed(5), m.lng.toFixed(5)]")
s.js("if(objectsLocked) toggleLock()")
R('W mode: click map adds WP', lambda: (s.js(CLEAN), focus_map(s), key(s, 'w'), wd.xclick(s, 500, 500)), extra="return [currentMode, __tnTest.stats().wp, __tnh.wp(-1).name]")
s.js(CLEAN)
R.save()
