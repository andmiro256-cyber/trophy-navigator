import json, urllib.request, base64, time, os, subprocess
A = os.path.expanduser('~/desktop-audit') if os.path.exists(os.path.expanduser('~/desktop-audit')) else '/home/andrey-hp/desktop-audit'
A = '/home/andrey-hp/desktop-audit'
BASE = 'http://127.0.0.1:4455'
def req(method, path, body=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as f:
            return json.loads(f.read() or b'null')
    except urllib.error.HTTPError as e:
        return json.loads(e.read() or b'null')
class S:
    def __init__(self, sid=None, binary=A+'/app/cur/AppRun'):
        if sid: self.sid = sid; return
        r = req('POST', '/session', {'capabilities': {'alwaysMatch': {'webkitgtk:browserOptions': {'binary': binary, 'args': []}}}}, timeout=180)
        self.sid = r['value']['sessionId']
        open(A+'/logs/sid', 'w').write(self.sid)
    def c(self, m, p, b=None, t=120):
        r = req(m, f'/session/{self.sid}{p}', b, t)
        return r.get('value') if isinstance(r, dict) else r
    def js(self, script, *args, t=120):
        return self.c('POST', '/execute/sync', {'script': script, 'args': list(args)}, t)
    def ajs(self, script, *args, t=120):
        return self.c('POST', '/execute/async', {'script': script, 'args': list(args)}, t)
    def find(self, css):
        v = self.c('POST', '/elements', {'using': 'css selector', 'value': css})
        return [list(e.values())[0] for e in v] if isinstance(v, list) else []
    def click(self, eid):
        return self.c('POST', f'/element/{eid}/click', {})
    def shot(self, name):
        v = self.c('GET', '/screenshot')
        if isinstance(v, str):
            open(f'{A}/shots/{name}.png', 'wb').write(base64.b64decode(v))
        return name
    def quit(self):
        return req('DELETE', f'/session/{self.sid}')
def xshot(name):
    subprocess.run(f'xwd -root -display :99 -silent | convert xwd:- {A}/shots/{name}.png', shell=True)
def xdo(*args):
    return subprocess.run(['xdotool', *args], capture_output=True, text=True).stdout

HOOKS = open(A + '/hooks.js').read() if os.path.exists(A + '/hooks.js') else ''
RESULTS = A + '/logs/results.jsonl'
def rec(area, element, where, promise, status, evidence='', fix='', note=''):
    with open(RESULTS, 'a') as f:
        f.write(json.dumps(dict(area=area, element=element, where=where, promise=promise, status=status, evidence=evidence, fix=fix, note=note, ts=time.strftime('%H:%M:%S')), ensure_ascii=False) + '\n')
def session(new=False):
    if not new and os.path.exists(A + '/logs/sid'):
        s = S(open(A + '/logs/sid').read().strip())
        if isinstance(s.js('return 1'), int): return s
    if os.path.exists(A + '/logs/sid'):
        req('DELETE', '/session/' + open(A + '/logs/sid').read().strip())
        time.sleep(1)
    kill_app(); time.sleep(1)
    s = S()
    for _ in range(30):
        time.sleep(1)
        if s.js("return document.readyState==='complete' && !!window.map") is True: break
    time.sleep(3)
    print('hooks', s.js(HOOKS))
    return s
def kill_app():
    subprocess.run('pkill -f "[d]esktop-audit/app/v.*/usr/bin/trophy-navigator-desktop"', shell=True)

STATE_JS = r'''
const vis = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && (el.offsetWidth || el.offsetHeight);
const o = {};
o.modals = [...document.querySelectorAll('.modal-overlay.open, .modal-overlay[style*="flex"]')].map(e => e.id);
o.menus = ['ctx-menu','ctx-menu-map','ctx-menu-track','toolbar-more-menu'].filter(id => vis(document.getElementById(id)));
o.panels = ['live-sidebar','race-report-panel','ruler-panel','track-controls','route-controls','track-player-panel','route-build-panel','track-build-panel','onboarding-overlay','search-results','area-select-panel'].filter(id => vis(document.getElementById(id)));
try { o.mode = currentMode; } catch(e) {}
try { o.wp = waypoints.length; o.trk = tracks.length; o.rte = routes.length; } catch(e) {}
try { o.layer = currentBaseLayerName; } catch(e) {}
const A = window.__audit; if (A) { o.toasts = A.toasts.slice(); o.errors = A.errors.slice(); o.ipc = A.ipc.map(r => r.cmd + (r.err ? ' ERR ' + r.err : '') + (r.stub !== undefined ? ' STUB' : '')); o.net = A.net.map(r => r.method + ' ' + r.url + (r.blocked ? ' BLOCKED' : '')); A.dump(true); }
return o;
'''
def st(s):
    return s.js(STATE_JS)
def el(s, css, idx=0, visible=True):
    ids = s.find(css)
    if not visible: return ids[idx] if len(ids) > idx else None
    vis = []
    for e in ids:
        d = s.c('GET', f'/element/{e}/displayed')
        if d is True: vis.append(e)
    return vis[idx] if len(vis) > idx else None
def click(s, css, idx=0, wait=0.7):
    e = el(s, css, idx)
    if not e: return {'clickerr': 'not visible: ' + css}
    r = s.click(e)
    time.sleep(wait)
    return r
def clickxy(s, x, y, button=0, wait=0.5, double=False):
    acts = [{'type':'pointerMove','duration':0,'x':int(x),'y':int(y),'origin':'viewport'}]
    for _ in range(2 if double else 1):
        acts += [{'type':'pointerDown','button':button},{'type':'pointerUp','button':button}]
    s.c('POST', '/actions', {'actions':[{'type':'pointer','id':'mouse','parameters':{'pointerType':'mouse'},'actions':acts}]})
    s.c('DELETE', '/actions')
    time.sleep(wait)
def rclick_el(s, css):
    e = el(s, css)
    if not e: return False
    acts = [{'type':'pointerMove','duration':0,'origin':{'element-6066-11e4-a52f-4a1d6e9f8c3a': e},'x':0,'y':0},{'type':'pointerDown','button':2},{'type':'pointerUp','button':2}]
    s.c('POST', '/actions', {'actions':[{'type':'pointer','id':'mouse','parameters':{'pointerType':'mouse'},'actions':acts}]})
    s.c('DELETE', '/actions'); time.sleep(0.5); return True
def key(s, k, mods=()):
    MOD = {'ctrl':'','shift':'','alt':''}
    acts = [{'type':'keyDown','value':MOD[m]} for m in mods] + [{'type':'keyDown','value':k},{'type':'keyUp','value':k}] + [{'type':'keyUp','value':MOD[m]} for m in mods]
    s.c('POST', '/actions', {'actions':[{'type':'key','id':'kbd','actions':acts}]})
    s.c('DELETE', '/actions'); time.sleep(0.5)
def esc(s): key(s, '')
def latlng_xy(s, lat, lng):
    return s.js('const p = map.latLngToContainerPoint([arguments[0], arguments[1]]); const r = document.getElementById("map").getBoundingClientRect(); return [p.x + r.left, p.y + r.top];', lat, lng)

CLEAN = "try{closeAllModals();}catch(e){} try{setMode('hand')}catch(e){} try{closeToolbarMore()}catch(e){} try{closeCtxMenu()}catch(e){} try{dialogCancel()}catch(e){}"
def dlg(s, text=None, ok=True, wait=0.8):
    time.sleep(0.4)
    info = s.js("const d=document.getElementById('modal-dialog'); return [d.classList.contains('open'), document.getElementById('modal-dialog-title').textContent, document.getElementById('modal-dialog-message').innerText, document.getElementById('modal-dialog-ok').innerText]")
    if text is not None:
        e = el(s, '#modal-dialog-input')
        if e:
            s.c('POST', f'/element/{e}/clear', {})
            s.c('POST', f'/element/{e}/value', {'text': text})
    click(s, '#modal-dialog-ok' if ok else '#modal-dialog button.btn-secondary, #modal-dialog .modal-close', wait=wait)
    return info
def typein(s, css, text, clear=True):
    e = el(s, css)
    if not e: return False
    if clear: s.c('POST', f'/element/{e}/clear', {})
    s.c('POST', f'/element/{e}/value', {'text': text}); return True
class Rec:
    def __init__(self, s, prefix): self.s, self.prefix, self.items, self.n = s, prefix, [], 0
    def __call__(self, label, fn=None, wait=0.8, extra=None, shot=True):
        err = None
        try:
            r = fn() if fn else None
        except Exception as e:
            r = None; err = repr(e)
        time.sleep(wait)
        a = st(self.s)
        if extra:
            try: a['extra'] = self.s.js(extra)
            except Exception as e: a['extra'] = 'ERR ' + repr(e)
        name = f'{self.prefix}-{self.n:02d}'; self.n += 1
        if shot: self.s.shot(name)
        a.update({'label': label, 'shot': name if shot else '', 'ret': r, 'pyerr': err})
        self.items.append(a)
        print(name, label, '|', a.get('modals'), a.get('menus'), a.get('mode'), 'cnt', a.get('wp'), a.get('trk'), a.get('rte'), '| T', a.get('toasts'), '| E', a.get('errors'), '| I', [x for x in a.get('ipc', []) if not x.startswith('fs.exists')][:5], '| N', [x for x in a.get('net', []) if 'tile' not in x and 'ipc://' not in x][:3], '| X', json.dumps(a.get('extra'), ensure_ascii=False)[:400] if extra else '')
        return a
    def save(self):
        json.dump(self.items, open(f'{A}/logs/{self.prefix}.json', 'w'), ensure_ascii=False, indent=1)

def winoff(s):
    # смещение вьюпорта относительно экрана Xvfb
    wid = xdo('search', '--onlyvisible', '--class', 'trophy-navigator-desktop').split()
    geo = {}
    for w in wid:
        g = xdo('getwindowgeometry', '--shell', w)
        d = dict(l.split('=') for l in g.split() if '=' in l)
        if int(d.get('WIDTH', 0)) > 800: geo = d; break
    sx = s.js('return [window.screenX, window.screenY, window.outerHeight - window.innerHeight]')
    return int(geo.get('X', 0)), int(geo.get('Y', 0)) + 0, geo, sx
OFF = [0, 0]
def xclick(s, x, y, button=1, wait=0.6, double=False):
    X, Y = int(x) + OFF[0], int(y) + OFF[1]
    xdo('mousemove', '--sync', str(X), str(Y))
    time.sleep(0.1)
    if double: xdo('click', '--repeat', '2', '--delay', '80', str(button))
    else: xdo('click', str(button))
    time.sleep(wait)
def xclick_el(s, css, button=1, wait=0.6, dx=0, dy=0):
    r = s.js("const e=[...document.querySelectorAll(arguments[0])].find(e=>e.offsetWidth||e.offsetHeight); if(!e) return null; const r=e.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]", css)
    if not r: return False
    xclick(s, r[0] + dx, r[1] + dy, button, wait); return True
def xkey(*keys, wait=0.5):
    for k in keys: xdo('key', '--clearmodifiers', k); time.sleep(0.15)
    time.sleep(wait)
def xtype(text, wait=0.3):
    xdo('type', '--delay', '30', text); time.sleep(wait)

def setv(s, css, v):
    return s.js("const e=document.querySelector(arguments[0]); if(!e) return null; e.value=arguments[1]; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return e.value", css, v)
def focus_map(s):
    s.js("document.activeElement && document.activeElement.blur && document.activeElement.blur(); document.body.focus()")

def open_by(s, css, modal, tries=3):
    s.js(CLEAN); time.sleep(0.4)
    for i in range(tries):
        if s.js("return document.getElementById(arguments[0]).classList.contains('open')", modal): return i
        click(s, css, wait=0.8)
    ok = s.js("return document.getElementById(arguments[0]).classList.contains('open')", modal)
    print('   open_by', css, modal, ok)
    return ok

CLICKLOG = []
def click(s, css, idx=0, wait=0.7, button=1):
    r = s.js("""const els=[...document.querySelectorAll(arguments[0])].filter(e=>{const r=e.getBoundingClientRect(); const cs=getComputedStyle(e); return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'});
      const e=els[arguments[1]]; if(!e) return null; e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect();
      const x=r.x+Math.min(r.width/2, 40), y=r.y+r.height/2; const top=document.elementFromPoint(x,y);
      return [x, y, top===e||e.contains(top) ? 'ok' : 'covered by '+(top? top.tagName+'#'+top.id+'.'+top.className : 'null')]""", css, idx)
    if not r:
        CLICKLOG.append('NOT VISIBLE ' + css); print('   !! not visible:', css); return 'NOT VISIBLE'
    if r[2] != 'ok':
        CLICKLOG.append(css + ' ' + r[2]); print('   !! ', css, r[2])
    xclick(s, r[0], r[1], button=button, wait=wait)
    return r[2]

def q(s, path):
    s.js("window.__audit.dialogQueue.length=0; window.__audit.dialogQueue.push(arguments[0])", path)
def closewins(s, main):
    for h in s.c('GET', '/window/handles'):
        if h != main: s.c('POST', '/window', {'handle': h}); s.c('DELETE', '/window')
    s.c('POST', '/window', {'handle': main})
def ll_xy(s, lat, lng):
    return s.js("const p=map.latLngToContainerPoint([arguments[0],arguments[1]]); const r=document.getElementById('map').getBoundingClientRect(); return [p.x+r.left, p.y+r.top]", lat, lng)
