import wd, time, os
from wd import click, dlg, CLEAN, setv, key, focus_map
s = wd.session(); R = wd.Rec(s, 's19')
s.js(CLEAN); s.js("try{ if(currentTrackDraw) cancelTrackDraw(); }catch(e){}"); wd.st(s)
VEC = wd.WORK + '/maps/vector/'
# быстрый клик по точке на карте
def lwp():
    s.js("__tnh.go(__tnh.wpWhere(w=>w.lat>40), 15)"); time.sleep(1.5)
    p = s.js("return __tnh.xy(__tnh.wpWhere(w=>w.lat>40))")
    wd.xclick(s, p[0], p[1])
R('ЛКМ по точке → быстрое переименование', lwp, extra="const p=__tnTest.popup(); return p.open ? p.text.replace(/\\s+/g,' ').slice(0,120) : null")
R('  Сохранить новое имя', lambda: (lambda P: (setv(s, P + ' input', 'WP-быстро'), click(s, P + ' .btn-primary, ' + P + ' button')))(wd.popsel(s)), extra="return [__tnTest.entities().wp.some(w=>w.name==='WP-быстро'), __tnTest.popup().open]")
R('  Свойства из попапа', lambda: (lwp(), click(s, wd.popsel(s) + ' button:last-child')), extra="return [...document.querySelectorAll('.modal-overlay.open')].map(e=>e.id)")
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
R('слои: 📦 Скачанные карты — вкл', lambda: (s.js("__tnTest.setView({center:{lat:43.215,lng:44.665},zoom:13})"), wd.open_by(s, '#btn-map-layer', 'modal-layers'), click(s, '#offline-layers-list input[type=checkbox]')), wait=3, extra="return [__tnh.offline(), window.__audit.toasts.slice(-2)]")
R('слои: 📦 — выкл', lambda: click(s, '#offline-layers-list input[type=checkbox]'), wait=1.5, extra="return __tnh.offline()")
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
