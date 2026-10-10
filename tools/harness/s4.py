import wd, json, time, os, subprocess
s = wd.session()
H = wd.A + '/home'
DL = H + '/Загрузки/'
EX = wd.WORK + '/audit-export/'
os.makedirs(EX, exist_ok=True)
CLEAN = "try{closeAllModals();}catch(e){} try{setMode('hand')}catch(e){} try{closeToolbarMore()}catch(e){} try{closeCtxMenu()}catch(e){}"
s.js(CLEAN); wd.st(s)
out = []
def q(path): s.js("window.__audit.dialogQueue.push(arguments[0])", path)
def files_btn(text):
    s.js(CLEAN); time.sleep(0.2)
    wd.click(s, '#toolbar .tb-group-label[onclick*=modal-files], #toolbar button[title^="Сохранить / Загрузить"]', wait=0.8)
    eids = s.find('#modal-files .save-btn-grid')
    for e in eids:
        t = s.c('GET', f'/element/{e}/text')
        if t.strip() == text: s.click(e); return True
    return False
def step(label, text, path=None, wait=2.0, extra=None):
    if path is not None: q(path)
    ok = files_btn(text); time.sleep(wait)
    a = wd.st(s); shot = 's4-' + str(len(out)).zfill(2); s.shot(shot)
    if extra: a['extra'] = s.js(extra)
    out.append({'label': label, 'btn': text, 'found': ok, 'path': path, 'after': a, 'shot': shot})
    print(label, ok, a.get('wp'), a.get('trk'), a.get('rte'), a.get('modals'), a.get('toasts'), a.get('errors'), [x for x in a.get('ipc', [])][:6])
step('cancel-dialog', '📥 GPX файл', None)
step('load-wpt', '📥 Точки (.wpt)', DL + 'audit-ozi.wpt', extra="return __tnTest.entities().wp.slice(-6).map(w=>[w.name, w.desc, w.radius, w.color])")
step('load-plt', '📥 Треки (.plt)', DL + 'audit-ozi.plt', extra="const t=tracks.at(-1); return [t.name, t.points.length, (t.pointsData||[]).slice(0,2)]")
step('load-rte', '📥 Маршруты (.rte)', DL + 'audit-ozi.rte', extra="const r=routes.at(-1); return [r.name, r.points.length, r.labels, r.pointWaypointIds, r.pointRadii]")
step('load-gpx', '📥 GPX файл', DL + 'audit-all.gpx', extra="return [__tnTest.stats().wp, tracks.map(t=>[t.name,t.points.length,(t.pointsData||[]).length]), routes.map(r=>[r.name,r.points.length])]")
# Загружено → Обновить
s.js(CLEAN); wd.click(s, '#toolbar button[title^="Сохранить / Загрузить"]')
wd.click(s, '#modal-files button.btn-secondary[onclick*=renderLoadedSourceFiles]')
lst = s.js("return document.getElementById('loaded-files-list').innerText")
s.shot('s4-loaded-list'); out.append({'label': 'loaded-list', 'text': lst}); print('LIST', lst)
# экспорт
for text, fn in [('💾 Точки (.wpt)', 'exp-wpt.wpt'), ('💾 Точки (.gpx)', 'exp-wpt.gpx'), ('💾 Треки (.plt)', 'exp-trk.plt'), ('💾 Треки (.gpx)', 'exp-trk.gpx'), ('💾 Маршруты (.rte)', 'exp-rte.rte'), ('💾 Маршруты (.gpx)', 'exp-rte.gpx')]:
    step('save ' + fn, text, EX + fn, wait=2.5)
    out[-1]['file'] = os.path.exists(EX + fn) and os.path.getsize(EX + fn)
    out[-1]['dialog_args'] = [r for r in out[-1]['after'].get('ipc', []) if 'dialog' in r]
# отмена диалога сохранения
step('save-cancel', '💾 Точки (.gpx)', None, wait=1.5)
# Сохранить в .gpx (диалог выбора)
step('save-gpx-dialog-open', '💾 Сохранить в .gpx', None, wait=1.0, extra="return [document.getElementById('modal-save-gpx')?.classList.contains('open'), document.getElementById('save-gpx-details')?.innerText, [...document.querySelectorAll('#modal-save-gpx button')].map(b=>b.innerText.trim()+' :: '+b.getAttribute('onclick'))]")
json.dump(out, open(wd.A + '/logs/s4.json', 'w'), ensure_ascii=False, indent=1)
