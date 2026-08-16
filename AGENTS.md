# Repository Guidelines

## Структура проекта
Основное desktop-приложение собрано на Tauri. Rust-код находится в `src-tauri/src/main.rs`, конфигурация приложения в `src-tauri/tauri.conf.json`, права доступа в `src-tauri/capabilities/`, иконки в `src-tauri/icons/`. Веб-интерфейс хранится как статический фронтенд в `ui/`: основная логика и разметка сосредоточены в `ui/index.html`, рядом лежат `leaflet.css` и `leaflet.js`. Отдельный сервер синхронизации расположен в `sync-server/server.js`; зависимости и lockfile живут в `sync-server/package*.json`. CI-сборка описана в `.github/workflows/build.yml`.

## Сборка, запуск и проверка
Запуск desktop-приложения в dev-режиме: `cd src-tauri && cargo tauri dev`. Проверка Rust-кода без сборки пакета: `cd src-tauri && cargo check`. Релизная сборка: `cd src-tauri && cargo tauri build`. Форматирование Rust: `cd src-tauri && cargo fmt`. Для sync-server используйте `cd sync-server && npm ci`, затем `npm start`; по умолчанию сервер слушает порт `9222`.

## Стиль кода и именование
Сохраняйте существующий стиль, не вводите новые паттерны без причины. Для Rust используйте стандартный `rustfmt`, `snake_case` для функций и переменных, `CamelCase` для структур. В `server.js` и встроенных скриптах/стилях `ui/index.html` придерживайтесь 2 пробелов и понятных имен в camelCase. Новые Tauri-команды называйте глаголами (`check_app_update`, `get_hardware_id`), а UI-идентификаторы делайте привязанными к назначению (`btn-map-layer`, `statusbar`).

## Тестирование
Формального набора автотестов в репозитории сейчас нет, поэтому перед PR обязателен smoke-test. Минимум: `cargo check`, запуск `cargo tauri dev`, проверка открытия карты, базовых модальных окон и сценариев обновления/лицензии, если код их затрагивает. Для sync-server вручную проверьте `GET /api/ping`, `GET /api/state` и `PUT /api/state` с заголовком `X-Api-Key`.

## Коммиты и Pull Request
История использует короткий префикс и двоеточие: `fix: ...`, `release: ...`. Следуйте тому же формату и пишите сообщение в повелительном или описательном виде, но по сути изменения. В PR указывайте цель, риск, способ проверки и связанные задачи. Для изменений интерфейса прикладывайте скриншоты; для изменений сборки или обновлений указывайте, какие платформы проверялись.

## Конфигурация и артефакты
Не коммитьте временные артефакты и локальные данные. Каталоги `src-tauri/target/`, `.playwright-mcp/`, логи и содержимое `sync-server/data/` считаются рабочими файлами среды, а не исходниками.

## Релизный чек-лист desktop (обязательный)
После пуша тега `vX.Y.Z` и успешной сборки CI (GitHub Release + updater manifest) **релиз не закончен**, пока не обновлены публичные витрины на Alpha-KM. Проверяемые поверхности:

1. **Updater manifest** — `curl -s https://trophynav.ru/api/updates/latest.json` должен отдавать новую версию с валидными `signature`/`url` на GitHub Release (CI выкладывает автоматически через secrets `UPDATES_DEPLOY_*`). Beta-канала для desktop **нет** — обновлять `latest-desktop-beta.json` не нужно.
2. **Артефакты в `/var/www/trophy-site/releases/`** на Alpha-KM — CI обязан выложить их до manifest под именами `trophy-navigator-desktop_X.Y.Z_x64-setup.exe` и `trophy-navigator-desktop_X.Y.Z_amd64.AppImage`, проверить SHA-256 и публичный HTTP 200. Ручное скачивание/переименование из GitHub Release (`curl -fL -o`) — только аварийный fallback, если manifest ещё не опубликован.
3. **`/var/www/trophy-site/index.html`** — блок Desktop содержит `<div class="dl-ver">vX.Y.Z · Windows &amp; Linux</div>` и две ссылки на `/releases/trophy-navigator-desktop_X.Y.Z_*`.
4. **`/var/www/trophy-site/download.html`** — обе карточки `.dl-ver` показывают `vX.Y.Z`, а все ссылки CTA/скачивания ведут на `/releases/trophy-navigator-desktop_X.Y.Z_*`.

Перед правками сделайте `cp file.html file.html.bak.$(date +%Y%m%d_%H%M%S)`. После правок проверьте `curl -s https://trophynav.ru/ | grep 'dl-ver.*vX.Y.Z'`, `curl -s https://trophynav.ru/desktop.html | grep 'dl-ver.*vX.Y.Z'` и `curl -sI https://trophynav.ru/releases/trophy-navigator-desktop_X.Y.Z_x64-setup.exe` (должен быть `200 OK`).

SSH на Alpha-KM: `ssh alphakm-ru`. GitHub Actions выкладывает updater-файлы непривилегированным пользователем `tnd-deploy` только в `/var/www/updates/` и `/var/www/trophy-site/releases/`; приватный ключ хранится только в repo secret `UPDATES_DEPLOY_SSH_KEY`.

## Правила планирования и разработки (Строгие ограничения)
- **КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО изменять любой рабочий код приложения или файлы проекта без предварительного согласования и явной команды пользователя.**
- **Регламент работы строго последовательный:**
  1. **Исследование и планирование:** Сначала проводится глубокий анализ, результаты которого оформляются в виде плана с обязательным указанием даты, точного времени и имени автора (агента).
  2. **Согласование:** План передается пользователю на рассмотрение. Любые изменения кода на этом этапе полностью заблокированы.
  3. **Реализация:** Переход к изменению кодовой базы разрешен исключительно после получения явного подтверждения и команды от пользователя на выполнение утвержденного плана.
