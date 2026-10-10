"""Set up synthetic data and dismiss onboarding in this audit's isolated profile."""
import json
import time
from pathlib import Path
import wd

s = wd.session()
s.js("localStorage.setItem('tnd-onboarding-done','1'); document.getElementById('onboarding-overlay')?.remove();")
wd.q(s, wd.A + '/home/Загрузки/audit-all.gpx')
s.js("openFile('.gpx,.GPX', loadGPXFile)")
time.sleep(3)
data = s.js("return {api:__tnTest.VERSION,engine:__tnTest.engine,stats:__tnTest.stats(),work:appDataPath}")
if not Path(data['work']).resolve().is_relative_to(Path(wd.A, 'home').resolve()):
    raise RuntimeError('Work directory escapes audit HOME: ' + data['work'])
Path(wd.A, 'logs', 'prepare.json').write_text(json.dumps(data, ensure_ascii=False, indent=2))
print(data)
