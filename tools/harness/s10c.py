import wd, time, os
from wd import click, dlg, CLEAN, setv
s = wd.session(); R = wd.Rec(s, 's10c')
MAPS = wd.WORK + '/maps/'
s.js(CLEAN); s.js("try{cancelAreaSelect()}catch(e){}"); s.js("__tnTest.setView({center:{lat:43.17,lng:44.82},zoom:12})"); time.sleep(1.5)
wd.open_by(s, '#toolbar button[title^="Офлайн карты"]', 'modal-offline')
click(s, '#modal-offline .tab-btn[aria-controls="tab-offline-download"]'); click(s, '#tab-offline-download .btn-primary')
for x, y in [(250, 250), (450, 250), (450, 420), (250, 420)]: wd.xclick(s, x, y, wait=0.4)
click(s, '#btn-polygon-done', wait=1.5)
R('settings opened', None, extra="return [document.getElementById('modal-download-settings').classList.contains('open'), document.getElementById('dl-sw').textContent, document.getElementById('dl-ne').textContent]")
s.js("const r=[...document.querySelectorAll('#dl-layer-radios input')].find(i=>i.value==='OpenStreetMap'); if(r){r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true}))}")
R('OSM + z10..14', lambda: (setv(s, '#dl-zoom-min', '10'), setv(s, '#dl-zoom-max', '14')), extra="return [[...document.querySelectorAll('#dl-layer-radios input')].filter(i=>i.checked).map(i=>i.value), document.getElementById('dl-est-tiles').textContent, document.getElementById('dl-est-size').textContent]")
R('overlay check in download', lambda: click(s, '#dl-overlay-checks input'), extra="return [document.querySelectorAll('#dl-overlay-checks input:checked').length, document.getElementById('dl-est-tiles').textContent]", shot=False)
R('overlay uncheck', lambda: click(s, '#dl-overlay-checks input'), extra="return [document.querySelectorAll('#dl-overlay-checks input:checked').length, document.getElementById('dl-est-tiles').textContent]", shot=False)
R('format OsmAnd', lambda: s.js("const f=document.getElementById('dl-format'); f.selectedIndex=1; f.dispatchEvent(new Event('change')); return [f.value, document.getElementById('dl-filename').value]"), extra="return [document.getElementById('dl-format').value, document.getElementById('dl-filename').value]", shot=False)
R('format RMaps', lambda: s.js("const f=document.getElementById('dl-format'); f.selectedIndex=0; f.dispatchEvent(new Event('change'))"), extra="return [document.getElementById('dl-format').value, document.getElementById('dl-filename').value]", shot=False)
R('⬇ Скачать', lambda: (setv(s, '#dl-filename', 'audit-magas.sqlitedb'), wd.q(s, MAPS + 'audit-magas.sqlitedb'), click(s, '#dl-buttons .btn-primary')), wait=2, extra="return [getComputedStyle(document.getElementById('dl-progress-area')).display, document.getElementById('dl-prog-status').textContent]")
t0 = time.time()
for i in range(60):
    st = s.js("return [getComputedStyle(document.getElementById('dl-progress-area')).display, document.getElementById('dl-prog-status').textContent, document.getElementById('modal-download-settings').classList.contains('open')]")
    if not st[2] or st[0] == 'none': break
    time.sleep(2)
R('download result', None, wait=1, extra="return [document.getElementById('dl-prog-status').textContent, document.getElementById('modal-download-settings').classList.contains('open')]")
print('took', int(time.time()-t0), 's; FILES', [(f, os.path.getsize(MAPS+f)) for f in os.listdir(MAPS) if os.path.isfile(MAPS+f)])
s.js(CLEAN)
R('Мои карты after', lambda: (wd.open_by(s, '#toolbar button[title^="Офлайн карты"]', 'modal-offline'), click(s, '#modal-offline .tab-btn[aria-controls="tab-offline-list"]'), click(s, '#tab-offline-list > .btn-secondary')), wait=1.5, extra="return [document.getElementById('offline-maps-list').innerText.slice(0,300), [...document.querySelectorAll('#offline-maps-list button, #offline-maps-list input, #offline-maps-list [onclick]')].map(e=>(e.innerText||e.type||'').trim().slice(0,20)+' :: '+(e.getAttribute('onclick')||e.getAttribute('onchange')||e.getAttribute('oninput')||'').slice(0,70))]")
R.save()
