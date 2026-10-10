import wd, time, json
from wd import click, dlg, CLEAN, setv, key, focus_map
s = wd.session(); R = wd.Rec(s, 's14')
s.js(CLEAN); s.js("dialogCancel()"); wd.st(s)
now_ms = int(time.time()*1000)
s.js("""const now=arguments[0]; window.__audit.netStub = (url, method) => {
  if (/live2\\/devices/.test(url)) return {status:200, body:{ok:true, devices:[
     {uniqueId:'audit-1', name:'Аудит-1', lat:43.19, lon:44.85, speed:42, lastUpdate: now-30000, battery:80},
     {uniqueId:'audit-2', name:'Аудит-2', lat:43.21, lon:44.80, speed:0, lastUpdate: now-3600000, battery:20}]}};
  if (/live2\\//.test(url)) return {status:200, body:{ok:true, groups:[], messages:[], items:[], devices:[], favorites:{groups:[]}, version:1}};
  return null; }""", now_ms)
LS = "const sb=document.getElementById('live-sidebar'); return [sb.classList.value, getComputedStyle(sb).display, sb.getBoundingClientRect().x, document.getElementById('live-header-text')?.textContent, document.getElementById('live-devices-list').innerText.replace(/\\s+/g,' ').slice(0,200)]"
R('Live (email привязан, заглушка)', lambda: click(s, '#btn-live'), wait=4, extra=LS)
R('device click → zoom', lambda: click(s, '#live-devices-list [onclick^="liveZoomTo"]'), wait=1.5, extra="return [map.getCenter().lat.toFixed(3), map.getCenter().lng.toFixed(3), map.getZoom()]")
R('status select', lambda: s.js("const e=document.getElementById('live-status-select'); if(e.options.length>1){e.selectedIndex=1; e.dispatchEvent(new Event('change'))} return [...e.options].map(o=>o.text)"), wait=1, extra="return [...document.getElementById('live-status-select').options].map(o=>o.text)")
R('group select', lambda: s.js("const e=document.getElementById('live-group-select'); return [...e.options].map(o=>o.text)"), extra="return [...document.getElementById('live-group-select').options].map(o=>o.text)", shot=False)
for t, lbl in [('Сообщения','messages'),('Группы','groups'),('Хвост моих устройств','trails'),('Показать всех','showall'),('Свернуть','collapse'),('Развернуть','expand')]:
    R('sidebar: ' + t, lambda t=t: click(s, f'#live-sidebar [title="{t}"]'), wait=1.5, extra="return [[...document.querySelectorAll('.modal-overlay.open')].map(e=>e.id), document.getElementById('live-sidebar').classList.value]")
    if lbl in ('messages', 'groups'):
        R('  inventory', None, wait=0.2, extra="const m=[...document.querySelectorAll('.modal-overlay.open')].pop(); return m ? [m.id, m.innerText.replace(/\\s+/g,' ').slice(0,250), [...m.querySelectorAll('button,select,input')].map(e=>(e.innerText||e.placeholder||e.title||e.id||'').trim().slice(0,25))] : null", shot=False)
        s.js("closeAllModals()")
R('device message ✉', lambda: click(s, '#live-devices-list [title="Сообщение"]'), wait=1.5, extra="const m=[...document.querySelectorAll('.modal-overlay.open')].pop(); return m ? [m.id, m.innerText.replace(/\\s+/g,' ').slice(0,200)] : null")
R('send message (заглушка)', lambda: (setv(s, '.modal-overlay.open textarea, .modal-overlay.open input[type=text]', 'тест аудита'), click(s, '.modal-overlay.open .btn-primary')), wait=1.5, extra="return null")
s.js("closeAllModals()")
R('Закрыть Live', lambda: click(s, '#live-sidebar [title="Закрыть"]'), wait=1, extra=LS)
R.save()
