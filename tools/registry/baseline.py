#!/usr/bin/env python3
"""Baseline паритета по реестру 272 (план MapLibre v3, §3.2, этап 0б.6).

python3 tools/registry/baseline.py <logs прогона> [registry-272.tsv] > baseline.tsv

Для каждой строки реестра берёт её шаги из колонки evidence (s7-20..23, s6-10/11/33, s9c-00/01, s8b — весь
скрипт, dbg, «—») и смотрит их в логах прогона харнесса (<logs>/<скрипт>.json, run.json). Исполнение шага
считается так же, как в summarize.py: ошибки JS/WebDriver/клика/extra и FAIL — провал.

Статус (правила §3.2):
- аудит ✅ и все шаги исполнены без ошибок → pass;
- аудит ✅, а шаг упал или не найден → review (решает человек: pass после разбора или known-issue/not-run);
- аудит ❌/⚠ → known-issue (проблема реестра переносится; исправленные в 0.9.28+ переводятся в pass вручную);
- аудит ⏸ → not-run с причиной из реестра;
- шагов нет («—») → not-run.
Харнесс в основном фиксирует состояние без assert: pass здесь — «аудит подтверждён исполнением сценария на этой
сборке без ошибок», а не автоматическая проверка каждого обещания (см. tools/harness/README.md).
"""
import csv
import json
import re
import sys
from pathlib import Path

STEP_RE = re.compile(r'^(?P<script>s\d+[a-z]?r?|r2|dbg|fresh)(?:-(?P<steps>.+?))?(?:\.json)?$')
NUMERIC = re.compile(r'^[\d./]+$')


def parse_evidence(text):
    """'s7-08..10, s7-27' → [('s7', ['s7-08','s7-09','s7-10']), ('s7', ['s7-27'])]; весь скрипт — шагов None."""
    refs = []
    for tok in re.split(r'[,;]\s*', text or ''):
        tok = tok.strip()
        if not tok or tok in ('—', '-'):
            continue
        m = STEP_RE.match(tok)
        if not m:
            refs.append(('*', [tok]))  # имя шага без скрипта (000-start) — ищется во всех логах
            continue
        script, steps = m.group('script'), m.group('steps')
        if not steps:
            refs.append((script, None))
            continue
        if not NUMERIC.match(steps):
            refs.append((script, [tok]))  # именованный шаг: s1-tb-00, s2-width-1100, s3-help
            continue
        nums = []
        for part in steps.split('/'):
            if '..' in part:
                a, b = part.split('..')
                nums.extend(range(int(a), int(b) + 1))
            elif part.isdigit():
                nums.append(int(part))
        refs.append((script, [f'{script}-{n:02d}' for n in nums]))
    return refs


def load_records(logs, script):
    p = Path(logs, script + '.json')
    if not p.exists():
        return None
    data = json.loads(p.read_text())
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get('res', [data])
    return []


def step_problems(item):
    state = item.get('after', item)
    problems = []
    for key in ('pyerr', 'errors', 'click_errors'):
        if state.get(key):
            problems.append(f'{key}: {str(state[key])[:160]}')
    if item.get('found') is False:
        problems.append('file button not found')
    extra = state.get('extra')
    if isinstance(extra, str) and extra.startswith('ERR '):
        problems.append(extra[:160])
    if isinstance(extra, dict) and extra.get('error'):
        problems.append(str(extra)[:160])
    if 'file' in item and not item['file']:
        problems.append('export file missing or empty')
    if item.get('status') == 'FAIL':
        problems.append('FAIL')
    return problems


def check_row(logs, runs, evidence):
    """→ (ok, подробности): ok — все шаги найдены и прошли."""
    details, ok = [], True
    refs = parse_evidence(evidence)
    if not refs:
        return None, ['нет шагов']
    for script, steps in refs:
        if script == '*':
            hit = None
            for p in sorted(Path(logs).glob('*.json')):
                try:
                    recs_any = load_records(logs, p.stem) or []
                except (ValueError, OSError):
                    continue
                hit = next((r for r in recs_any if isinstance(r, dict) and r.get('shot') == steps[0]), None)
                if hit:
                    break
            if hit is None:
                details.append(f'{steps[0]}: шага нет в логах')
                ok = False
            elif step_problems(hit):
                details.append(f'{steps[0]}: ' + '; '.join(step_problems(hit)))
                ok = False
            continue
        exit_code = runs.get(script)
        recs = load_records(logs, script)
        if recs is None:
            details.append(f'{script}: нет лога' + (f' (exit {exit_code})' if exit_code is not None else ' (скрипт не запускался)'))
            ok = False
            continue
        if steps is None:
            if exit_code not in (0, None):
                details.append(f'{script}: exit {exit_code}')
                ok = False
            bad = [r.get('shot') for r in recs if step_problems(r)]
            if bad:
                details.append(f'{script}: шаги с ошибками {bad[:5]}')
                ok = False
            continue
        by_shot = {r.get('shot'): r for r in recs if isinstance(r, dict) and r.get('shot')}
        for sid in steps:
            r = by_shot.get(sid)
            if r is None:
                details.append(f'{sid}: шага нет в логе')
                ok = False
            else:
                pr = step_problems(r)
                if pr:
                    details.append(f'{sid}: ' + '; '.join(pr))
                    ok = False
    return ok, details


def main():
    logs = sys.argv[1]
    reg = sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).resolve().parents[2] / 'tests/parity/registry-272.tsv')
    runs = {r['script']: r['exit'] for r in json.loads(Path(logs, 'run.json').read_text())} if Path(logs, 'run.json').exists() else {}
    out = csv.writer(sys.stdout, delimiter='\t', lineterminator='\n')
    out.writerow(['row_id', 'status', 'audit', 'evidence', 'run', 'note'])
    with open(reg, newline='') as f:
        for row in csv.DictReader(f, delimiter='\t'):
            audit = row['status']
            ok, details = check_row(logs, runs, row['evidence'])
            run = 'ok' if ok else ('нет шагов' if ok is None else 'fail')
            note = row['result']
            if audit == 'untested':
                status = 'not-run'
            elif ok is None:
                status = 'not-run'
                note = 'в реестре нет шагов харнесса; ' + note
            elif audit == 'ok':
                status = 'pass' if ok else 'review'
            else:  # fail / warn
                status = 'known-issue'
            if details:
                note += ' | прогон: ' + ' / '.join(details)
            out.writerow([row['row_id'], status, audit, row['evidence'], run, note.replace('\t', ' ').replace('\n', ' ')])


if __name__ == '__main__':
    main()
