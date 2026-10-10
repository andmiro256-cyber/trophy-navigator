import wd, json
s = wd.S(open(wd.A+'/logs/sid').read().strip())
r = s.js(r'''
const out=[];
document.querySelectorAll('*').forEach(el=>{
  const attrs=[...el.attributes].filter(a=>/^on/.test(a.name));
  const isBtn = el.tagName==='BUTTON' || (el.tagName==='INPUT' && !['hidden'].includes(el.type)) || el.tagName==='SELECT';
  if(!attrs.length && !isBtn) return;
  let p=el, ctx='';
  while(p && p!==document.body){ if(p.id && (/^(modal|ctx|panel|toolbar|rr|live|ruler|track|route|map)/.test(p.id) || p.classList.contains('modal')||p.classList.contains('ctx-menu'))){ctx=p.id;break;} p=p.parentElement;}
  const vis = !!(el.offsetWidth||el.offsetHeight||el.getClientRects().length);
  out.push({ctx, tag:el.tagName.toLowerCase(), id:el.id||'', type:el.type||'', text:(el.innerText||el.value||'').trim().replace(/\s+/g,' ').slice(0,60), title:el.title||el.getAttribute('aria-label')||el.placeholder||'', h:attrs.map(a=>a.name+'='+a.value.trim().replace(/\s+/g,' ').slice(0,140)).join(' | '), vis});
});
return out;''')
json.dump(r, open(wd.A+'/logs/registry-dom.json','w'), ensure_ascii=False, indent=0)
print(len(r))
