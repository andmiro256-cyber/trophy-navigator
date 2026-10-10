import wd, time
from wd import click, CLEAN, key, focus_map
s = wd.session(); R = wd.Rec(s, 's3')
s.js(CLEAN); wd.st(s)
def k(ch, mods=()):
    def f():
        focus_map(s); key(s, ch, mods)
    return f
X = "return [currentMode, (typeof objectsLocked!=='undefined'?objectsLocked:null), map.getZoom(), map.getCenter().lat.toFixed(3), document.querySelectorAll('.modal-overlay.open').length]"
for ch, lbl in [('w','W точка'),('','Esc'),('t','T трек'),('','Esc отмена трека'),('r','R маршрут'),('','Esc отмена маршрута'),('m','M линейка'),('m','M повторно'),('h','H рука'),(' ','Пробел рука'),('d','D выделить область'),('','Esc после D'),('l','L слои'),('','Esc закрыть слои'),('k','K блокировка'),('k','K разблокировка'),('f','F показать всё'),('?','? справка')]:
    R('key ' + lbl, k(ch), extra=X)
s.js(CLEAN)
R('Ctrl+S', k('s', ('ctrl',)), extra="return [...document.querySelectorAll('.modal-overlay.open')].map(e=>e.id)")
s.js(CLEAN)
# Ctrl+Z после удаления точки
R('Delete после ПКМ на точке', lambda: (s.js("map.setView(waypoints[0].getLatLng(), 14)"), time.sleep(1.5), (lambda p: (wd.xclick(s, p[0], p[1], button=3)))(wd.latlng_xy(s, waypoints[0].getLatLng().lat if False else s.js('return waypoints[0].getLatLng().lat'), s.js('return waypoints[0].getLatLng().lng'))), s.js("document.body.focus()"), key(s, '')), extra="return [waypoints.length, document.getElementById('ctx-menu').className]")
R('Ctrl+Z восстановить', k('z', ('ctrl',)), extra="return waypoints.length")
R('Ctrl+Z в поле ввода (не должен)', lambda: (click(s, '#search-input'), key(s, 'z', ('ctrl',))), extra="return waypoints.length")
s.js(CLEAN)
R.save()
