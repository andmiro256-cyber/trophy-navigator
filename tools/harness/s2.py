import wd, json, time
s = wd.session()
CLEAN = "try{closeAllModals();}catch(e){} try{setMode('hand')}catch(e){} try{closeToolbarMore()}catch(e){} try{closeCtxMenu()}catch(e){} try{ if (typeof objectsLocked!=='undefined' && objectsLocked) toggleLock(); }catch(e){} try{document.getElementById('onboarding-overlay')?.remove()}catch(e){}"
s.js(CLEAN); wd.st(s)
out = {}
for W in (1280, 1100, 900):
    s.c('POST', '/window/rect', {'width': W, 'height': 900}); time.sleep(1.2)
    vis = s.js(r'''return [innerWidth, [...document.querySelectorAll('#toolbar button')].filter(b=>b.offsetWidth&&b.offsetHeight&&getComputedStyle(b).visibility!=='hidden').map(b=>b.title||b.innerText.trim()), document.getElementById('toolbar').scrollWidth > document.getElementById('toolbar').clientWidth]''')
    s.shot(f's2-width-{W}')
    out[f'w{W}'] = vis
s.c('POST', '/window/rect', {'width': 1100, 'height': 900}); time.sleep(1)
res = []
n = s.js("return document.querySelectorAll('#toolbar-more-menu [role=menuitem]').length")
for i in range(n):
    r = wd.click(s, '#btn-more-tools'); st0 = wd.st(s)
    s.shot(f's2-more-open')
    items = s.find('#toolbar-more-menu [role=menuitem]')
    label = s.js("return document.querySelectorAll('#toolbar-more-menu [role=menuitem]')[arguments[0]].innerText.trim()", i)
    s.click(items[i]); time.sleep(1.2)
    a = wd.st(s); s.shot(f's2-more-{i}')
    res.append({'i': i, 'label': label, 'menu_open': st0.get('menus'), 'after': a})
    wd.esc(s); s.js(CLEAN); time.sleep(0.4); wd.st(s)
out['more'] = res
# клавиатура в меню ⋯
wd.click(s, '#btn-more-tools')
seq = []
for k in ['', '', '', '', '']:  # down down up home end
    wd.key(s, k); seq.append(s.js("return document.activeElement.innerText.trim()"))
wd.esc(s); seq.append(['after esc', s.js("return [document.activeElement.id, !document.getElementById('toolbar-more-menu').hidden]")])
out['more_keys'] = seq
# resize закрывает меню
wd.click(s, '#btn-more-tools'); s.c('POST', '/window/rect', {'width': 1150, 'height': 900}); time.sleep(1)
out['resize_closes'] = s.js("return document.getElementById('toolbar-more-menu').hidden")
s.c('POST', '/window/rect', {'width': 1600, 'height': 1000}); time.sleep(1)
s.js(CLEAN); wd.st(s)
json.dump(out, open(wd.A + '/logs/s2.json', 'w'), ensure_ascii=False, indent=1)
