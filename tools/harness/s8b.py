import wd, time
from wd import click, dlg, CLEAN, setv, key, focus_map
s = wd.session(new=True); s.c('POST', '/window/rect', {'width': 1600, 'height': 1000, 'x': 0, 'y': 0}); time.sleep(1)
R = wd.Rec(s, 's8b'); main = s.c('GET', '/window')
s.js(CLEAN); wd.st(s)
s.js("map.setView([43.30, 44.60], 13, {animate:false})"); time.sleep(2)
pts = [(300,300),(400,300),(500,300),(600,300),(300,600),(400,600),(500,600),(600,600)]
acts = [('center','Центрировать карту',"return [map.getCenter().lat.toFixed(4), map.getCenter().lng.toFixed(4)]"),
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
# меню трека с обходом перекрытия холстов — проверяем сами пункты
def rtrack():
    s.js(CLEAN); s.js("const t=tracks.find(t=>t.points.length>100); map.setView(t.points[150], 16, {animate:false})"); time.sleep(1.5)
    s.js("map.eachLayer(l=>{ if(l._container && l._container.tagName==='CANVAS' && !Object.values(l._layers||{}).some(x=>x instanceof L.Polyline && !(x instanceof L.Polygon) && tracks.some(t=>t.polyline===x))) l._container.style.pointerEvents='none'; })")
    p = s.js("const t=tracks.find(t=>t.points.length>100); const a=t.points[150], b=t.points[151]; const ll=L.latLng((a.lat+b.lat)/2,(a.lng+b.lng)/2); const p=map.latLngToContainerPoint(ll); const r=document.getElementById('map').getBoundingClientRect(); return [p.x+r.left, p.y+r.top]")
    wd.xclick(s, p[0], p[1], button=3)
TM = "return [document.getElementById('ctx-menu-track').classList.contains('open'), tracks.map(t=>t.points.length)]"
R('трек ПКМ (обход холстов)', rtrack, extra=TM)
for a, lbl in [('map:yandex-map','Яндекс Карты здесь'),('split','Разбить трек здесь'),('delete','Удалить точку'),('delete-track','Удалить весь трек')]:
    def f(a=a):
        rtrack(); click(s, f"#ctx-menu-track .ctx-item[onclick=\"ctxTrackAction('{a}')\"]")
    R('трек ctx: ' + lbl, f, wait=1.5, extra="return [tracks.length, tracks.map(t=>t.points.length), document.getElementById('modal-dialog').classList.contains('open'), document.getElementById('modal-dialog-message').innerText.slice(0,80)]")
    if s.js("return document.getElementById('modal-dialog').classList.contains('open')"): R('  подтвердить', lambda: dlg(s), extra="return [tracks.length, tracks.map(t=>t.points.length)]")
    wd.closewins(s, main)
R('Ctrl+Z', lambda: (s.js(CLEAN), focus_map(s), key(s, 'z', ('ctrl',))), extra="return [tracks.length, tracks.map(t=>t.points.length)]")
s.js("map.eachLayer(l=>{ if(l._container && l._container.tagName==='CANVAS') l._container.style.pointerEvents=''; })")
# ЛКМ по треку (обход)
R('трек ЛКМ (обход холстов) → попап/свойства', lambda: (rtrack(), s.js("closeCtxMenu()"), (lambda p: wd.xclick(s, p[0], p[1]))(s.js("const t=tracks.find(t=>t.points.length>100); const a=t.points[150], b=t.points[151]; const ll=L.latLng((a.lat+b.lat)/2,(a.lng+b.lng)/2); const p=map.latLngToContainerPoint(ll); const r=document.getElementById('map').getBoundingClientRect(); return [p.x+r.left, p.y+r.top]"))), extra="return [[...document.querySelectorAll('.modal-overlay.open')].map(e=>e.id), document.querySelector('.leaflet-popup')?.innerText.slice(0,100)]")
s.js("map.eachLayer(l=>{ if(l._container && l._container.tagName==='CANVAS') l._container.style.pointerEvents=''; })")
R.save()
wd.req('DELETE', '/session/' + s.sid)
