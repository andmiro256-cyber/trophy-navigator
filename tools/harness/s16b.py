import wd, time
from wd import click, dlg, CLEAN, setv, key, focus_map
s = wd.session(); R = wd.Rec(s, 's16b')
openr = lambda: wd.open_by(s, '#toolbar button[title="Маршрут по дорогам"]', 'modal-routing')
L = "return [...document.querySelectorAll('#modal-routing .routing-route-item, #modal-routing [onclick^=\"selectOsrmRoute\"]')].map(e=>e.innerText.replace(/\\s+/g,' ').slice(0,80))"
R('saved: 👁 Скрыть', lambda: (openr(), click(s, '#modal-routing [onclick^="toggleOsrmRouteVisible"]')), extra=L)
R('saved: 👁 Показать', lambda: click(s, '#modal-routing [onclick^="toggleOsrmRouteVisible"]'), extra=L, shot=False)
R('saved: 🎯 Центр', lambda: (s.js("__tnTest.setView({center:{lat:55,lng:37},zoom:6})"), click(s, '#modal-routing [onclick^="centerOsrmRoute"]')), wait=1.5, extra="return [__tnTest.getView().center.lat.toFixed(2), __tnTest.getView().zoom]")
R('saved: 💾 В треки', lambda: click(s, '#modal-routing [onclick^="saveOsrmRouteAsTrack"]'), wait=1, extra="return [__tnTest.stats().tracks, __tnh.track(-1).name, __tnh.track(-1).points]")
R('saved: ✕ Удалить', lambda: click(s, '#modal-routing [onclick^="deleteOsrm"]'), wait=1, extra=L + ".concat([document.getElementById('modal-dialog').classList.contains('open')])")
if s.js("return document.getElementById('modal-dialog').classList.contains('open')"): R('  confirm', lambda: dlg(s), extra=L)
s.js(CLEAN)
R('search + → точка', lambda: (setv(s, '#search-input', 'Магас'), click(s, '#search-input'), key(s, ''), time.sleep(3), click(s, '#search-results [onclick*="addWaypointFromS"]')), wait=1, extra="return [__tnTest.stats().wp, __tnh.wp(-1).name]")
R('search A', lambda: (setv(s, '#search-input', 'Назрань'), click(s, '#search-input'), key(s, ''), time.sleep(3), click(s, '#search-results [onclick*="setRoutePoint(\'A"]')), wait=1, extra="return [document.getElementById('route-from-input').value, [...document.querySelectorAll('.modal-overlay.open')].map(e=>e.id)]")
R('search B', lambda: (setv(s, '#search-input', 'Магас'), click(s, '#search-input'), key(s, ''), time.sleep(3), click(s, '#search-results [onclick*="setRoutePoint(\'B"]')), wait=4, extra="return [document.getElementById('route-to-input').value, document.getElementById('routing-distance').textContent]")
s.js("clearSearch()"); s.js(CLEAN)
R.save()
