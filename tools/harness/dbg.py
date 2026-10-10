import wd, time
s = wd.session()
s.js(wd.CLEAN)
wd.q(s, wd.A + '/home/Загрузки/audit-xss.gpx'); s.js("openFile('.gpx,.GPX', loadGPXFile)"); time.sleep(2.5)
print(s.js("return [window.__xss||0, __tnh.wp(-1).name, document.querySelectorAll('#wpt-tbody img').length]"))
s.shot('xss-check')
