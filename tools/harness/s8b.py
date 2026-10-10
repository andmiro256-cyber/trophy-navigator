import wd, time
from wd import click, dlg, CLEAN, setv, key, focus_map
s = wd.session(new=True); s.c('POST', '/window/rect', {'width': 1600, 'height': 1000, 'x': 0, 'y': 0}); time.sleep(1)
R = wd.Rec(s, 's8b'); main = s.c('GET', '/window')
s.js(CLEAN); wd.st(s)
s.js("__tnTest.setView({center:{lat:43.30,lng:44.60},zoom:13})"); time.sleep(2)
pts = [(300,300),(400,300),(500,300),(600,300),(300,600),(400,600),(500,600),(600,600)]
acts = [('center','Центрировать карту',"return [__tnTest.getView().center.lat.toFixed(4), __tnTest.getView().center.lng.toFixed(4)]"),
        ('copycoords','Копировать координаты',"return null"),
        ('measure','Измерить расстояние отсюда',"return [currentMode, document.getElementById('ruler-panel')?.innerText.replace(/\\s+/g,' ').slice(0,60)]"),
        ('map:yandex-map','Яндекс Карты здесь',None),('map:yandex-panorama','Я.Панорама здесь',None),('map:google-map','Google Maps здесь',None),('map:google-streetview','Street View здесь',None)]
for (a, lbl, x), (px, py) in zip(acts, pts):
    def f(a=a, px=px, py=py):
        s.js(CLEAN); s.js("setMode('hand')"); wd.xclick(s, px, py, button=3); click(s, f"#ctx-menu-map .ctx-item[onclick=\"ctxMapAction('{a}')\"]")
    R('map ctx: ' + lbl, f, wait=2, extra=x or "return null")
    hs = s.c('GET', '/window/handles')
    for h in hs:
        if h != main:
            s.c('POST', '/window', {'handle': h}); time.sleep(2)
            R('  окно карты', None, wait=0.1, extra="return [location.href.slice(0,150), document.title.slice(0,50)]", shot=False)
    wd.closewins(s, main)
s.js("setMode('hand')"); s.js(CLEAN)
# меню трека с обходом дефекта P1 №3 (холсты перекрывают трек) — проверяем сами пункты. Обход 07.10 отключал
# pointer-events у чужих холстов Leaflet; теперь событие отдаётся треку, который pick выбрал в точке (API-GAPS G8).
# Настоящий ПКМ по треку (проверка самого дефекта, F-1) — в s8 и r2.
TRK = "const p=__tnh.pts(__tnh.longTrack().id); const q=__tnTest.project(__tnh.mid(p[150], p[151])); "
def rtrack():
    s.js(CLEAN); s.js("const p=__tnh.pts(__tnh.longTrack().id); __tnh.go(p[150], 16)"); time.sleep(1.5)
    return s.js(TRK + "return __tnTest.dispatchAt(q, 'contextmenu', {kinds: ['track']})")
TM = "return [document.getElementById('ctx-menu-track').classList.contains('open'), tracks.map(t=>t.points.length)]"
R('трек ПКМ (обход холстов)', rtrack, extra=TM)
for a, lbl in [('map:yandex-map','Яндекс Карты здесь'),('split','Разбить трек здесь'),('delete','Удалить точку'),('delete-track','Удалить весь трек')]:
    def f(a=a):
        rtrack(); click(s, f"#ctx-menu-track .ctx-item[onclick=\"ctxTrackAction('{a}')\"]")
    R('трек ctx: ' + lbl, f, wait=1.5, extra="return [__tnTest.stats().tracks, tracks.map(t=>t.points.length), document.getElementById('modal-dialog').classList.contains('open'), document.getElementById('modal-dialog-message').innerText.slice(0,80)]")
    if s.js("return document.getElementById('modal-dialog').classList.contains('open')"): R('  подтвердить', lambda: dlg(s), extra="return [__tnTest.stats().tracks, tracks.map(t=>t.points.length)]")
    wd.closewins(s, main)
R('Ctrl+Z', lambda: (s.js(CLEAN), focus_map(s), key(s, 'z', ('ctrl',))), extra="return [__tnTest.stats().tracks, tracks.map(t=>t.points.length)]")
# ЛКМ по треку (обход)
R('трек ЛКМ (обход холстов) → попап/свойства', lambda: (rtrack(), s.js("closeCtxMenu()"), s.js(TRK + "return __tnTest.dispatchAt(q, 'click', {kinds: ['track']})")), extra="const pp=__tnTest.popup(); return [[...document.querySelectorAll('.modal-overlay.open')].map(e=>e.id), pp.open ? pp.text.slice(0,100) : undefined]")
R.save()
wd.req('DELETE', '/session/' + s.sid)
