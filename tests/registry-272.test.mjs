// Реестр 272 (план MapLibre v3, §3.2 шаг 1, 0б.6): файл заморожен — итоги отчёта и sha256 не плывут.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const tsvUrl = new URL('./parity/registry-272.tsv', import.meta.url);
const raw = fs.readFileSync(tsvUrl);
const [head, ...lines] = raw.toString('utf8').replace(/\n$/, '').split('\n');
const cols = head.split('\t');
const rows = lines.map(l => Object.fromEntries(l.split('\t').map((v, i) => [cols[i], v])));

test('registry-272: 272 строки, итоги 218/24/17/13 как в отчёте 07.10', () => {
  assert.deepEqual(cols.slice(0, 6), ['row_id', 'section', 'element', 'promise', 'status', 'evidence']);
  assert.equal(rows.length, 272);
  const n = s => rows.filter(r => r.status === s).length;
  assert.deepEqual([n('ok'), n('warn'), n('fail'), n('untested')], [218, 24, 17, 13]);
  assert.ok(lines.every(l => l.split('\t').length === cols.length));
});

test('registry-272: row_id S<раздел>.<номер> уникальны и идут подряд в каждом §1–§18', () => {
  assert.equal(new Set(rows.map(r => r.row_id)).size, rows.length);
  const next = {};
  for (const r of rows) {
    next[r.section] = (next[r.section] || 0) + 1;
    assert.equal(r.row_id, `S${r.section}.${next[r.section]}`);
  }
  assert.deepEqual(Object.keys(next).map(Number).sort((a, b) => a - b), Array.from({ length: 18 }, (_, i) => i + 1));
});

test('registry-272: sha256 совпадает с REGISTRY.sha256', () => {
  const want = fs.readFileSync(new URL('./parity/REGISTRY.sha256', import.meta.url), 'utf8').split(/\s+/)[0];
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), want);
});
