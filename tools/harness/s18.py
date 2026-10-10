import wd, time, subprocess, os
from wd import click, CLEAN
s = wd.session(); R = wd.Rec(s, 's18')
s.js(CLEAN); wd.st(s)
def drag(path, tx=800, ty=450):
    env = dict(os.environ)
    p = subprocess.Popen(['python3', wd.HERE + '/dnd_src.py', path, '1380', '860'], env=env)
    time.sleep(2)
    wd.xdo('mousemove', '--sync', '1450', '890'); time.sleep(0.2)
    wd.xdo('mousedown', '1'); time.sleep(0.2)
    for i in range(1, 11):
        x = 1450 + (tx - 1450) * i / 10; y = 890 + (ty - 890) * i / 10
        wd.xdo('mousemove', '--sync', str(int(x)), str(int(y))); time.sleep(0.08)
    time.sleep(0.4); wd.xdo('mouseup', '1'); time.sleep(2)
    try: p.wait(3)
    except Exception: p.kill()
C = "return [__tnTest.stats().wp, __tnTest.stats().tracks, __tnTest.stats().routes]"
R('before', None, extra=C, shot=False)
R('DnD audit-route.gpx на карту', lambda: drag(wd.A + '/home/Загрузки/audit-route.gpx'), extra=C)
R('DnD audit-ozi.wpt на карту', lambda: drag(wd.A + '/home/Загрузки/audit-ozi.wpt'), extra=C)
R('DnD audit.kml на карту', lambda: drag(wd.A + '/home/Загрузки/audit.kml'), extra=C)
R('DnD .sqlitedb в окно офлайн-карт', lambda: (wd.open_by(s, '#toolbar button[title^="Офлайн карты"]', 'modal-offline'), click(s, '#modal-offline .tab-btn[aria-controls="tab-offline-load"]'), (lambda r: drag(wd.A + '/home/Загрузки/ext-map.sqlitedb', int(r[0]), int(r[1])))(s.js("const r=document.getElementById('offline-map-dropzone').getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]"))), extra="return document.getElementById('offline-maps-list').innerText.replace(/\\s+/g,' ').slice(0,300)")
s.js(CLEAN)
R('wheel zoom (без окон)', lambda: (wd.xdo('mousemove', '--sync', '800', '450'), wd.xdo('click', '4'), time.sleep(0.6), wd.xdo('click', '4')), wait=1.2, extra="return __tnTest.getView().zoom")
R('drag map (без окон)', lambda: (wd.xdo('mousemove', '--sync', '800', '450'), wd.xdo('mousedown', '1'), [wd.xdo('mousemove', '--sync', str(800+i*15), str(450+i*8)) for i in range(1, 8)], wd.xdo('mouseup', '1')), wait=1, extra="return [__tnTest.getView().center.lat.toFixed(4), __tnTest.getView().center.lng.toFixed(4)]")
R.save()
