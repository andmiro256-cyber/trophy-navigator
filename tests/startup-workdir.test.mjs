import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');

function functionBody(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found`);
  let i = html.indexOf('{', start), depth = 0;
  for (let j = i; j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}' && --depth === 0) return html.slice(i, j + 1);
  }
  throw new Error(`unterminated ${name}`);
}

test('synchronous startup code does not touch let/const declared after initApp (TDZ)', () => {
  // setTheme() и initLinuxClickFallback() выполняются в initApp до первого await —
  // переменная `let`, объявленная ниже по скрипту, там ещё в мёртвой зоне: ReferenceError
  // обрывал запуск (рабочие папки, восстановление сессии, лицензия, синхронизация).
  const initAt = html.indexOf('(async function initApp()');
  const scriptEnd = html.indexOf('</script>', initAt);
  const later = new Set();
  for (const m of html.slice(initAt, scriptEnd).matchAll(/^(?:let|const)\s+([A-Za-z_$][\w$]*)/gm)) later.add(m[1]);
  for (const fn of ['setTheme', 'initLinuxClickFallback', 'getTheme', 'waitForFirstPaint']) {
    const body = functionBody(fn).replace(/\/\/[^\n]*/g, '');
    for (const name of later) {
      assert.doesNotMatch(body, new RegExp(`\\b${name.replace('$', '\\$')}\\b`), `${fn} uses ${name} before its declaration`);
    }
  }
});

test('working directory creates every subfolder separately and reports failures', () => {
  const body = functionBody('initWorkingDirectory');
  assert.match(html, /const APP_SUBDIRS = \['waypoints', 'tracks', 'routes', 'maps', 'gpx', 'backup'\];/);
  assert.match(body, /for \(const sub of APP_SUBDIRS\) \{\s*try \{\s*await ensureWorkSubdir\(sub\);/);
  assert.match(body, /showToast\([^;]*'error'\)/);
  // путь запоминается только после создания корневой папки
  assert.ok(body.indexOf("fs.mkdir(root, { recursive: true })") < body.indexOf('appDataPath = root'));
  assert.match(functionBody('saveSyncedGPXFiles'), /ensureWorkSubdir\(sub\)/);
  assert.match(html, /try \{ setTheme\(getTheme\(\)\); \} catch/);
});
