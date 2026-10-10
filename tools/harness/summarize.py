"""Count recorded execution outcomes. This does not assert every registry promise."""
import json
from pathlib import Path
import wd


def summarize():
    root = Path(wd.A, 'logs')
    runs = json.loads((root / 'run.json').read_text())
    totals = {'pass': 0, 'fail': 0}
    scripts = []
    failures = []
    for run in runs:
        name = run['script']
        evidence = root / (name + '.json')
        count = {'pass': 0, 'fail': 0}
        records = []
        if evidence.exists():
            data = json.loads(evidence.read_text())
            if isinstance(data, list): records = data
            elif isinstance(data, dict):
                records = data.get('res', [])
                # s2 has observations of several viewport sizes but no step protocol.
        for i, item in enumerate(records):
            state = item.get('after', item)
            problems = []
            for key in ('pyerr', 'errors', 'click_errors'):
                if state.get(key): problems.append(str(state[key]))
            if item.get('found') is False: problems.append('file button not found')
            if isinstance(state.get('extra'), str) and state['extra'].startswith('ERR '):
                problems.append(state['extra'])
            if isinstance(state.get('extra'), dict) and state['extra'].get('error'):
                problems.append(str(state['extra']))
            if 'file' in item and not item['file']: problems.append('export file missing or empty')
            failed = bool(problems) or item.get('status') == 'FAIL'
            count['fail' if failed else 'pass'] += 1
            if failed:
                failures.append({'script':name, 'step':item.get('shot', str(i)),
                                 'label':item.get('label', item.get('item',{}).get('title','')),
                                 'problems':problems})
        for key in totals: totals[key] += count[key]
        scripts.append(dict(run, **count))
    result = {'scripts':scripts, 'steps':totals, 'failures':failures,
              'script_exits':{'pass':sum(r['exit']==0 for r in runs), 'fail':sum(r['exit']!=0 for r in runs)}}
    (root / 'summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({k:v for k,v in result.items() if k!='failures'}, ensure_ascii=False, indent=2))
    return result

if __name__ == '__main__': summarize()
