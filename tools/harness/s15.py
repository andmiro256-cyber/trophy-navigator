import wd, time, os
from wd import click, dlg, CLEAN, setv, key, focus_map
s = wd.session(); R = wd.Rec(s, 's15')
s.js(CLEAN); wd.st(s)
EXP = wd.WORK + '/audit-export/'
# свежие данные: GPX трек с временем + маршрут
wd.q(s, wd.A + '/home/Загрузки/audit-all.gpx'); s.js("openFile('.gpx,.GPX', loadGPXFile)"); time.sleep(2); s.js(CLEAN)
R('open RR dialog (Треки → Race Report)', lambda: (wd.open_by(s, '#toolbar button[title="Список треков"]', 'modal-tracks'), click(s, '#modal-tracks button[onclick="rrOpenDialog()"]')), extra="return [[...document.getElementById('rr-select-track').options].map(o=>o.text), [...document.getElementById('rr-select-route').options].map(o=>o.text), document.getElementById('rr-cp-radius').value, ['h','m','s'].map(k=>document.getElementById('rr-start-'+k).value)]")
s.js("const t=document.getElementById('rr-select-track'); t.selectedIndex=[...t.options].findIndex(o=>/Ингушетия/.test(o.text)); t.dispatchEvent(new Event('change')); const r=document.getElementById('rr-select-route'); r.selectedIndex=[...r.options].findIndex(o=>/Тест маршрут/.test(o.text)); r.dispatchEvent(new Event('change'));")
R('Сформировать', lambda: click(s, '#modal-race-report .btn-primary'), wait=3, extra="return [getComputedStyle(document.getElementById('race-report-panel')).display, document.getElementById('race-report-panel').classList.value, document.getElementById('rr-header-info').textContent, document.getElementById('rr-overview').innerText.replace(/\\s+/g,' ').slice(0,300), document.getElementById('rr-segments-table').innerText.replace(/\\s+/g,' ').slice(0,300)]")
for t in ['charts', 'timeline', 'segments']:
    R('tab ' + t, lambda t=t: click(s, f'#race-report-panel .rr-tab[data-tab="{t}"]'), wait=1.2, extra=f"return [document.getElementById('rr-content-{t}').classList.contains('active'), document.getElementById('rr-content-{t}').innerText.replace(/\\s+/g,' ').slice(0,120), (document.getElementById('rr-chart-speed')||{{}}).width]")
R('segment row click', lambda: click(s, '#rr-segments-table tbody tr, #rr-segments-table tr:nth-child(2)'), wait=1, extra="return [__tnTest.getView().center.lat.toFixed(3), __tnTest.getView().zoom]")
R('Экспорт HTML', lambda: (wd.q(s, EXP + 'race-report.html'), click(s, '#race-report-panel .rr-header button')), wait=2.5, extra="return null")
print('HTML', os.path.exists(EXP + 'race-report.html') and os.path.getsize(EXP + 'race-report.html'))
R('resize handle drag', lambda: (lambda r: (wd.xdo('mousemove', str(int(r[0])), str(int(r[1]))), wd.xdo('mousedown', '1'), wd.xdo('mousemove', str(int(r[0])), str(int(r[1]) - 120)), wd.xdo('mouseup', '1')))(s.js("const r=document.getElementById('rr-resize-handle').getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]")), wait=1, extra="return document.getElementById('race-report-panel').getBoundingClientRect().height")
R('✕ close report', lambda: click(s, '#race-report-panel .rr-close'), wait=1, extra="return [getComputedStyle(document.getElementById('race-report-panel')).display, document.getElementById('race-report-panel').classList.value]")
R('RR dialog Отмена', lambda: (wd.open_by(s, '#toolbar button[title="Список треков"]', 'modal-tracks'), click(s, '#modal-tracks button[onclick="rrOpenDialog()"]'), click(s, '#modal-race-report .btn-secondary')), extra="return document.getElementById('modal-race-report').classList.contains('open')")
R('RR без маршрута', lambda: (click(s, '#modal-tracks button[onclick="rrOpenDialog()"]'), s.js("const r=document.getElementById('rr-select-route'); r.selectedIndex=0; r.dispatchEvent(new Event('change'))"), click(s, '#modal-race-report .btn-primary')), wait=2, extra="return [document.getElementById('rr-header-info').textContent]")
s.js("try{rrClose()}catch(e){}"); s.js(CLEAN)
R.save()
