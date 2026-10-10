import wd, time, re
from wd import click, dlg, CLEAN, setv
s = wd.session(); R = wd.Rec(s, 's9d')
s.js(CLEAN); wd.st(s)
s.js("map.setView([43.2, 44.8], 12, {animate:false})"); time.sleep(1)
openl = lambda: wd.open_by(s, '#btn-map-layer', 'modal-layers')
openl(); print(s.js("return [...document.querySelectorAll('#catalog-overlay-layers input[type=checkbox]')].map(e=>e.outerHTML.slice(0,150))"))
ovs = [re.search(r"toggleOverlay\('([^']+)'", a).group(1) for a in s.js("return [...document.querySelectorAll('#catalog-overlay-layers input[type=checkbox]')].map(e=>e.getAttribute('onchange'))") if a]
TL = "return [...document.querySelectorAll('#map .leaflet-tile-pane > .leaflet-layer')].map(l=>[l.style.opacity||'1', l.querySelectorAll('img.leaflet-tile-loaded').length, l.querySelectorAll('img').length])"
for n in ovs:
    R('overlay on: ' + n, lambda n=n: (openl(), click(s, f'#catalog-overlay-layers input[type=checkbox][onchange*="{n}"]')), wait=4, extra=TL)
    R('overlay opacity 30: ' + n, lambda n=n: setv(s, f'#catalog-overlay-layers input[type=range][oninput*="{n}"]', '30'), wait=0.5, extra=TL, shot=False)
    R('overlay off: ' + n, lambda n=n: click(s, f'#catalog-overlay-layers input[type=checkbox][onchange*="{n}"]'), wait=0.5, extra=TL, shot=False)
s.js(CLEAN)
R.save()
