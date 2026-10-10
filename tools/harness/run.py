"""Sequential HP audit. Keep going after scenario failure; preserve exits and JSON evidence."""
import json
import os
import subprocess
import sys
import time
from pathlib import Path
import wd

SCRIPTS = ['s1', 's2', 's3', 's4', 's5', 's5b', 's6', 's7', 's8', 's8b',
           's9', 's9a', 's9c', 's9d', 's10', 's10b', 's10c', 's10d',
           's11', 's11b', 's12', 's13', 's14', 's15', 's16', 's16b',
           's17', 's18', 's19', 'r2']

def main():
    chosen = sys.argv[1:] or SCRIPTS
    records = []
    for name in chosen:
        if name not in SCRIPTS and name != 'smoke': raise ValueError(name)
        started = time.time()
        log = Path(wd.A, 'logs', name + '.stdout.log')
        print('START', name, flush=True)
        with log.open('w') as out:
            try:
                r = subprocess.run([sys.executable, '-u', str(Path(wd.HERE, name + '.py'))],
                                   stdout=out, stderr=subprocess.STDOUT, timeout=360)
                code = r.returncode
            except subprocess.TimeoutExpired:
                code = 124
        records.append({'script': name, 'exit': code, 'seconds': round(time.time()-started, 1)})
        Path(wd.A, 'logs', 'run.json').write_text(json.dumps(records, ensure_ascii=False, indent=2))
        print('END', name, code, records[-1]['seconds'], flush=True)
    return int(any(r['exit'] for r in records))

if __name__ == '__main__': sys.exit(main())
