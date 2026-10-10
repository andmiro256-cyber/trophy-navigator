import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

async function verifyManifest(root) {
  const lines = (await readFile(`${root}/MANIFEST.sha256`, 'utf8')).trimEnd().split('\n');
  const expected = new Set();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([^\r\n]+)$/.exec(line);
    assert.ok(match, `Malformed manifest line: ${line}`);
    const [, digest, path] = match;
    assert.ok(!path.startsWith('/') && !path.split('/').some(p => p === '..' || p === '.' || !p), `Unsafe path: ${path}`);
    assert.ok(!expected.has(path), `Duplicate manifest path: ${path}`);
    expected.add(path);
    assert.equal(createHash('sha256').update(await readFile(`${root}/${path}`)).digest('hex'), digest, `SHA mismatch: ${path}`);
  }
  const actual = [];
  async function walk(prefix = '') {
    for (const entry of await readdir(`${root}/${prefix}`, {withFileTypes:true})) {
      const path = prefix + entry.name;
      assert.ok(!entry.isSymbolicLink(), `Symlink in fixtures/golden: ${path}`);
      if (entry.isDirectory()) await walk(path + '/');
      else if (path !== 'MANIFEST.sha256') actual.push(path);
    }
  }
  await walk();
  assert.deepEqual(actual.sort(), [...expected].sort(), 'Manifest must cover every file and no missing files');
  return expected;
}

const root = fileURLToPath(new URL('./golden/0.9.34', import.meta.url));
test('0.9.34 golden manifest matches all bytes', async () => {
  const files = await verifyManifest(root);
  for (const id of ['F1','F2','F3','F4','F5','F6','F7','F11','F16']) {
    assert.ok(files.has(`${id}/state.json`));
    assert.ok(files.has(`${id}/exports.json`));
  }
  for (const id of ['F2','F3']) {
    assert.ok(files.has(`${id}/rr.json`));
    assert.ok(files.has(`${id}/rrExportHTML.html`));
  }
});
test('map fixture manifest matches source bytes including cp1251', async () => {
  await verifyManifest(fileURLToPath(new URL('./fixtures/map', import.meta.url)));
});
