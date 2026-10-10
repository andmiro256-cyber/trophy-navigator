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

test('CI ships a signed deb with a DEB bundle marker and bundle-specific manifest keys', () => {
  const verify = workflow.indexOf('- name: Verify deb updater artifact');
  const upload = workflow.indexOf('- name: Upload deb');
  assert.ok(verify >= 0 && upload > verify, 'the deb must be verified before it is uploaded');
  assert.match(workflow, /updater signature for the deb package was not created/);
  assert.match(workflow, /grep -aq '__TAURI_BUNDLE_TYPE_VAR_DEB'/);
  assert.match(workflow, /grep -aq '__TAURI_BUNDLE_TYPE_VAR_APP'/);
  assert.match(workflow, /src-tauri\/target\/release\/bundle\/deb\/\*\.deb\.sig/);

  for (const key of ['linux-x86_64', 'linux-x86_64-appimage', 'linux-x86_64-deb-pkexec',
    'windows-x86_64', 'windows-x86_64-nsis', 'windows-x86_64-msi', 'darwin-aarch64', 'darwin-x86_64']) {
    assert.ok(workflow.includes(`"${key}"`), `manifest key ${key} must be generated`);
  }
  assert.match(workflow, /"linux-x86_64-deb-pkexec": deb/);
  // Стандартный ключ читают DEB 0.9.22–0.9.25 с небезопасным installer-ом plugin-а (#2380).
  assert.doesNotMatch(workflow, /"linux-x86_64-deb":/);
  assert.match(workflow, /if "linux-x86_64-deb" in platforms:/);
  assert.match(rust, /const DEB_UPDATE_MANIFEST_TARGET: &str = "linux-x86_64-deb-pkexec";/);
  assert.match(workflow, /deb = entry\("DEB_SIG", f"\{site\}\/trophy-navigator-desktop_\{version\}_amd64\.deb"\)/);
  assert.match(workflow, /"linux-x86_64": appimage/);
  assert.match(workflow, /updater signature \{sig_var\} is missing/);
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
  const safetyGuard = rust.indexOf('if !install_kind.can_auto_install()', installCommand);
  assert.ok(rust.indexOf('let install_kind = update_install_kind();', installCommand) < safetyGuard);
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

test('DEB updates are installed by our pkexec-only code, never by the plugin installer', () => {
  const installCommand = rust.slice(rust.indexOf('async fn install_app_update'));
  const debBranch = installCommand.indexOf('if install_kind == UpdateInstallKind::LinuxDeb');
  const download = installCommand.indexOf('.download(on_chunk', debBranch);
  const ownInstall = installCommand.indexOf('install_deb_update(&bytes)', download);
  const pluginInstall = installCommand.indexOf('.download_and_install(');
  assert.ok(debBranch >= 0 && download > debBranch && ownInstall > download && pluginInstall > ownInstall,
    'the DEB branch must download via the plugin and return before download_and_install');

  assert.match(rust, /\.target\(DEB_UPDATE_MANIFEST_TARGET\)/);
  assert.match(rust, /Some\(126\) => Err\(DebInstallError::Cancelled\)/);
  assert.match(rust, /Some\(127\) => Err\(DebInstallError::NotAuthorized\)/);
  // Ни одного запасного пути повышения прав в нашем коде.
  const production = rust.slice(0, rust.indexOf('mod tests {'));
  assert.doesNotMatch(production, /Command::new\("(sudo|zenity|kdialog)"\)/);
  assert.match(production, /const PKEXEC_PATH: &str = "\/usr\/bin\/pkexec";/);
});

test('cancelling the password dialog shows «Обновление отменено»', () => {
  assert.match(rust, /const UPDATE_CANCELLED_MESSAGE: &str =\s*"Обновление отменено/);
  assert.match(html, /installError\.startsWith\('Обновление отменено'\)[\s\S]*?Обновление отменено — пакет не установлен/);
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
  assert.match(html, /if \(!update\.canAutoInstall \|\| !pendingUpdateRid\)[\s\S]*?Для этой Linux-установки обновление ставится вручную/);
  assert.match(html, /else if \(pendingManualUpdateUrl\)[\s\S]*?setManualUpdateButton\(pendingManualUpdateUrl\)/);

  const startupCheck = html.indexOf('if (!update.canAutoInstall || !update.rid)');
  const startupInstall = html.indexOf('installPendingUpdate();', startupCheck);
  const manualReturn = html.indexOf('return;', startupCheck);
  assert.ok(startupCheck >= 0 && manualReturn > startupCheck && startupInstall > manualReturn,
    'startup must leave the manual-update branch before auto-installing');
});
