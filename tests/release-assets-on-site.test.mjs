// Все файлы выпуска — на trophynav.ru, без ссылок на GitHub (Андрей 10.10: GitHub из России ненадёжен,
// на странице загрузки он не нужен; Mac пропал с сайта при переносе в июле).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const wf = fs.readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');

test('манифест обновлений: Mac и MSI берутся с trophynav.ru, не с GitHub', () => {
  assert.match(wf, /mac_arm = entry\("MACOS_ARM64_SIG", f"\{site\}\/trophy-navigator-desktop_\{version\}_aarch64\.app\.tar\.gz"\)/);
  assert.match(wf, /mac_x64 = entry\("MACOS_X64_SIG", f"\{site\}\/trophy-navigator-desktop_\{version\}_x64\.app\.tar\.gz"\)/);
  assert.match(wf, /windows-x86_64-msi"\] = entry\("MSI_SIG", f"\{site\}\/trophy-navigator-desktop_\{version\}_x64\.msi"\)/);
  assert.doesNotMatch(wf, /entry\("[A-Z0-9_]+_SIG", f"\{gh\}/, 'ни одна ссылка манифеста не ведёт на GitHub');
});

test('выкладка: установщики Mac (.dmg) и файлы обновления Mac кладутся на сайт и проверяются', () => {
  for (const name of ['aarch64.dmg', 'x64.dmg', 'aarch64.app.tar.gz', 'x64.app.tar.gz', 'amd64.AppImage', 'x64-setup.exe', 'amd64.deb']) {
    assert.ok(wf.includes(`|trophy-navigator-desktop_\${V}_${name}"`), name);
  }
  assert.match(wf, /PUBLIC_FILES\+=\("\$\{MSI_FILE\}\|trophy-navigator-desktop_\$\{V\}_x64\.msi"\)/);
  // суммы всех файлов сходятся до публикации; манифест — последним
  assert.match(wf, /sha256sum -c - >\/dev\/null \$\{INSTALLS\}/);
  assert.ok(wf.indexOf('for pair in "${PUBLIC_FILES[@]}"; do\n            curl') < wf.indexOf('# Manifest публикуется последним'));
});

test('сборки Windows и Mac — только по тегу выпуска или вручную; Linux проверяет каждый push в main', () => {
  const COND = "if: startsWith(github.ref, 'refs/tags/v') || github.event_name == 'workflow_dispatch'";
  const job = name => { const a = wf.indexOf(`\n  ${name}:\n`); const b = wf.indexOf('\n  build-', a + 5); return wf.slice(a, b < 0 ? wf.indexOf('\n  release:', a) : b); };
  assert.ok(job('build-windows').includes(COND), 'Windows');
  assert.ok(job('build-macos').includes(COND), 'Mac');
  assert.ok(!job('build-linux').includes('if:'), 'Linux — всегда');
  assert.match(wf, /on:\n  push:\n    branches: \[main\]\n    tags: \['v\*'\]/);
});
