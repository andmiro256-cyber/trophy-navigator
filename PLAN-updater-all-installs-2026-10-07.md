# План: автообновление desktop для всех типов установки (v0.9.27)

**Дата и время:** 07.10.2026, 14:39:05 MSK  
**Автор:** Claude Opus 5.5 (ОПУС Макс), ветка `fix/updater-all-installs`  
**Статус:** реализовано в ветке, ждёт ревью (Тим → sign-off Тома) и команды Andre на релиз. Тег не создан, в `origin` ничего не отправлено.

## Проблема

У Andre на HP стоит DEB `trophy-navigator-desktop 0.9.22` (`/usr/bin/trophy-navigator-desktop`) — и не обновляется.

Причина проверена на реальных пакетах с GitHub Release:

- В DEB 0.9.22 и 0.9.26 tauri-bundler вшил метку бандла `__TAURI_BUNDLE_TYPE_VAR_DEB`, в AppImage 0.9.26 — `__TAURI_BUNDLE_TYPE_VAR_APP`.
- В 0.9.22 уже стоит `tauri-plugin-updater 2.10.0`, а TRO-28-guard (он появился в 0.9.26) там ещё нет. Plugin сначала ищет в manifest ключ `linux-x86_64-deb`, затем `linux-x86_64`.
- В публичном `latest.json` есть только `linux-x86_64`, и он указывает на **AppImage**. DEB-клиент скачивает AppImage, подпись сходится, но `install_deb` отвергает файл: это не .deb (`InvalidUpdaterFormat`). Отсюда ошибка у Andre.
- В 0.9.26 (TRO-28) автоустановку на Linux оставили только для AppImage с валидной `APPIMAGE`, поэтому DEB 0.9.26 показывает ручной режим.

## Что меняется

1. **Rust (`src-tauri/src/main.rs`).** Тип установки берётся из метки бандла (`tauri::utils::platform::bundle_type()`), а не из путей:
   - `deb` → автоустановка: plugin запускает `pkexec dpkg -i` (системное окно пароля администратора), запасные пути — zenity/kdialog + sudo;
   - `AppImage` → автоустановка только при `APPIMAGE`, указывающей на существующий файл (TRO-28 сохранён);
   - распакованный AppImage, сборка без метки (`cargo build`, `tauri dev`), `rpm` (он не публикуется) → ручной режим.
   - Windows/macOS — без изменений (штатные NSIS/MSI/.app).
   - `check_app_update` отдаёт `installKind`. Повторная проверка в `install_app_update` выполняется до обращения к updater-resource.
2. **UI (`ui/index.html`).** Для `installKind = deb` в статусе, в подтверждении установки и в прогрессе написано, что будет запрошен пароль администратора. После неудачной или отменённой установки устаревший `rid` сбрасывается, следующая попытка начинается с новой проверки. Ручной режим остался только для `manual`.
3. **CI (`.github/workflows/build.yml`).**
   - Шаг «Verify deb updater artifact»: проверяет, что `.deb.sig` создан (tauri-cli 2.12 подписывает deb/rpm при `createUpdaterArtifacts: true`) и что в `/usr/bin/trophy-navigator-desktop` стоит метка `DEB`. Для перепакованного AppImage проверяется метка `APP`.
   - `.deb.sig` загружается в артефакты, deb стал обязательным артефактом релиза.
   - `latest.json` собирается python-скриптом, пустая подпись роняет job. Ключи manifest:

     | ключ | файл |
     |---|---|
     | `linux-x86_64-deb` | `trophynav.ru/releases/trophy-navigator-desktop_X_amd64.deb` |
     | `linux-x86_64-appimage` | `…_amd64.AppImage` |
     | `linux-x86_64` (общий fallback) | `…_amd64.AppImage` |
     | `windows-x86_64-nsis`, `windows-x86_64` | `…_x64-setup.exe` |
     | `windows-x86_64-msi` (если есть подпись) | GitHub Release `Trophy.Navigator.Desktop_X_x64_en-US.msi` |
     | `darwin-aarch64-app`, `darwin-aarch64` | GitHub `…_aarch64.app.tar.gz` |
     | `darwin-x86_64-app`, `darwin-x86_64` | GitHub `…_x64.app.tar.gz` |

     Порядок поиска в plugin 2.10.0: `{os}-{arch}-{bundle}` → `{os}-{arch}`.
   - `tauri.conf.json` менять не нужно: `createUpdaterArtifacts: true` и `targets: "all"` уже стоят.
4. **Версия 0.9.27:** `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`, `ui/index.html`, текст GitHub Release.

## Что проверено локально (07.10.2026, без установки пакетов)

- `cargo test`: 6/6, включая новые ветки deb / AppImage / распакованный AppImage / сборка без метки / rpm. `node --test tests/*.test.mjs`: 31/31.
- `cargo tauri build --bundles deb` (tauri-cli 2.12.1) без ключа подписи: deb собран, бинарник пропатчен (`Patching … with bundle type information: deb`), в `/usr/bin/trophy-navigator-desktop` найдена метка `__TAURI_BUNDLE_TYPE_VAR_DEB`. Затем сборка падает с понятной ошибкой `A public key has been found, but no private key. Make sure to set TAURI_SIGNING_PRIVATE_KEY`, и `.deb.sig` не создаётся. В CI на этом месте сработает проверка `Verify deb updater artifact`.
- Генерация manifest из CI-шага прогнана на фиктивных артефактах: все ключи на месте; без MSI выдаётся предупреждение, без любой обязательной подписи job падает.
- E2E на localhost. Использовались настоящий `tauri-plugin-updater 2.10.0`, одноразовый ключ (не `~/.tauri/tnd-signing.key`), manifest с ключами CI и подписанный локальный deb. Метку бандла в тестовом бинарнике патчили так же, как это делает bundler:
  - метка DEB → берётся `linux-x86_64-deb`, deb скачан, подпись верна;
  - метка APP → `linux-x86_64-appimage`;
  - без метки → общий `linux-x86_64` (в приложении это ручной режим);
  - DEB + manifest без `-deb` (как сейчас на проде) → берётся AppImage. Это и есть поломка HP;
  - DEB + чужая подпись → `The signature verification failed`, до установки дело не доходит.
