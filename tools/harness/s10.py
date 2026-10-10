import wd, time
from wd import click, dlg, CLEAN, setv, key, focus_map
s = wd.session(); R = wd.Rec(s, 's10')
s.js("try{cancelAreaSelect()}catch(e){} try{map.closePopup()}catch(e){}")
s.js(CLEAN); wd.st(s)
MAPS = wd.A + '/home/Документы/TrophyNavigatorTest/maps/'
openo = lambda: wd.open_by(s, '#toolbar button[title^="Офлайн карты"]', 'modal-offline')
R('open offline', openo, wait=1.5, extra="return [document.getElementById('offline-maps-list').innerText.slice(0,200), getComputedStyle(document.getElementById('offline-maps-empty')).display]")
for tab, lbl in [('tab-offline-download','Скачать'),('tab-offline-load','Загрузить файл'),('tab-offline-list','Мои карты')]:
    R('tab ' + lbl, lambda tab=tab: click(s, f'#modal-offline .tab-btn[aria-controls="{tab}"]'), extra=f"return document.getElementById('{tab}').classList.contains('active')")
R('🔄 Обновить список', lambda: click(s, '#tab-offline-list .btn-secondary'), wait=1, extra="return document.getElementById('offline-maps-list').innerText.slice(0,200)")
s.js("map.setView([43.17, 44.82], 12, {animate:false})"); time.sleep(1.5)
R('📍 Выделить область', lambda: (click(s, '#modal-offline .tab-btn[aria-controls="tab-offline-download"]'), click(s, '#tab-offline-download .btn-primary')), extra="return [document.querySelectorAll('.modal-overlay.open').length, getComputedStyle(document.getElementById('polygon-toolbar')).display, document.getElementById('pt-count').textContent]")
R('area: 2 pts (Готово disabled?)', lambda: (wd.xclick(s, 300, 300), wd.xclick(s, 420, 300)), extra="return [document.getElementById('pt-count').textContent, document.getElementById('btn-polygon-done').disabled]")
R('area: 3rd + 4th pt', lambda: (wd.xclick(s, 420, 380), wd.xclick(s, 300, 380)), extra="return [document.getElementById('pt-count').textContent, document.getElementById('btn-polygon-done').disabled]")
R('area: ↩ Отменить', lambda: click(s, '#polygon-toolbar button[onclick="undoPolygonPoint()"]'), extra="return document.getElementById('pt-count').textContent")
R('area: re-add + ✓ Готово', lambda: (wd.xclick(s, 300, 380), click(s, "#btn-polygon-done")), wait=1.5, extra="return [[...document.querySelectorAll('.modal-overlay.open')].map(e=>e.id), document.getElementById('dl-sw').textContent, document.getElementById('dl-ne').textContent, document.getElementById('dl-est-tiles').textContent, document.getElementById('dl-est-size').textContent, [...document.querySelectorAll('#dl-layer-radios input')].length, [...document.getElementById('dl-format').options].map(o=>o.text), [...document.getElementById('dl-layer2-select').options].length, document.querySelectorAll('#dl-overlay-checks input').length]")
R('zoom min 10 / max 12', lambda: (setv(s, '#dl-zoom-min', '10'), setv(s, '#dl-zoom-max', '12')), extra="return [document.getElementById('dl-zoom-min-val').textContent, document.getElementById('dl-zoom-max-val').textContent, document.getElementById('dl-est-tiles').textContent, document.getElementById('dl-est-size').textContent]")
R('zoom min > max', lambda: setv(s, '#dl-zoom-min', '14'), extra="return [document.getElementById('dl-zoom-min').value, document.getElementById('dl-zoom-max').value]")
R('zoom back', lambda: (setv(s, '#dl-zoom-min', '10'), setv(s, '#dl-zoom-max', '12')), extra="return [document.getElementById('dl-est-tiles').textContent]", shot=False)
R('layer2 select', lambda: s.js("const e=document.getElementById('dl-layer2-select'); e.selectedIndex=Math.min(1, e.options.length-1); e.dispatchEvent(new Event('change'))"), extra="return [document.getElementById('dl-layer2-select').value, getComputedStyle(document.getElementById('dl-layer2-opacity-row')).display, document.getElementById('dl-est-tiles').textContent]")
R('layer2 opacity 30', lambda: setv(s, '#dl-layer2-opacity', '30'), extra="return document.getElementById('dl-layer2-opacity-val').textContent", shot=False)
R('layer2 none', lambda: s.js("const e=document.getElementById('dl-layer2-select'); e.selectedIndex=0; e.dispatchEvent(new Event('change'))"), extra="return document.getElementById('dl-est-tiles').textContent", shot=False)
R('filename', lambda: setv(s, '#dl-filename', 'audit-magas.sqlitedb'), extra="return document.getElementById('dl-filename').value", shot=False)
R('⬇ Скачать', lambda: click(s, '#dl-buttons .btn-primary'), wait=1.5, extra="return [getComputedStyle(document.getElementById('dl-progress-area')).display, document.getElementById('dl-prog-status').textContent]")
for i in range(30):
    st = s.js("return [getComputedStyle(document.getElementById('dl-progress-area')).display, document.getElementById('dl-prog-status').textContent, document.getElementById('modal-download-settings').classList.contains('open')]")
    if st[0] == 'none' or not st[2] or 'Готово' in st[1] or 'ошиб' in st[1].lower(): break
    time.sleep(2)
R('download result', None, wait=1, extra="return [document.getElementById('dl-prog-status').textContent, document.getElementById('modal-download-settings').classList.contains('open')]")
import os
R('file on disk', None, wait=0.1, extra="return null", shot=False)
print('FILES', os.listdir(MAPS))
R('Мои карты after', lambda: (openo(), click(s, '#tab-offline-list .btn-secondary')), wait=1.5, extra="return [document.getElementById('offline-maps-list').innerText.slice(0,300), [...document.querySelectorAll('#offline-maps-list button, #offline-maps-list input, #offline-maps-list [onclick]')].map(e=>(e.innerText||e.type||'').trim().slice(0,20)+' :: '+(e.getAttribute('onclick')||e.getAttribute('onchange')||'').slice(0,60))]")
R.save()
