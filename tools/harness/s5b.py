import wd, time
from wd import click, dlg, typein, CLEAN
s = wd.session(); R = wd.Rec(s, 's5b')
s.js(CLEAN); wd.st(s)
main = s.c('GET', '/window')
hs = s.c('GET', '/window/handles')
for h in hs:
    if h != main:
        s.c('POST', '/window', {'handle': h}); time.sleep(0.5)
        R('map viewer window', None, extra="return [location.href.slice(0,120), document.title, innerWidth, innerHeight]")
        s.c('DELETE', '/window'); time.sleep(0.5)
s.c('POST', '/window', {'handle': main})
print('handles after close', s.c('GET', '/window/handles'))
openw = lambda: (s.js(CLEAN), click(s, '#toolbar button[title="Список точек"]'))
R('bulk color apply', lambda: (openw(), click(s, '#wpt-select-all'), click(s, '#modal-wpts button[onclick="toggleBulkEditPanel()"]'), s.js("document.getElementById('bulk-color').value='#00ff00'"), click(s, '#bulk-color-apply'), click(s, '#bulk-edit-panel .btn-primary')), extra="return getActiveSet().waypoints.map(m=>m.wpData.color)")
rc = lambda: wd.xclick_el(s, '#wpt-tbody tr:nth-child(1) td.wpt-name', button=3)
R('row ctx (real right click)', lambda: (openw(), rc()), extra="return document.getElementById('ctx-menu').className")
R('ctx props', lambda: click(s, '#ctx-menu [onclick="ctxAction(\'props\')"]'), extra="return [document.getElementById('prop-name').value, document.getElementById('prop-desc').value, document.getElementById('prop-radius').value, document.getElementById('prop-lat').value, document.getElementById('prop-lng').value, document.getElementById('prop-color').value]")
R('props ext Яндекс', lambda: click(s, '#modal-wpt-props .external-map-btn'), wait=2.5, extra="return null")
print('handles', s.c('GET', '/window/handles'))
for h in s.c('GET', '/window/handles'):
    if h != main: s.c('POST', '/window', {'handle': h}); s.c('DELETE', '/window')
s.c('POST', '/window', {'handle': main})
R('props edit+save', lambda: (typein(s, '#prop-name', 'WP01-аудит'), typein(s, '#prop-desc', 'Описание аудит'), typein(s, '#prop-radius', '123'), click(s, '#modal-wpt-props .icon-cell[data-symbol="★"]'), typein(s, '#prop-lat', "43°10.300'N"), click(s, '#modal-wpt-props .btn-primary')), extra="const d=waypoints.find(m=>m.wpData.name.startsWith('WP01-'))?.wpData; return d && [d.name, d.desc, d.radius, d.symbol||d.icon, d.lat]")
R('props name >16 chars', lambda: (openw(), rc(), click(s, '#ctx-menu [onclick="ctxAction(\'props\')"]'), typein(s, '#prop-name', 'ABCDEFGHIJKLMNOPQRS')), extra="return document.getElementById('prop-name').value")
R('props bad coords save', lambda: (typein(s, '#prop-lat', 'абв'), click(s, '#modal-wpt-props .btn-primary')), extra="return [document.getElementById('modal-wpt-props').classList.contains('open'), waypoints[0].wpData.lat]")
R('props cancel', lambda: click(s, '#modal-wpt-props .btn-secondary'), extra="return waypoints.some(m=>m.wpData.name.startsWith('ABCDEFGH'))")
for act, lbl in [('move', 'Двигать'), ('center', 'Центрировать'), ('copy', 'Копировать координаты'), ('map:google-map', 'Google Maps'), ('delete', 'Удалить')]:
    R('ctx ' + lbl, lambda: (openw(), rc(), click(s, f'#ctx-menu [onclick="ctxAction(\'{act}\')"]')), wait=1.5, extra="return [waypoints.length, typeof movingWaypoint!=='undefined'?!!movingWaypoint:null, currentMode, map.getCenter().lat.toFixed(4)]")
    if act == 'move':
        R('move: click map', lambda: wd.xclick(s, 700, 500), extra="return [waypoints[0].wpData.lat.toFixed(4), waypoints[0].wpData.lng.toFixed(4)]")
    if act == 'delete':
        R('delete confirm?', lambda: None, extra="return [document.getElementById('modal-dialog').classList.contains('open'), document.getElementById('modal-dialog-message').innerText, waypoints.length]")
        if s.js("return document.getElementById('modal-dialog').classList.contains('open')"):
            R('delete dlg ok', lambda: dlg(s), extra="return waypoints.length")
    for h in s.c('GET', '/window/handles'):
        if h != main: s.c('POST', '/window', {'handle': h}); s.c('DELETE', '/window')
    s.c('POST', '/window', {'handle': main})
print(wd.xdo('getactivewindow'))
R.save()