- Реальная установка (`pkexec dpkg -i`) не проверялась: на ноутбуке пакеты не ставили, на HP не заходили. Это пункт smoke после релиза.

## HP с 0.9.22: обновится сам или вручную

**Ожидаемо — сам.** В 0.9.22 нет TRO-28-guard, а бинарник помечен как DEB. Как только в manifest появится `linux-x86_64-deb`, 0.9.22 скачает подписанный .deb и выполнит `pkexec dpkg -i`. То же относится к DEB 0.9.23–0.9.25.

**Вручную один раз — только DEB 0.9.26.** Его guard блокирует всё, кроме AppImage. Если на HP автообновление 0.9.22 всё-таки не пройдёт (нет pkexec или polkit-агента, отменили окно, ошибка), ставим вручную, тоже один раз.

### Инструкция для Andre (HP, Ubuntu/Debian)

1. Открыть https://trophynav.ru/desktop.html и скачать `trophy-navigator-desktop_0.9.27_amd64.deb` (или `wget https://trophynav.ru/releases/trophy-navigator-desktop_0.9.27_amd64.deb`).
2. Закрыть Trophy Navigator.
3. В терминале, в папке с файлом: `sudo apt install ./trophy-navigator-desktop_0.9.27_amd64.deb`. `./` обязателен — без него apt ищет пакет в репозиториях.
4. Проверить: `dpkg -l trophy-navigator-desktop` → `0.9.27`; в программе «О программе» → 0.9.27.

Данные пользователя (`~/.local/share/ru.trophy-nav.desktop` и т.п.) пакет не трогает. Следующие версии придут через «Проверить обновление» с запросом пароля.

## Релиз (только по команде Andre, после GO Тима и sign-off Тома)

1. Влить `fix/updater-all-installs` в `main`, тег `v0.9.27`, push тега.
2. CI: зелёные build-windows / build-linux (шаг «Verify deb updater artifact») / build-macos / release.
3. Alpha-KM: `curl -s https://trophynav.ru/api/updates/latest.json | jq '.version, (.platforms|keys)'` → `0.9.27` и все ключи из таблицы; `curl -sI` на `.deb`, `.AppImage`, `-setup.exe` → 200. Витрины `index.html`/`download.html` — по чек-листу AGENTS.md.
4. Smoke:
   - **AppImage** (штатный запуск) старой версии → «Проверить обновление» → установка без пароля, перезапуск, 0.9.27;
   - **DEB** — HP 0.9.22: окно pkexec → пароль → перезапуск → `dpkg -l` = 0.9.27. Отмена окна: понятная ошибка, система не повреждена;
   - **распакованный AppImage** (`--appimage-extract`, запуск `squashfs-root/AppRun`) → ручной режим, внутренний ELF не изменён;
   - **Windows NSIS** 0.9.26 → автообновление до 0.9.27.

## Критерии приёмки

- DEB 0.9.27 видит обновление и ставит его через pkexec. Повторная проверка после установки: «актуальная версия».
- AppImage без `APPIMAGE` и сборки без метки бандла никогда не получают `rid` и не вызывают установку.
- В manifest нет пустых подписей, `linux-x86_64-deb` указывает на .deb, общий `linux-x86_64` — на AppImage.
- `cargo test` и `node --test tests/*.test.mjs` зелёные.

## Риски

- **pkexec/polkit.** На минимальных системах без polkit-агента plugin пробует zenity/kdialog, затем терминальный `sudo`; из GUI это закончится ошибкой. Ручной путь через сайт остаётся рабочим.
- **`dpkg -i` не тянет новые зависимости.** Если в 0.9.27+ появится новая системная зависимость, автообновление DEB упадёт на dpkg, и её придётся ставить через `apt install ./…deb`. Сейчас зависимости те же, что в 0.9.26.
- **MSI-обновление идёт с GitHub.** Если GitHub недоступен, MSI-клиенты не обновятся. NSIS и Linux берут файлы с trophynav.ru.
- **Плавающий tauri-cli в CI** (`cargo install tauri-cli --version "^2"`). Если будущая версия перестанет подписывать deb или вшивать метку, CI упадёт на новых проверках и не опубликует битый manifest.
- **0.9.22–0.9.25 без guard.** Их DEB-ветка работает и раньше работала по метке бандла. TRO-28 касался только запусков без метки или распакованного AppImage, а такие сборки мы не публикуем.

## Откат

- Если сломался manifest, вернуть на Alpha-KM предыдущий `latest-desktop.json` (бэкап перед заменой). Без ключа `linux-x86_64-deb` DEB-клиенты просто снова перестают обновляться, вреда нет.
- Если сломалось приложение, `git revert` коммитов ветки и выпуск 0.9.28 через тот же CI. Пострадавшие DEB-установки: `sudo apt install ./trophy-navigator-desktop_0.9.26_amd64.deb --allow-downgrades`.
