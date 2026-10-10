import wd, time, json
s = wd.session()
wd.open_by(s, '#btn-map-layer', 'modal-layers')
time.sleep(2)
inv = s.js(r'''const m=document.getElementById('modal-layers');
return {base:[...m.querySelectorAll('[data-layer]')].map(e=>[e.dataset.layer, e.getAttribute('onclick')||'', e.closest('[id]')?.id, e.innerText.trim().slice(0,40)]),
 overlays:[...m.querySelectorAll('#catalog-overlay-layers *')].filter(e=>/^(INPUT|BUTTON|SELECT)$/.test(e.tagName)||e.getAttribute('onclick')).map(e=>[e.tagName, e.type||'', e.getAttribute('onclick')||e.getAttribute('onchange')||e.getAttribute('oninput')||'', (e.closest('div')?.innerText||'').trim().slice(0,40)]),
 other:[...m.querySelectorAll('[onclick],button,input,select')].filter(e=>!e.closest('#catalog-overlay-layers')&&!e.dataset.layer).map(e=>[e.tagName, e.id, (e.innerText||e.title||e.placeholder||'').trim().slice(0,30), (e.getAttribute('onclick')||'').slice(0,60)]),
 tnm: document.getElementById('tnmaps-layers').innerHTML.length,
 premium: [typeof isPremiumAvailable==='function' && isPremiumAvailable(), document.getElementById('premium-badge').innerText]}''')
json.dump(inv, open(wd.A+'/logs/layers-inv.json','w'), ensure_ascii=False, indent=1)
print(len(inv['base']), len(inv['overlays']), len(inv['other']), inv['tnm'], inv['premium'])
