import wd, time, json
from wd import click, dlg, CLEAN, setv
s = wd.session(); R = wd.Rec(s, 's9')
s.js(CLEAN); wd.st(s)
s.js("__tnTest.setView({center:{lat:43.2,lng:44.8},zoom:12})"); time.sleep(1)
s.js("__tnTest.resetTileStats()")  # счётчики тайлов по слоям — __tnTest.layers() (API-GAPS G5)
openl = lambda: wd.open_by(s, '#btn-map-layer', 'modal-layers')
openl()
names = s.js("return [...document.querySelectorAll('#modal-layers [data-layer]')].map(e=>e.dataset.layer)")
for n in names:
    def f(n=n):
        openl(); s.js("__tnTest.resetTileStats()")
        click(s, f'#modal-layers [data-layer="{n}"] > span:first-child, #modal-layers [data-layer="{n}"]')
    R('base: ' + n, f, wait=5, extra="return [currentBaseLayerName, document.getElementById('current-layer-name').textContent, __tnh.tiles(), document.getElementById('sb-layer')?.textContent || '']")
s.js(CLEAN)
R('base: back to OSM', lambda: (openl(), click(s, '#modal-layers [data-layer="OpenStreetMap"] > span:first-child, #modal-layers [data-layer="OpenStreetMap"]')), wait=2, extra="return currentBaseLayerName")
ovs = s.js("return [...document.querySelectorAll('#catalog-overlay-layers input[type=checkbox]')].map(e=>e.getAttribute('onclick').match(/toggleOverlay\\('([^']+)'/)[1])")
for n in ovs:
    def f(n=n):
        openl(); s.js("__tnTest.resetTileStats()")
        click(s, f'#catalog-overlay-layers input[type=checkbox][onclick*="{n}"]')
    R('overlay on: ' + n, f, wait=4, extra="return [__tnTest.layers().filter(l=>l.kind==='overlay').map(l=>l.name), __tnh.tiles()]")
    R('overlay opacity 30: ' + n, lambda n=n: setv(s, f'#catalog-overlay-layers input[type=range][oninput*="{n}"], #catalog-overlay-layers input[type=range][onchange*="{n}"]', '30'), wait=0.5, extra="return __tnTest.layers().map(l=>[l.kind, l.name, l.opacity])", shot=False)
    R('overlay off: ' + n, lambda n=n: click(s, f'#catalog-overlay-layers input[type=checkbox][onclick*="{n}"]'), wait=0.5, extra="return __tnTest.layers().filter(l=>l.kind==='overlay').map(l=>l.name)", shot=False)
# свои карты
R('custom: + Добавить', lambda: (openl(), click(s, '#modal-layers [onclick="showAddCustomLayer()"]')), extra="return getComputedStyle(document.getElementById('custom-layer-form')).display")
R('custom: Отмена', lambda: click(s, '#custom-layer-form button[onclick="hideAddCustomLayer()"]'), extra="return getComputedStyle(document.getElementById('custom-layer-form')).display")
R('custom: add bad URL', lambda: (click(s, '#modal-layers [onclick="showAddCustomLayer()"]'), setv(s, '#cl-name', 'Плохая'), setv(s, '#cl-url', 'https://example.com/tile.png'), click(s, '#custom-layer-form .btn-primary')), extra="return customLayers.map(l=>l.name)")
R('custom: add OSM URL', lambda: (setv(s, '#cl-name', 'Аудит OSM'), setv(s, '#cl-url', 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'), setv(s, '#cl-subdomains', 'abc'), click(s, '#custom-layer-form .btn-primary')), extra="return [customLayers.map(l=>l.name), localStorage.getItem('tnd-custom-layers')?.length]")
R('custom: select', lambda: (s.js("__tnTest.resetTileStats()"), click(s, '#custom-layers-list [onclick^="setCustomLayer"]')), wait=4, extra="return [currentBaseLayerName, __tnh.tiles()]")
R('custom: import Locus .xml', lambda: (openl(), click(s, '#modal-layers [onclick="showAddCustomLayer()"]'), wd.q(s, wd.A + '/home/Загрузки/audit-locus.xml'), click(s, '#custom-layer-form button[onclick*="importLocusXml"]')), wait=1.5, extra="return customLayers.map(l=>[l.name, l.url])")
R('custom: delete', lambda: (openl(), click(s, '#custom-layers-list [title="Удалить"]')), wait=0.6, extra="return [customLayers.map(l=>l.name), document.getElementById('modal-dialog').classList.contains('open')]")
if s.js("return document.getElementById('modal-dialog').classList.contains('open')"): R('custom: delete confirm', lambda: dlg(s), extra="return [customLayers.map(l=>l.name), currentBaseLayerName]")
# скрыть карту ✕ и менеджер
R('hide layer ✕ (OpenTopoMap)', lambda: (openl(), click(s, '#modal-layers [onclick*="toggleLayerHidden(\'opentopomap\')"]')), extra="return [localStorage.getItem('tnd-hidden-layers'), !!document.querySelector('#modal-layers [data-layer=\"OpenTopoMap\"]')]")
R('hidden manager 👁', lambda: click(s, '#modal-layers [onclick*="showHiddenLayersManager"]'), extra="return [...document.querySelectorAll('.modal-overlay.open')].map(e=>e.id).concat([document.body.innerText.includes('Скрытые карты')])")
R('hidden manager: restore', lambda: click(s, '[onclick*="toggleLayerHidden(\'opentopomap\')"]'), extra="return [localStorage.getItem('tnd-hidden-layers')]")
s.js(CLEAN)
R('catalog 🔄', lambda: (openl(), click(s, '#modal-layers [onclick*="refreshTileCatalog"]')), wait=3, extra="return document.querySelectorAll('#modal-layers [data-layer]').length")
s.js(CLEAN)
R.save()
