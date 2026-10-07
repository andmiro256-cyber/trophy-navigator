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

function linuxInstallKindBody() {
  const start = rust.indexOf('fn linux_update_install_kind(');
  assert.ok(start >= 0, 'linux_update_install_kind must exist');
  const end = rust.indexOf('\n}\n', start);
  return rust.slice(start, end);
}

test('Linux updater only retains an installable update for a real APPIMAGE file', () => {
  assert.match(rust, /std::env::var_os\("APPIMAGE"\)/);
  assert.match(rust, /value\.map\(Path::new\)\.is_some_and\(Path::is_file\)/);
  assert.match(rust, /let rid = can_auto_install\.then\(\|\| webview\.resources_table\(\)\.add\(update\)\)/);
  assert.match(linuxInstallKindBody(),
    /Some\(BundleType::AppImage\) if linux_appimage_path_is_valid\(appimage\) =>\s*\{?\s*UpdateInstallKind::LinuxAppImage/);

  const installCommand = rust.indexOf('async fn install_app_update');
  const safetyGuard = rust.indexOf('if !update_install_kind().can_auto_install()', installCommand);
  const resourceLookup = rust.indexOf('.get::<Update>(rid)', installCommand);
  assert.ok(installCommand >= 0 && safetyGuard > installCommand && resourceLookup > safetyGuard,
    'the safety guard must run before the updater resource is used');
});

test('Linux install kind comes from the bundle type baked in by tauri-bundler', () => {
  assert.match(rust, /linux_update_install_kind\(tauri::utils::platform::bundle_type\(\), appimage\.as_deref\(\)\)/);

  const body = linuxInstallKindBody();
  assert.match(body, /Some\(BundleType::Deb\) => UpdateInstallKind::LinuxDeb/);
  // Всё остальное (нет метки бандла, rpm, AppImage без APPIMAGE) — только ручной режим,
  // иначе plugin откатится в install_appimage и перезапишет собственный ELF (TRO-28).
  assert.match(body, /_ => UpdateInstallKind::Manual/);
  assert.doesNotMatch(body, /None\s*=>\s*UpdateInstallKind::(LinuxDeb|LinuxAppImage|Platform)/);
  assert.doesNotMatch(body, /BundleType::Rpm\)?\s*=>\s*UpdateInstallKind::(LinuxDeb|LinuxAppImage|Platform)/);
  assert.doesNotMatch(body, /current_exe|\/usr\/bin|starts_with/, 'install kind must not rely on path heuristics');
});

test('DEB auto-update warns about the administrator password before installing', () => {
  assert.match(html, /function getUpdatePasswordHint\(kind\)[\s\S]*?kind === 'deb'[\s\S]*?пароль администратора/);
  assert.match(html, /pendingUpdateKind = update\.installKind \|\| null;[\s\S]*?getUpdatePasswordHint\(pendingUpdateKind\)[\s\S]*?setInstallUpdateButton\(pendingUpdateVersion\)/);

  // Подтверждение установки показывает подсказку до вызова install_app_update.
  const install = html.indexOf('async function installPendingUpdate()');
  const hint = html.indexOf('getUpdatePasswordHint(pendingUpdateKind)', install);
  const confirm = html.indexOf('tndConfirm(', install);
  const invoke = html.indexOf("tauriInvoke('install_app_update'", install);
  assert.ok(install >= 0 && hint > install && confirm > hint && invoke > confirm,
    'the password hint must be shown before the package is installed');

  // Стартовая проверка передаёт тип установки в installPendingUpdate.
  const startupCheck = html.indexOf('if (!update.canAutoInstall || !update.rid)');
  const startupKind = html.indexOf('pendingUpdateKind = update.installKind || null;', startupCheck);
  const startupInstall = html.indexOf('installPendingUpdate();', startupCheck);
  assert.ok(startupKind > startupCheck && startupInstall > startupKind);
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
