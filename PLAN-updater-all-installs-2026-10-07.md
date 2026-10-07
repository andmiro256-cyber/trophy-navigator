# План: автообновление desktop для всех типов установки (v0.9.27)

**Дата и время:** 07.10.2026, 14:39:05 MSK (ред. 2 — после ревью Тима #2380)

**Автор:** Claude Opus 5.5 (ОПУС Макс), ветка `fix/updater-all-installs`

**Статус:** реализовано в ветке, ждёт повторного ревью Тима, затем sign-off Тома и команды Andre на релиз. Тег не создан, в `origin` ничего не отправлено.

## Проблема

У Andre на HP стоит DEB `trophy-navigator-desktop 0.9.22` (`/usr/bin/trophy-navigator-desktop`) — и не обновляется.

Причина проверена на реальных пакетах с GitHub Release:

- В DEB 0.9.22 и 0.9.26 tauri-bundler вшил метку бандла `__TAURI_BUNDLE_TYPE_VAR_DEB`, в AppImage 0.9.26 — `__TAURI_BUNDLE_TYPE_VAR_APP`.
- В 0.9.22 стоит `tauri-plugin-updater 2.10.0`. Plugin сначала ищет в manifest ключ `linux-x86_64-deb`, затем `linux-x86_64`.
- В публичном `latest.json` есть только `linux-x86_64` → **AppImage**. DEB-клиент скачивает AppImage, подпись сходится, `install_deb` отвергает файл как не-.deb (`InvalidUpdaterFormat`) — до pkexec дело не доходит. Отсюда ошибка у Andre.
- В 0.9.26 (TRO-28) автоустановка на Linux разрешена только для AppImage с валидной `APPIMAGE`, DEB 0.9.26 — ручной режим.

## Ревью Тима #2380 (P2) и решение

`tauri-plugin-updater 2.10.0` ставит deb так: `pkexec dpkg -i`; при **любом** неуспехе, включая отмену окна (exit 126), — zenity/kdialog с паролем → `sudo -S`, затем терминальный `sudo dpkg -i`. При живом sudo-кэше пакет ставится вопреки отмене. Это поведение зашито в plugin; настроить его нельзя.

Решение:

1. **DEB ≥ 0.9.27 не отдаёт установку plugin-у.** Plugin только скачивает файл и проверяет minisign-подпись (`Update::download`). Дальше наш `install_deb_update`:
   - проверяет, что это действительно .deb (`!<arch>\ndebian-binary`);
   - пишет его в новый каталог `0700` (`create`, не `create_all`) файлом `0600`;
   - запускает **ровно один раз** `/usr/bin/pkexec /usr/bin/dpkg -i <файл>` (абсолютные пути, без PATH);
   - код pkexec: `0` → успех; `126` → «Обновление отменено», `127` → нет прав/агента, прочее → ошибка dpkg. Все исходы терминальны: ни повтора, ни zenity/kdialog, ни sudo;
   - нет `/usr/bin/pkexec` → ошибка «скачайте вручную», ничего не запускается;
   - временный каталог удаляется в любом исходе.
2. **Свой ключ manifest `linux-x86_64-deb-pkexec`.** 0.9.27 ищет его через `updater_builder().target(...)`. Стандартный `linux-x86_64-deb` в manifest **не публикуется** (CI падает, если он появится): его читают DEB 0.9.22–0.9.25, а у них установщик plugin-а с тем же fallback, и исправить уже выпущенные версии нельзя. Эти клиенты, как и сейчас, получают AppImage по `linux-x86_64`, и plugin отвергает его до pkexec — безопасно, но без автообновления.
3. **UI:** при отмене — жёлтый статус «Обновление отменено — пакет не установлен. Чтобы повторить, нажмите «Проверить обновление»».

Альтернативы и почему не они: форк/пин plugin-а — поддержка форка ради одной функции; публикация `linux-x86_64-deb` для старых клиентов — сохраняет найденную Тимом уязвимость согласия у 0.9.22–0.9.25.

## Что меняется (итог)

1. **Rust (`src-tauri/src/main.rs`).** Тип установки — по метке бандла (`tauri::utils::platform::bundle_type()`), не по путям:
   - `deb` → автоустановка нашим кодом через pkexec (см. выше);
   - `AppImage` → plugin, только при `APPIMAGE` на существующий файл (TRO-28 сохранён);
   - распакованный AppImage, сборка без метки (`cargo build`, `tauri dev`), `rpm` → ручной режим;
   - Windows/macOS — без изменений (штатные NSIS/MSI/.app).
   - `check_app_update` отдаёт `installKind`; `install_app_update` повторно проверяет тип до обращения к updater-resource.
2. **UI (`ui/index.html`).** Для deb — предупреждение о пароле администратора в статусе, подтверждении и прогрессе; отдельное сообщение об отмене; после неудачи `rid` сбрасывается. Ручной режим — только для `manual`.
3. **CI (`.github/workflows/build.yml`).**
   - «Verify deb updater artifact»: `.deb.sig` создан, в бинарнике метка `DEB`; у перепакованного AppImage — метка `APP`.
   - `.deb.sig` в артефактах, deb — обязательный артефакт релиза.
   - `latest.json` собирается python-скриптом; пустая подпись или ключ `linux-x86_64-deb` роняют job. Ключи:

     | ключ | файл | кто читает |
     |---|---|---|
     | `linux-x86_64-deb-pkexec` | `trophynav.ru/releases/trophy-navigator-desktop_X_amd64.deb` | DEB ≥ 0.9.27 |
     | `linux-x86_64-appimage` | `…_amd64.AppImage` | AppImage |
     | `linux-x86_64` (общий fallback) | `…_amd64.AppImage` | AppImage старых сборок; DEB 0.9.22–0.9.25 (отвергают) |
     | `windows-x86_64-nsis`, `windows-x86_64` | `…_x64-setup.exe` | NSIS |
     | `windows-x86_64-msi` (если есть подпись) | GitHub `Trophy.Navigator.Desktop_X_x64_en-US.msi` | MSI |
     | `darwin-aarch64-app`, `darwin-aarch64` | GitHub `…_aarch64.app.tar.gz` | macOS arm64 |
     | `darwin-x86_64-app`, `darwin-x86_64` | GitHub `…_x64.app.tar.gz` | macOS x64 |

   - `tauri.conf.json` не меняется: `createUpdaterArtifacts: true` и `targets: "all"` уже стоят.
4. **Версия 0.9.27:** `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`, `ui/index.html`, текст GitHub Release.

## Что проверено локально (без установки пакетов)

- `cargo test --locked`: 11/11. Среди них тесты отмены на заглушках: вместо pkexec `/bin/sh`, вместо dpkg скрипт с кодом 126/127/0, рядом заглушки `sudo`/`zenity`/`kdialog`. Результат: 126 → `Cancelled`, 127 → `NotAuthorized`, ровно один запуск, заглушки fallback не вызваны ни разу. Нет pkexec или не-.deb → ничего не запускается. `node --test --test-concurrency=1 tests/*.test.mjs`: 33/33.
- `cargo tauri build --bundles deb` (tauri-cli 2.12.1) без ключа: deb собран, бинарник с меткой `__TAURI_BUNDLE_TYPE_VAR_DEB`, затем понятная ошибка `A public key has been found, but no private key…`, `.deb.sig` нет.
- Генерация manifest из CI-шага на фиктивных артефактах: ключи из таблицы, `linux-x86_64-deb` отсутствует.
- E2E на localhost с настоящим `tauri-plugin-updater 2.10.0`, одноразовым ключом и подписанным локальным deb (метка бандла патчится, как это делает bundler):
  - DEB, стандартный поиск (= клиенты 0.9.22–0.9.26) → получает AppImage, deb не скачивается;
  - DEB, поиск `linux-x86_64-deb-pkexec` (= 0.9.27) → deb скачан, подпись верна;
  - APP → `linux-x86_64-appimage`; без метки → `linux-x86_64`;
  - 0.9.27 при manifest без своего ключа → ошибка проверки, ничего не скачано;
  - чужая подпись → `The signature verification failed`.
- Не проверено: настоящий `pkexec dpkg -i` и отмена настоящего окна (на ноутбуке пакеты не ставили, на HP не ходили) — пункт smoke; сборка под Windows/macOS после правки (DEB-код под `cfg(target_os = "linux")`) — проверит CI.

## HP с 0.9.22: один раз вручную

Автоматически 0.9.22–0.9.26 на 0.9.27 не перейдут: 0.9.22–0.9.25 намеренно не получают .deb (небезопасный installer plugin-а), 0.9.26 — ручной режим по TRO-28. После ручной установки 0.9.27 следующие версии приходят через «Проверить обновление» с паролем администратора.

### Инструкция для Andre (HP, Ubuntu/Debian)

1. Открыть https://trophynav.ru/desktop.html и скачать `trophy-navigator-desktop_0.9.27_amd64.deb` (или `wget https://trophynav.ru/releases/trophy-navigator-desktop_0.9.27_amd64.deb`).
2. Закрыть Trophy Navigator.
3. В терминале, в папке с файлом: `sudo apt install ./trophy-navigator-desktop_0.9.27_amd64.deb`. `./` обязателен — без него apt ищет пакет в репозиториях.
4. Проверить: `dpkg -l trophy-navigator-desktop` → `0.9.27`; в программе «О программе» → 0.9.27.

Данные пользователя пакет не трогает. Старые DEB-клиенты при проверке обновления по-прежнему будут показывать ошибку установки AppImage — им нужна та же ручная установка (стоит сказать в release notes / на сайте).

## Релиз (только по команде Andre, после GO Тима и sign-off Тома)

1. Влить `fix/updater-all-installs` в `main`, тег `v0.9.27`, push тега.
2. CI: зелёные build-windows / build-linux (шаг «Verify deb updater artifact») / build-macos / release.
3. Alpha-KM: `curl -s https://trophynav.ru/api/updates/latest.json | jq '.version, (.platforms|keys)'` → `0.9.27`, ключи из таблицы, **без** `linux-x86_64-deb`; `curl -sI` на `.deb`, `.AppImage`, `-setup.exe` → 200. Витрины — по чек-листу AGENTS.md.
4. Smoke:
   - **DEB** — HP: вручную 0.9.27; затем на тестовом manifest/следующем релизе — окно pkexec → пароль → перезапуск. Отмена окна → «Обновление отменено», `dpkg -l` без изменений, `sudo` не вызывался (`journalctl _COMM=sudo`), даже при свежем sudo-кэше;
   - **AppImage** (штатный запуск) старой версии → «Проверить обновление» → установка без пароля, перезапуск, 0.9.27;
   - **распакованный AppImage** → ручной режим, внутренний ELF не изменён;
   - **Windows NSIS** 0.9.26 → автообновление до 0.9.27.

## Критерии приёмки

- DEB 0.9.27 видит обновление по `linux-x86_64-deb-pkexec` и ставит его через один вызов pkexec; отмена → «Обновление отменено», без fallback.
- AppImage без `APPIMAGE` и сборки без метки бандла никогда не получают `rid` и не вызывают установку.
- В manifest нет пустых подписей и нет `linux-x86_64-deb`; общий `linux-x86_64` — AppImage.
- `cargo test --locked` и node-тесты зелёные.

## Риски

- **Нет polkit-агента/pkexec** (минимальные системы, сессия без агента) → pkexec 127 или «нет pkexec»: сообщение «скачайте вручную», запасных путей намеренно нет.
- **`dpkg -i` не тянет новые зависимости.** Новая системная зависимость в будущей версии → dpkg упадёт, нужна ручная `apt install ./…deb`. Сейчас зависимости те же, что в 0.9.26.
- **Старые DEB 0.9.22–0.9.26** не обновляются сами — один ручной шаг на каждой такой установке.
- **MSI-обновление идёт с GitHub.** Если GitHub недоступен, MSI-клиенты не обновятся.
- **Плавающий tauri-cli в CI** (`^2`). Если будущая версия перестанет подписывать deb или вшивать метку, CI упадёт на новых проверках и не опубликует битый manifest.

## Откат

- Если сломался manifest, вернуть на Alpha-KM предыдущий `latest-desktop.json` (бэкап перед заменой). Без `linux-x86_64-deb-pkexec` DEB 0.9.27 просто показывает ошибку проверки, вреда нет.
- Если сломалось приложение, `git revert` коммитов ветки и выпуск 0.9.28 через тот же CI. Пострадавшие DEB-установки: `sudo apt install ./trophy-navigator-desktop_0.9.26_amd64.deb --allow-downgrades`.
