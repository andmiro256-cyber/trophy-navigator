import wd, time, json
from wd import click, dlg, CLEAN, setv, key, focus_map
s = wd.session(new=True); s.c('POST', '/window/rect', {'width': 1600, 'height': 1000, 'x': 0, 'y': 0}); time.sleep(1)
R = wd.Rec(s, 's13')
s.js(CLEAN); wd.st(s)
NET = "return window.__audit.net.filter(r=>r.blocked).map(r=>[r.method, r.url, r.bodySnippet, r.headers])"
opensync = lambda: wd.open_by(s, '#toolbar button[title="Облачная синхронизация"]', 'modal-sync')
R('open sync', opensync, wait=1.5, extra="return [document.getElementById('sync-status-text').textContent, document.getElementById('sync-last-time').textContent, document.getElementById('license-card').innerText.replace(/\\s+/g,' ').slice(0,200), ['wpt','trk','rte','gpx'].map(k=>document.getElementById('sync-'+k+'-count').textContent)]")
R('Проверить (без email)', lambda: (s.js("window.__audit.net.length=0"), click(s, '#modal-sync .sync-status .btn-primary')), wait=2, extra="return [document.getElementById('sync-status-text').textContent, document.getElementById('sync-server-info').innerText.slice(0,100)]")
R('  requests', None, wait=0.1, extra=NET, shot=False)
R('Привязать: пустой email', lambda: (setv(s, '#sync-email', ''), click(s, '#modal-sync .prop-field .btn-primary')), wait=1, extra="return document.getElementById('sync-email-status').innerText")
R('Привязать: неверный email', lambda: (setv(s, '#sync-email', 'not-an-email'), click(s, '#modal-sync .prop-field .btn-primary')), wait=1, extra="return document.getElementById('sync-email-status').innerText")
R('Привязать: audit@example.invalid (заглушка 503)', lambda: (s.js("window.__audit.net.length=0"), setv(s, '#sync-email', 'audit@example.invalid'), click(s, '#modal-sync .prop-field .btn-primary')), wait=2, extra="return [document.getElementById('sync-email-status').innerText, localStorage.getItem('tnd-sync-email')]")
R('  requests', None, wait=0.1, extra=NET, shot=False)
R('Отправить в облако (без привязки)', lambda: (s.js("window.__audit.net.length=0"), click(s, '#modal-sync button[onclick="syncPush()"]')), wait=2, extra="return [document.getElementById('sync-status-text').textContent]")
R('  requests', None, wait=0.1, extra=NET, shot=False)
R('Загрузить из облака (без привязки)', lambda: (s.js("window.__audit.net.length=0"), click(s, '#modal-sync button[onclick="syncPull()"]')), wait=2, extra="return [document.getElementById('sync-server-info').innerText.slice(0,100)]")
R('  requests', None, wait=0.1, extra=NET, shot=False)
# заглушка успешной привязки — смотрим только UI
s.js("""window.__audit.netStub = (url, method) => {
  if (/email\\/register/.test(url)) return {status: 200, body: {ok: true, success: true, apiKey: 'audit-fake-key', api_key: 'audit-fake-key', email: 'audit@example.invalid'}};
  if (/sync\\/pull/.test(url)) return {status: 200, body: {ok: true, waypoints: [], tracks: [], routes: [], gpx: [], data: {waypoints: [], tracks: [], routes: []}}};
  if (/sync\\/push/.test(url)) return {status: 200, body: {ok: true}};
  if (/check-email|license|trial/.test(url)) return {status: 200, body: {ok: true}};
  return null; }""")
R('Привязать (заглушка 200)', lambda: (s.js("window.__audit.net.length=0"), setv(s, '#sync-email', 'audit@example.invalid'), click(s, '#modal-sync .prop-field .btn-primary')), wait=2, extra="return [document.getElementById('sync-email-status').innerText, localStorage.getItem('tnd-sync-email'), localStorage.getItem('tnd-sync-config')]")
R('  requests', None, wait=0.1, extra=NET, shot=False)
R('Проверить (заглушка pull пустой)', lambda: (s.js("window.__audit.net.length=0"), click(s, '#modal-sync .sync-status .btn-primary')), wait=2, extra="return [document.getElementById('sync-status-text').textContent, document.getElementById('sync-server-info').innerText.slice(0,200)]")
R('  requests', None, wait=0.1, extra=NET, shot=False)
R('Отправить (заглушка 200, только точки)', lambda: (s.js("window.__audit.net.length=0"), click(s, '#sync-cb-tracks'), click(s, '#sync-cb-routes'), click(s, '#sync-cb-gpx'), click(s, '#modal-sync button[onclick="syncPush()"]')), wait=2.5, extra="return [document.getElementById('sync-status-text').textContent, document.getElementById('sync-last-time').textContent]")
R('  requests', None, wait=0.1, extra="return window.__audit.net.filter(r=>r.blocked).map(r=>[r.method, r.url, (r.bodySnippet||'').slice(0,200), r.body])", shot=False)
R('Загрузить (заглушка пустой)', lambda: (s.js("window.__audit.net.length=0"), click(s, '#modal-sync button[onclick="syncPull()"]')), wait=2.5, extra="return [document.getElementById('sync-server-info').innerText.slice(0,200), waypoints.length, tracks.length, routes.length]")
R('  requests', None, wait=0.1, extra=NET, shot=False)
R('Закрыть', lambda: click(s, '#modal-sync .btn-row .btn-secondary'), extra="return document.getElementById('modal-sync').classList.contains('open')")
R.save()
