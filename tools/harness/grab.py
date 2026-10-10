import wd, sys
s = wd.session()
for name in ['index.html', 'trophynav-maps.js', 'trophynav-3d.js', 'tn-widgets.js']:
    t = s.ajs("const cb=arguments[arguments.length-1]; fetch(arguments[0]).then(r=>r.text()).then(cb).catch(e=>cb('ERR '+e))", name)
    open(f"{wd.A}/logs/{sys.argv[1]}-{name}", 'w').write(t or '')
    print(name, len(t or ''))
