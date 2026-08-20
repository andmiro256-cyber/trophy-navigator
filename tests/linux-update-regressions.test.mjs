import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
const rust = fs.readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');

test('AppImage repack defaults to Wayland and rejects a forced X11 hook', () => {
  assert.match(workflow, /sed -i 's\/\^export GDK_BACKEND=x11\/export GDK_BACKEND="\$\{GDK_BACKEND:-wayland\}"\/'/);
  assert.match(workflow, /AppImage still forces GDK_BACKEND=x11/);
  assert.match(workflow, /repacked AppImage does not default to Wayland/);

  const repack = workflow.indexOf('- name: Repack AppImage without bundled Wayland');
  const sign = workflow.indexOf('- name: Sign repacked AppImage');
  assert.ok(repack >= 0 && sign > repack, 'the modified AppImage must be signed only after repacking');
});

test('Linux updater only retains an installable update for a real APPIMAGE file', () => {
  assert.match(rust, /std::env::var_os\("APPIMAGE"\)/);
  assert.match(rust, /value\.map\(Path::new\)\.is_some_and\(Path::is_file\)/);
  assert.match(rust, /let rid = can_auto_install\.then\(\|\| webview\.resources_table\(\)\.add\(update\)\)/);

  const installCommand = rust.indexOf('async fn install_app_update');
  const safetyGuard = rust.indexOf('if !can_auto_install_update()', installCommand);
  const resourceLookup = rust.indexOf('.get::<Update>(rid)', installCommand);
  assert.ok(installCommand >= 0 && safetyGuard > installCommand && resourceLookup > safetyGuard,
    'the safety guard must run before the updater resource is used');
});

test('manual Linux updates show a download action and never call auto-install', () => {
  assert.match(html, /function setManualUpdateButton\(url\)[\s\S]*?openExternalUrl\(url\)/);
  assert.match(html, /if \(!update\.canAutoInstall \|\| !pendingUpdateRid\)[\s\S]*?Автоустановка недоступна[^`]*скачайте пакет вручную/);
  assert.match(html, /else if \(pendingManualUpdateUrl\)[\s\S]*?setManualUpdateButton\(pendingManualUpdateUrl\)/);

  const startupCheck = html.indexOf('if (!update.canAutoInstall || !update.rid)');
  const startupInstall = html.indexOf('installPendingUpdate();', startupCheck);
  const manualReturn = html.indexOf('return;', startupCheck);
  assert.ok(startupCheck >= 0 && manualReturn > startupCheck && startupInstall > manualReturn,
    'startup must leave the manual-update branch before auto-installing');
});
