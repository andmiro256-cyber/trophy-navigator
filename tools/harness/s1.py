import wd, json, time, sys
s = wd.session(new=True)
print(s.c('POST', '/window/rect', {'width': 1600, 'height': 1000, 'x': 0, 'y': 0}))
time.sleep(1)
print(s.js('return [innerWidth, innerHeight]'))
wd.st(s)
s.shot('s1-wide-start')
out = {}
# всё что видно в тулбаре
items = s.js(r'''return [...document.querySelectorAll('#toolbar button')].map((b,i)=>({i, id:b.id, title:b.title||b.getAttribute('aria-label')||'', text:b.innerText.trim(), on:b.getAttribute('onclick')||'', vis: !!(b.offsetWidth&&b.offsetHeight) && getComputedStyle(b).visibility!=='hidden'}))''')
out['toolbar_items'] = items
res = []
for it in items:
    if not it['vis']: continue
    if 'clearSearch' in it['on']: continue
    sel = f"#toolbar button:nth-of-type(1)"
    eid = s.find('#toolbar button')[it['i']]
    s.click(eid); time.sleep(1.2)
    a = wd.st(s)
    name = f"s1-tb-{it['i']:02d}"
    s.shot(name)
    res.append({'item': it, 'after': a, 'shot': name})
    # закрыть всё
    wd.esc(s); time.sleep(0.3)
    s.js("try{closeAllModals();}catch(e){} try{setMode('hand')}catch(e){} try{ if (typeof liveEnabled!=='undefined' && liveEnabled) toggleLive(); }catch(e){} try{closeToolbarMore()}catch(e){} try{closeCtxMenu()}catch(e){}")
    time.sleep(0.4)
    res[-1]['cleanup'] = wd.st(s)
out['res'] = res
json.dump(out, open(wd.A + '/logs/s1.json', 'w'), ensure_ascii=False, indent=1)
print('done', len(res))
