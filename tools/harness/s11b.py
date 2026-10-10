import wd, time, os
from wd import click, dlg, CLEAN, setv, key, focus_map
s = wd.session(); R = wd.Rec(s, 's11b')
V = "const r=document.querySelector('#tn3d-root'); return r ? [getComputedStyle(r).display, r.querySelector('[data-tn3d-val=pitch]')?.textContent, r.querySelector('[data-tn3d-val=bearing]')?.textContent, r.querySelector('[data-tn3d=exag]')?.disabled] : null"
s.js("setLayer('tnmap:ingushetia')"); time.sleep(3); click(s, 'a[title^="3D-вид"]'); time.sleep(6)
if not s.js("return !!document.querySelector('#tn3d-root') && getComputedStyle(document.querySelector('#tn3d-root')).display!=='none'"):
    print('3D not open')
R('3D tip Понятно', lambda: click(s, '#tn3d-root [data-tn3d-act="tip-ok"]'), extra=V)
R('3D pitch 30', lambda: setv(s, '#tn3d-root [data-tn3d=pitch]', '30'), wait=1, extra=V)
R('3D ↺', lambda: click(s, '#tn3d-root [data-tn3d-act="left"]'), wait=1.5, extra=V)
R('3D ↻', lambda: (click(s, '#tn3d-root [data-tn3d-act="right"]'), click(s, '#tn3d-root [data-tn3d-act="right"]')), wait=1.5, extra=V)
R('3D Север вверх', lambda: click(s, '#tn3d-root [data-tn3d-act="north"]'), wait=1.5, extra=V)
R('3D Сверху', lambda: click(s, '#tn3d-root [data-tn3d-act="top"]'), wait=1.5, extra=V)
R('3D wheel zoom (real)', lambda: (wd.xdo('mousemove', '900', '500'), wd.xdo('click', '4'), wd.xdo('click', '4')), wait=1.5, extra=V)
R('3D Esc', lambda: (key(s, '')), wait=1.5, extra=V)
R('3D via map button', lambda: (s.js(CLEAN), click(s, 'a[title^="3D-вид"]')), wait=6, extra=V)
R('3D 2D button', lambda: click(s, '#tn3d-root [data-tn3d-act="close"]'), wait=1.5, extra="return [!!document.querySelector('#tn3d-root'), currentBaseLayerName]")
R('3D on raster map (OSM)', lambda: (s.js("setLayer('OpenStreetMap')"), time.sleep(2), click(s, 'a[title^="3D-вид"]')), wait=6, extra=V + "")
s.js("try{ window.TrophyNav3D.close() }catch(e){}")
R.save()
