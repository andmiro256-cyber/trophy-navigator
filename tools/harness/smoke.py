# Самопроверка харнесса перед прогоном: __tnTest и прокладка API-GAPS отвечают, помощники __tnh считают.
# Ничего не нажимает и данных не меняет (кроме вида карты). Итог — logs/smoke.json; код выхода 1, если что-то упало.
import wd, json, sys
s = wd.session()
CHECKS = {
    'engine': "return [__tnTest.engine, __tnTest.VERSION]",
    'view': "return __tnTest.getView()",
    'size': "return __tnTest.size()",
    'roundtrip_px': "const v=__tnTest.getView(); const p=__tnTest.project(v.center); const ll=__tnTest.unproject(p); return [p, Math.abs(ll.lat-v.center.lat) < 1e-9 && Math.abs(ll.lng-v.center.lng) < 1e-9]",
    'stats': "return __tnTest.stats()",
    'G1_wp0': "const e=__tnTest.entities(); return e.wp[0] || null",
    'G1_track0': "const e=__tnTest.entities(); return e.track[0] || null",
    'G2_geometry': "const t=__tnTest.entities().track[0]; if(!t) return 'нет треков'; const g=__tnTest.geometry(t.id); return [g.kind, g.points.length, g.breaks]",
    'G3_selection': "return __tnTest.selection()",
    'G4_style': "const e=__tnTest.entities(); return [e.wp[0] ? __tnTest.style(e.wp[0].id) : null, e.track[0] ? __tnTest.style(e.track[0].id) : null]",
    'G5_layers': "__tnTest.resetTileStats(); return __tnTest.layers().map(l=>[l.kind, l.name, l.opacity, l.view])",
    'G6_popup': "return __tnTest.popup()",
    'G7_controls': "const c=__tnTest.controls(); return Object.fromEntries(Object.entries(c).map(([k,v])=>[k, [v, !!document.querySelector(v)]]))",
    'G8_dispatchAt': "return typeof __tnTest.dispatchAt",
    'pick_wp0': "const w=__tnTest.entities().wp.find(w=>w.visible); if(!w) return 'нет видимых WP'; __tnh.go(w, 15); return __tnTest.pick(__tnTest.project(w)).slice(0,2)",
    'tnh_fit': "const w=__tnTest.entities().wp.slice(0,5); if(w.length<2) return 'мало WP'; const v=__tnh.fit(w, 0.2); const sz=__tnTest.size(); return [v.zoom, w.every(p=>{const q=__tnTest.project(p); return q.x>=0&&q.y>=0&&q.x<=sz.x&&q.y<=sz.y})]",
    'tnh_xy': "const v=__tnTest.getView(); return __tnh.xy(v.center)",
    'tnh_offline': "return __tnh.offline()",
}
out, bad = {'gaps': wd.GAPS}, []
for k, js in CHECKS.items():
    try:
        r = s.js(js)
        if isinstance(r, dict) and r.get('error'):
            bad.append(k)
    except Exception as e:
        r = 'ERR ' + repr(e); bad.append(k)
    out[k] = r
    print(f'{k:14}', json.dumps(r, ensure_ascii=False)[:200])
out['failed'] = bad
json.dump(out, open(wd.A + '/logs/smoke.json', 'w'), ensure_ascii=False, indent=1)
print('ПРОКЛАДКА:', wd.GAPS.get('installed'), '| ЗАГЛУШКИ:', wd.GAPS.get('stubbed'), '| УПАЛО:', bad or 'ничего')
sys.exit(1 if bad else 0)
