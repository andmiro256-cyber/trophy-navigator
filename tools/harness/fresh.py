import wd, time, json, sys
wd.BASE = 'http://127.0.0.1:4456'
r = wd.req('POST', '/session', {'capabilities': {'alwaysMatch': {'webkitgtk:browserOptions': {'binary': wd.A + '/app/cur/AppRun', 'args': []}}}}, 180)
sid = r['value']['sessionId']; s = wd.S(sid)
for i in range(20):
    time.sleep(1)
    if s.js("return document.readyState==='complete'") is True: break
time.sleep(4)
print(s.js("return [!!document.getElementById('onboarding-overlay'), document.getElementById('onboarding-overlay')?.innerText.replace(/\\s+/g,' ').slice(0,300), Object.keys(localStorage), document.title]"))
s.shot('fresh-start')
btns = s.js("return [...document.querySelectorAll('#onboarding-overlay button')].map(b=>b.innerText.trim()+' :: '+(b.getAttribute('onclick')||''))")
print(btns)
wd.req('DELETE', '/session/' + sid)
