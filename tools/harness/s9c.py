import wd, time, re
from wd import click, dlg, CLEAN, setv
s = wd.session(); R = wd.Rec(s, 's9c')
s.js(CLEAN); wd.st(s)
s.js("map.setView([43.2, 44.8], 12, {animate:false})"); time.sleep(1)
openl = lambda: wd.open_by(s, '#btn-map-layer', 'modal-layers')
openl(); print(s.js("return [...document.querySelectorAll('#catalog-overlay-layers input[type=checkbox]')].map(e=>e.outerHTML.slice(0,150))"))
ovs = [re.search(r"toggleOverlay\('([^']+)'", a).group(1) for a in s.js("return [...document.querySelectorAll('#catalog-overlay-layers input[type=checkbox]')].map(e=>e.getAttribute('onclick'))") if a]
TL = "return [...document.querySelectorAll('#map .leaflet-tile-pane > .leaflet-layer')].map(l=>[l.style.opacity||'1', l.querySelectorAll('img.leaflet-tile-loaded').length, l.querySelectorAll('img').length])"
for n in ovs:
    R('overlay on: ' + n, lambda n=n: (openl(), click(s, f'#catalog-overlay-layers input[type=checkbox][onclick*="{n}"]')), wait=4, extra=TL)
    R('overlay opacity 30: ' + n, lambda n=n: setv(s, f'#catalog-overlay-layers input[type=range][oninput*="{n}"]', '30'), wait=0.5, extra=TL, shot=False)
    R('overlay off: ' + n, lambda n=n: click(s, f'#catalog-overlay-layers input[type=checkbox][onclick*="{n}"]'), wait=0.5, extra=TL, shot=False)
for n in ['Яндекс Карты', 'Яндекс Спутник']:
    R('base again: ' + n, lambda n=n: (openl(), click(s, f'#modal-layers [data-layer="{n}"] > span:first-child')), wait=6, extra=TL)
R('custom ✕ delete', lambda: (openl(), click(s, '#custom-layers-list [title="Удалить"]')), wait=0.8, extra="return [customLayers.map(l=>l.name), currentBaseLayerName]")
R('back to OSM', lambda: (openl(), click(s, '#modal-layers [data-layer="OpenStreetMap"] > span:first-child')), wait=2, extra="return currentBaseLayerName")
s.js(CLEAN)
R.save()
