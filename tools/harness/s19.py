import wd, time, os
from wd import click, dlg, CLEAN, setv, key, focus_map
s = wd.session(); R = wd.Rec(s, 's19')
s.js(CLEAN); s.js("try{ if(currentTrackDraw) cancelTrackDraw(); }catch(e){}"); wd.st(s)
VEC = wd.A + '/home/Документы/TrophyNavigatorTest/maps/vector/'
# быстрый клик по точке на карте
def lwp():
    s.js("const m=waypoints.find(m=>m.wpData.lat>40); map.setView(m.getLatLng(), 15, {animate:false})"); time.sleep(1.5)
    p = s.js("const m=waypoints.find(m=>m.wpData.lat>40); const p=map.latLngToContainerPoint(m.getLatLng()); const r=document.getElementById('map').getBoundingClientRect(); return [p.x+r.left, p.y+r.top]")
    wd.xclick(s, p[0], p[1])
R('ЛКМ по точке → быстрое переименование', lwp, extra="const p=document.querySelector('.leaflet-popup'); return p ? p.innerText.replace(/\\s+/g,' ').slice(0,120) : null")
R('  Сохранить новое имя', lambda: (setv(s, '.leaflet-popup input', 'WP-быстро'), click(s, '.leaflet-popup .btn-primary, .leaflet-popup button')), extra="return [waypoints.some(m=>m.wpData.name==='WP-быстро'), !!document.querySelector('.leaflet-popup')]")
R('  Свойства из попапа', lambda: (lwp(), click(s, '.leaflet-popup button:last-child')), extra="return [...document.querySelectorAll('.modal-overlay.open')].map(e=>e.id)")
s.js(CLEAN)
# перетаскивание окна за заголовок
def dragwin():
    wd.open_by(s, '#toolbar button[title="Список точек"]', 'modal-wpts')
    r = s.js("const r=document.querySelector('#modal-wpts-win .modal-header').getBoundingClientRect(); return [r.x+60, r.y+r.height/2, document.getElementById('modal-wpts-win').getBoundingClientRect().x]")
    wd.xdo('mousemove', '--sync', str(int(r[0])), str(int(r[1]))); wd.xdo('mousedown', '1')
    for i in range(1, 6): wd.xdo('mousemove', '--sync', str(int(r[0]) + 60*i), str(int(r[1]) + 20*i)); time.sleep(0.05)
    wd.xdo('mouseup', '1'); return r[2]
R('окно: перетаскивание за заголовок', dragwin, extra="return document.getElementById('modal-wpts-win').getBoundingClientRect().x")
s.js(CLEAN)
# перестановка КП перетаскиванием
def kpdrag():
    wd.open_by(s, '#toolbar button[title="Список маршрутов по WP"]', 'modal-routes')
    click(s, '#route-list .route-item:nth-child(1) .route-meta')
    a = s.js("const e=document.querySelector('#route-list .route-item:nth-child(1) .route-kp:nth-child(1)'); const r=e.getBoundingClientRect(); return [r.x+30, r.y+r.height/2]")
    b = s.js("const e=document.querySelector('#route-list .route-item:nth-child(1) .route-kp:nth-child(3)'); const r=e.getBoundingClientRect(); return [r.x+30, r.y+r.height-3]")
    before = s.js("return routes[0].labels.slice()")
    wd.xdo('mousemove', '--sync', str(int(a[0])), str(int(a[1]))); wd.xdo('mousedown', '1')
    for i in range(1, 9): wd.xdo('mousemove', '--sync', str(int(a[0])), str(int(a[1] + (b[1]-a[1])*i/8))); time.sleep(0.08)
    wd.xdo('mouseup', '1'); return before
R('КП: перетаскивание в списке', kpdrag, wait=1, extra="return routes[0].labels")
s.js(CLEAN)
# 📦 Скачанные карты в окне слоёв
R('слои: 📦 Скачанные карты — вкл', lambda: (s.js("map.setView([43.215, 44.665], 13, {animate:false})"), wd.open_by(s, '#btn-map-layer', 'modal-layers'), click(s, '#offline-layers-list input[type=checkbox]')), wait=3, extra="return [Object.values(offlineMaps).map(e=>[e.name, !!e.layer && map.hasLayer(e.layer)]), window.__audit.toasts.slice(-2)]")
R('слои: 📦 — выкл', lambda: click(s, '#offline-layers-list input[type=checkbox]'), wait=1.5, extra="return Object.values(offlineMaps).map(e=>[e.name, !!e.layer && map.hasLayer(e.layer)])")
s.js(CLEAN)
# Live share окна
R('Live: окно «📄 GPX» (поделиться)', lambda: (click(s, '#btn-live'), time.sleep(2), click(s, '#live-sidebar [title="Сообщения"]'), click(s, '#modal-live-messages button[onclick*="Share"], #modal-live-messages button:nth-last-child(2)')), wait=1.5, extra="const m=[...document.querySelectorAll('.modal-overlay.open')].pop(); return m ? [m.id, m.innerText.replace(/\\s+/g,' ').slice(0,250)] : null")
s.js("closeAllModals(); try{ if (liveState.isOpen) toggleLive(); }catch(e){}")
# TN Maps удалить область
R('TN Maps: Удалить Ингушетию', lambda: (s.js("window.TrophyNavMaps.openWindow()"), time.sleep(3), setv(s, '#modal-tnmaps [data-tnmaps-search]', 'Инг'), click(s, '#modal-tnmaps [data-tnmaps-act="delete"]')), wait=1, extra="return [document.getElementById('modal-dialog').classList.contains('open'), document.getElementById('modal-dialog-message').innerText]")
if s.js("return document.getElementById('modal-dialog').classList.contains('open')"):
    R('  подтвердить', lambda: dlg(s), wait=2, extra="return [...document.querySelectorAll('#modal-tnmaps .tnmaps-item')].map(e=>e.innerText.replace(/\\s+/g,' ').slice(0,100)).slice(0,2)")
print('VEC', os.listdir(VEC))
s.js(CLEAN)
R.save()
