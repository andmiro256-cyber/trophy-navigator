import wd, time, os
from wd import click, dlg, CLEAN, setv
s = wd.session(); R = wd.Rec(s, 's10b')
MAPS = wd.A + '/home/Документы/TrophyNavigatorTest/maps/'
print(s.js("return [document.getElementById('modal-download-settings').classList.contains('open'), [...document.querySelectorAll('#dl-layer-radios input')].map(i=>[i.value, i.checked]).slice(0,5), document.getElementById('dl-est-tiles').textContent]"))
R('radio OSM', lambda: click(s, '#dl-layer-radios input[value="OpenStreetMap"], #dl-layer-radios label:first-child'), extra="return [[...document.querySelectorAll('#dl-layer-radios input')].filter(i=>i.checked).map(i=>i.value), document.getElementById('dl-est-tiles').textContent, document.getElementById('dl-est-size').textContent, document.getElementById('dl-zoom-min').value, document.getElementById('dl-zoom-max').value]")
R('zoom 10..13 again', lambda: (setv(s, '#dl-zoom-min', '10'), setv(s, '#dl-zoom-max', '13')), extra="return [document.getElementById('dl-est-tiles').textContent, document.getElementById('dl-est-size').textContent, document.getElementById('dl-est-warn').textContent]")
R('⬇ Скачать (save to maps/)', lambda: (wd.q(s, MAPS + 'audit-magas.sqlitedb'), click(s, '#dl-buttons .btn-primary')), wait=2, extra="return [getComputedStyle(document.getElementById('dl-progress-area')).display, document.getElementById('dl-prog-status').textContent]")
for i in range(40):
    st = s.js("return [getComputedStyle(document.getElementById('dl-progress-area')).display, document.getElementById('dl-prog-status').textContent, document.getElementById('modal-download-settings').classList.contains('open')]")
    if not st[2] or st[0] == 'none' or any(w in st[1] for w in ('Готово', 'шибк', 'Скачано', 'вершен')): break
    time.sleep(2)
R('download result', None, wait=1, extra="return [document.getElementById('dl-prog-status').textContent, document.getElementById('modal-download-settings').classList.contains('open')]")
print('FILES', [(f, os.path.getsize(MAPS+f)) for f in os.listdir(MAPS) if os.path.isfile(MAPS+f)])
s.js(CLEAN)
R('Мои карты after', lambda: (wd.open_by(s, '#toolbar button[title^="Офлайн карты"]', 'modal-offline'), click(s, '#modal-offline .tab-btn[aria-controls="tab-offline-list"]'), click(s, '#tab-offline-list > .btn-secondary')), wait=1.5, extra="return [document.getElementById('offline-maps-list').innerText.slice(0,300), [...document.querySelectorAll('#offline-maps-list button, #offline-maps-list input, #offline-maps-list [onclick]')].map(e=>(e.innerText||e.type||'').trim().slice(0,20)+' :: '+(e.getAttribute('onclick')||e.getAttribute('onchange')||e.getAttribute('oninput')||'').slice(0,70))]")
R.save()
