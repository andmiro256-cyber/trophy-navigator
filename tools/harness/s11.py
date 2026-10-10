import wd, time, os
from wd import click, dlg, CLEAN, setv
s = wd.session(); R = wd.Rec(s, 's11')
s.js(CLEAN); wd.st(s)
VEC = wd.A + '/home/Документы/TrophyNavigatorTest/maps/vector/'
openl = lambda: wd.open_by(s, '#btn-map-layer', 'modal-layers')
W = "const o=document.getElementById('modal-tnmaps'); return o ? [o.classList.contains('open'), o.querySelector('[data-tnmaps-status]')?.textContent, o.querySelectorAll('.tnmaps-item').length, o.querySelector('[data-tnmaps-dir]')?.textContent, [...o.querySelectorAll('.tnmaps-group')].map(g=>g.textContent)] : null"
R('layers: TrophyNav Maps section', openl, wait=1.5, extra="return document.getElementById('tnmaps-layers').innerText.slice(0,200)")
R('⬇ Карты областей', lambda: click(s, '#modal-layers .tnmaps-link'), wait=4, extra=W)
R('search "Инг"', lambda: setv(s, '#modal-tnmaps [data-tnmaps-search]', 'Инг'), wait=0.5, extra="return [...document.querySelectorAll('#modal-tnmaps .tnmaps-item')].map(e=>e.innerText.replace(/\\s+/g,' ').slice(0,120))")
R('search nothing', lambda: setv(s, '#modal-tnmaps [data-tnmaps-search]', 'zzzz'), wait=0.5, extra="return document.querySelector('#modal-tnmaps [data-tnmaps-list]').innerText", shot=False)
setv(s, '#modal-tnmaps [data-tnmaps-search]', 'Инг'); time.sleep(0.5)
R('🔄 reload catalog', lambda: click(s, '#modal-tnmaps [data-tnmaps-act="reload"]'), wait=4, extra=W)
setv(s, '#modal-tnmaps [data-tnmaps-search]', 'Инг'); time.sleep(0.5)
R('⬇ Скачать Ингушетия', lambda: click(s, '#modal-tnmaps [data-tnmaps-act="download"]'), wait=2, extra="return [...document.querySelectorAll('#modal-tnmaps .tnmaps-item')].map(e=>e.innerText.replace(/\\s+/g,' ').slice(0,160))")
# прогресс и кнопка Остановить
time.sleep(1)
R('progress', None, wait=0.5, extra="return [...document.querySelectorAll('#modal-tnmaps .tnmaps-item')].map(e=>e.innerText.replace(/\\s+/g,' ').slice(0,160))")
t0 = time.time()
for i in range(120):
    t = s.js("return document.querySelector('#modal-tnmaps').innerText")
    if 'Остановить' not in t: break
    time.sleep(2)
print('download took', int(time.time()-t0))
R('after download', None, wait=1, extra="return [[...document.querySelectorAll('#modal-tnmaps .tnmaps-item')].map(e=>e.innerText.replace(/\\s+/g,' ').slice(0,200)), document.querySelector('#modal-tnmaps [data-tnmaps-dir]')?.textContent]")
print('VEC', [(f, os.path.getsize(VEC+f)) for f in os.listdir(VEC)])
R('Показать', lambda: click(s, '#modal-tnmaps [data-tnmaps-act="show"]'), wait=6, extra="return [currentBaseLayerName, document.getElementById('current-layer-name').textContent, map.getCenter().lat.toFixed(3), map.getZoom(), document.querySelectorAll('.maplibregl-canvas, canvas.maplibregl-canvas').length]")
R('layers: controls (theme/relief/poi/3D)', lambda: openl(), wait=2, extra="return [document.getElementById('tnmaps-layers').innerText.replace(/\\s+/g,' ').slice(0,400), [...document.querySelectorAll('#tnmaps-layers button, #tnmaps-layers input')].map(e=>(e.dataset.tnmapsTheme||e.dataset.tnmapsRelief||(e.hasAttribute('data-tnmaps-3d')?'3d':'')||(e.hasAttribute('data-tnmaps-strength')?'strength':'')||(e.dataset.tnmapsPoi||'')||(e.hasAttribute('data-tnmaps-poi-toggle')?'poi-toggle':'')||(e.hasAttribute('data-tnmaps-poi-all')?'poi-all':'')||e.innerText.trim().slice(0,20)))]")
themes = s.js("return [...document.querySelectorAll('#tnmaps-layers [data-tnmaps-theme]')].map(e=>e.dataset.tnmapsTheme)") or []
for th in themes:
    R('theme ' + th, lambda th=th: (openl(), click(s, f'#tnmaps-layers [data-tnmaps-theme="{th}"]')), wait=3, extra="return [localStorage.getItem('tnmaps-theme') || Object.keys(localStorage).filter(k=>/tnmaps/.test(k)).map(k=>k+'='+localStorage.getItem(k).slice(0,60))]")
R('relief on', lambda: (openl(), click(s, '#tnmaps-layers [data-tnmaps-relief="on"]')), wait=3, extra="return Object.keys(localStorage).filter(k=>/tnmaps|relief/.test(k)).map(k=>k+'='+localStorage.getItem(k).slice(0,80))")
R('contours', lambda: (openl(), click(s, '#tnmaps-layers [data-tnmaps-relief="contours"]')), wait=3, extra="return Object.keys(localStorage).filter(k=>/relief/.test(k)).map(k=>k+'='+localStorage.getItem(k).slice(0,80))")
R('slope', lambda: (openl(), click(s, '#tnmaps-layers [data-tnmaps-relief="slope"]')), wait=3, extra="return [Object.keys(localStorage).filter(k=>/relief/.test(k)).map(k=>k+'='+localStorage.getItem(k).slice(0,80)), document.querySelector('#tnmaps-layers [data-tnmaps-relief=\"slope\"]')?.disabled]")
R('strength 12', lambda: (openl(), s.js("const e=document.querySelector('#tnmaps-layers [data-tnmaps-strength]'); e.value=12; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}))")), wait=3, extra="return Object.keys(localStorage).filter(k=>/relief/.test(k)).map(k=>k+'='+localStorage.getItem(k).slice(0,80))")
R('POI toggle list', lambda: (openl(), click(s, '#tnmaps-layers [data-tnmaps-poi-toggle]')), wait=1, extra="return [document.querySelector('#tnmaps-layers [data-tnmaps-poi-list]')?.hidden, document.querySelectorAll('#tnmaps-layers [data-tnmaps-poi]').length]")
R('POI uncheck first', lambda: click(s, '#tnmaps-layers [data-tnmaps-poi]'), wait=2, extra="return [Object.keys(localStorage).filter(k=>/poi/i.test(k)).map(k=>k+'='+localStorage.getItem(k).slice(0,80)), document.querySelector('#tnmaps-layers [data-tnmaps-poi-toggle]')?.innerText]")
R('POI all/none', lambda: click(s, '#tnmaps-layers [data-tnmaps-poi-all]'), wait=2, extra="return [Object.keys(localStorage).filter(k=>/poi/i.test(k)).map(k=>k+'='+localStorage.getItem(k).slice(0,80))]")
R('⛰ 3D', lambda: (openl(), click(s, '#tnmaps-layers [data-tnmaps-3d]')), wait=8, extra="return [document.querySelectorAll('.modal-overlay.open').length, [...document.querySelectorAll('body > div')].filter(d=>d.offsetWidth>500 && /3D|3d/.test(d.className+d.id+d.innerText.slice(0,50))).map(d=>(d.id||d.className).slice(0,40)), window.__audit.errors.slice(-3)]")
R.save()
