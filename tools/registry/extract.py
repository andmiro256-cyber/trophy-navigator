#!/usr/bin/env python3
"""Реестр 272 → tests/parity/registry-272.tsv (план MapLibre v3, §3.2 шаг 1, пакет 0б.6).

Источник — отчёт «Desktop — полная проверка функций (2026-10-07).md» (notes/Проекты), таблицы §1–§18
раздела «Реестр и результаты». Каждая строка таблицы — одна строка реестра:

    row_id   S<раздел>.<номер строки в разделе>, нумерация с 1 — стабильный ключ для baseline и паритета
    section  номер раздела (1…18)
    element  первый столбец (Элемент / Клавиша / Пункт / Опция)
    promise  «Обещает» (в §15–§18 столбца нет — пусто)
    status   статус аудита по первому значку столбца «Результат» (в §12 — «Применение»):
             ✅ ok · ⚠ warn · ❌ fail · ⏸ untested
    evidence «Доказательство» (shots/<имя>.jpg или logs/<прогон>.json)
    result   полный текст ячейки результата (для known-issue в baseline)
    note     «Что чинить»; в §12 — «После перезапуска: …»

Контроль: ровно 272 строки, итоги 218/24/17/13 как в отчёте. Без контроля файл не пишется (код 1).

    python3 tools/registry/extract.py [путь к отчёту] [--out tests/parity/registry-272.tsv]
    python3 tools/registry/extract.py --check      # перечитать TSV: итоги и sha256 из REGISTRY.sha256
"""
import argparse
import hashlib
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SRC = Path('/home/andreym/Projects/notes/Проекты/Desktop — полная проверка функций (2026-10-07).md')
DEFAULT_OUT = ROOT / 'tests/parity/registry-272.tsv'
SHA_FILE = ROOT / 'tests/parity/REGISTRY.sha256'

EXPECT_ROWS = 272
EXPECT = {'ok': 218, 'warn': 24, 'fail': 17, 'untested': 13}
GLYPH = {'✅': 'ok', '⚠': 'warn', '❌': 'fail', '⏸': 'untested'}
GLYPH_RE = re.compile('|'.join(map(re.escape, GLYPH)))
COLUMNS = ['row_id', 'section', 'element', 'promise', 'status', 'evidence', 'result', 'note']

SECTION_RE = re.compile(r'^### (\d+)\. ')


def cells(line):
    """Ячейки строки markdown-таблицы; `\\|` внутри ячейки — не разделитель."""
    body = line.strip()
    body = body[1:] if body.startswith('|') else body
    body = body[:-1] if body.endswith('|') and not body.endswith('\\|') else body
    parts = re.split(r'(?<!\\)\|', body)
    return [clean(p) for p in parts]


def clean(s):
    s = s.replace('\\|', '|').replace('**', '').strip()
    return re.sub(r'\s+', ' ', s)


def pick_col(header, *names):
    for n in names:
        if n in header:
            return header.index(n)
    return None


def parse(md_text):
    rows = []
    in_registry = False
    section = None
    header = None
    n_in_section = 0
    for line in md_text.splitlines():
        if line.startswith('## '):
            in_registry = line.strip() == '## Реестр и результаты'
            section = None
            continue
        if not in_registry:
            continue
        m = SECTION_RE.match(line)
        if m:
            section, header, n_in_section = int(m.group(1)), None, 0
            continue
        if section is None or not line.lstrip().startswith('|'):
            if header is not None and line.strip():
                header = None                                  # таблица кончилась
            continue
        c = cells(line)
        if header is None:
            header = c
            continue
        if all(re.fullmatch(r':?-{3,}:?', x) for x in c):      # |---|---|
            continue
        if len(c) < len(header):
            c += [''] * (len(header) - len(c))
        i_res = pick_col(header, 'Результат', 'Применение')
        i_prom = pick_col(header, 'Обещает')
        i_ev = pick_col(header, 'Доказательство')
        i_fix = pick_col(header, 'Что чинить')
        i_after = pick_col(header, 'После перезапуска')
        if i_res is None or i_ev is None:
            raise SystemExit(f'§{section}: нет столбца результата/доказательства в заголовке {header}')
        g = GLYPH_RE.search(c[i_res])
        if not g:
            raise SystemExit(f'§{section}: нет значка статуса в строке {c}')
        evidence = c[i_ev]
        note = ''
        if i_fix is not None:
            note = c[i_fix]
        elif i_after is not None:
            after = c[i_after]
            # §12, 5 последних строк: в отчёте доказательство стоит под «После перезапуска», а в
            # «Доказательство» — «—» (строки взяты из шаблона «…| Доказательство | Что чинить |»)
            if evidence == '—' and after != '—' and not GLYPH_RE.search(after):
                evidence, after = after, '—'
            note = f'После перезапуска: {after}'
        n_in_section += 1
        rows.append({
            'row_id': f'S{section}.{n_in_section}',
            'section': str(section),
            'element': c[0],
            'promise': c[i_prom] if i_prom is not None else '',
            'status': GLYPH[g.group(0)],
            'evidence': evidence,
            'result': c[i_res],
            'note': note,
        })
    return rows


def to_tsv(rows):
    out = ['\t'.join(COLUMNS)]
    for r in rows:
        vals = [r[k] for k in COLUMNS]
        assert not any('\t' in v or '\n' in v for v in vals), r
        out.append('\t'.join(vals))
    return '\n'.join(out) + '\n'


def control(rows):
    sections = sorted({int(r['section']) for r in rows})
    tally = Counter(r['status'] for r in rows)
    ok = len(rows) == EXPECT_ROWS and all(tally[k] == v for k, v in EXPECT.items()) and sections == list(range(1, 19))
    per = Counter(int(r['section']) for r in rows)
    print('строк:', len(rows), '| ok/warn/fail/untested:',
          '/'.join(str(tally[k]) for k in EXPECT), '| ожидается', EXPECT_ROWS, '/'.join(map(str, EXPECT.values())))
    print('по разделам:', ' '.join(f'§{s}={per[s]}' for s in sections))
    return ok


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_tsv(path):
    lines = Path(path).read_text(encoding='utf-8').splitlines()
    head = lines[0].split('\t')
    return [dict(zip(head, ln.split('\t'))) for ln in lines[1:]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src', nargs='?', default=str(DEFAULT_SRC))
    ap.add_argument('--out', default=str(DEFAULT_OUT))
    ap.add_argument('--check', action='store_true', help='проверить готовый TSV и его sha256')
    a = ap.parse_args()
    out = Path(a.out)

    if a.check:
        rows = read_tsv(out)
        good = control(rows)
        want = SHA_FILE.read_text().split()[0] if SHA_FILE.exists() else None
        got = sha256(out)
        print('sha256', got, '— совпадает' if got == want else f'— НЕ совпадает с {SHA_FILE.name}: {want}')
        sys.exit(0 if good and got == want else 1)

    src = Path(a.src)
    rows = parse(src.read_text(encoding='utf-8'))
    if not control(rows):
        print('КОНТРОЛЬ НЕ ПРОЙДЕН — файл не записан', file=sys.stderr)
        sys.exit(1)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(to_tsv(rows), encoding='utf-8')
    rel = out.relative_to(SHA_FILE.parent) if out.parent == SHA_FILE.parent else out
    SHA_FILE.write_text(f'{sha256(out)}  {rel}\n')
    print('источник sha256', sha256(src))
    print('записано', out, 'sha256', sha256(out))


if __name__ == '__main__':
    main()
