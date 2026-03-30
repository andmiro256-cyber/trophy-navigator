# Trophy Navigator

## Status
Active — экосистема из двух приложений-компаньонов (как Mac + iPhone):
- **Android** v2.9.6 — полевая навигация, GPS, треки, live мониторинг, оффлайн карты
- **Desktop** v0.9.0 — планирование, роутинг, анализ, офлайн карты, кэш, темы

## Description
Trophy Navigator — экосистема навигации для трофи-рейдов.
- **Android:** com.andreykoff.racenav, /home/andre22/Projects/racenav-android/, github.com/andmiro256-cyber/racenav-android
- **Desktop (TND):** Tauri 2 + Leaflet, /home/andre22/Projects/trophy-navigator/, github.com/andmiro256-cyber/trophy-navigator
- Сервер: root@87.120.84.254 (DE2), SSH: ssh -i ~/.ssh/id_de2 root@trophynav.ru
- Админка: http://87.120.84.254:9222/admin/ (admin/***REMOVED***)
- Сайт: trophynav.ru (nginx, /opt/trophy-desktop/)

## Current State
- Last session: 2026-03-28 (мега-сессия)
- **Android: v2.9.6** deployed
- **Desktop: v0.9.0** deployed — Windows .exe + Linux AppImage on trophynav.ru
- GitHub Actions CI: тег v0.9.0, Windows + Linux автосборка
- VPN: relay 158.160.243.222 (белые списки), Premium28/Premium Max подписки
- Скилл vpn-agent создан
- План переезда AI-агентов на отдельный сервер BOT

## Architecture Notes — Desktop
- Tauri 2 (Rust) + Leaflet (UI), ~/Documents/TrophyNavigator/ (waypoints/tracks/routes/maps/gpx/backup)
- Лицензия: триал 20 дней, machine ID (HW-xxx), GET /api/desktop/license/{machineId}
- Email привязка: POST /api/email/register → sync key автогенерация
- Каталог карт: загружается с сервера, normalizeCatalog() для обоих форматов (id/name и key/label)
- Пользователь может скрывать карты (localStorage tnd-hidden-layers)
- Автосохранение: localStorage + session.json каждые 30/60 сек
- State restore: initApp → loadStateFromFile || restoreState (один вызов, без дублирования)
- Signing key: ~/.tauri/tnd-signing.key (env TAURI_SIGNING_PRIVATE_KEY, PASSWORD="")
- Build: `TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/tnd-signing.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" cargo tauri build --bundles appimage`
- AppImage WM_CLASS: trophy-navigator-desktop
- Плагины Tauri: updater, dialog, fs, process, opener

## Architecture Notes — Server (tnd-sync)
- Node.js Express, /opt/tnd-sync/server.js, порт 9222
- Данные: /opt/tnd-sync/data/ (state per API key, desktop-devices.json, email-registry.json)
- Каталог: /opt/trophy-desktop/api/tiles-catalog.json + /opt/tnd-sync/data/tile_catalog.json
- parse_zmp.py: парсит AnyGIS ZMP → tile_catalog.json (cron воскресенье 03:00)
- API: /api/state, /api/email/register, /api/email/info/:email, /api/desktop/trial, /api/desktop/license, /api/tiles-catalog.json

## Architecture Notes — Mail Server (DE2)
- Postfix + Dovecot + Roundcube, webmail https://trophynav.ru/mail/

## Team
- Opus (я) — главный, ноутбук
- Джек (Sonnet CLI) — DE2
- Том — ревьюер, автозапуск после билда
- Краб (OpenClaw/Gemini) — UX/анализ

## Unresolved Problems
- Master ключи в APK — нужен аудит безопасности
- Яндекс Спутник: смещение ~15км (EPSG:3395 vs EPSG:3857)
- Краш без интернета — LiveUsersPoller с таймаутами, но MapLibre внутренние ретраи не контролируем
- Нужно полевое тестирование сегментации трека и bearing interpolation

## Decisions Made
- [2026-03-26] Офлайн карты: раздельные файлы (подход Б), связка по имени, авто-подключение всех слоёв при выборе, подменю для вкл/выкл отдельных слоёв
- [2026-03-25] Триал 20 дней, деградация (карта+GPS бесплатно, premium заблокирован, 5 точек макс)
- [2026-03-25] Email lock после сохранения (изменить только через поддержку)
- [2026-03-25] NaN маркер для сегментации трека (>200м + >30с паузы)
- [2026-03-25] Bearing interpolation lerp 0.15/кадр в Choreographer (Яндекс-like)
- [2026-03-25] START_STICKY + null intent auto-resume для обоих сервисов
- [2026-03-25] Firebase Crashlytics для crash reporting
- [2026-03-20] Workflow: код → Том ревью → тест → деплой только по команде
- [2026-03-20] Email привязка: одна учётка = лицензия + данные на всех устройствах
- [2026-03-27] UX: кастомные диалоги, drag&drop, onboarding, горячие клавиши, сохранение позиции
- [2026-03-27] Лицензии: единый лимит 3 устройства на email (Android+Desktop), Desktop проверяет Android лицензии
- [2026-03-27] Каталог карт: единый источник (админка → tile_catalog.json → API), без hardcoded слоёв
- [2026-03-20] Каталог карт с сервера, оба формата, пользователь может скрывать слои
- [2026-03-20] maxNativeZoom + maxZoom=22 на всех слоях (растяжение вместо белого экрана)
- [2026-03-20] AppImage для Linux (автообновление), deb только для ручной установки
- [2026-03-27] Windows ссылка восстановлена на сайте (лицензии готовы, v0.8.2)
- [2026-03-20] Приложение называется Trophy Navigator (не RaceNav)
- [2026-03-19] Деплой — только с явного разрешения пользователя
- [2026-03-19] macOS отложен ($99/год нецелесообразно)
- [2026-03-17] Меню данных: 4 таба WP/RTE/TRK/GPX

## Next Steps (приоритет)
1. **Архив гонок** — публикация Race Report на сервер (trophynav.ru/races/{slug})
2. **Народная карта проходимости** — агрегация треков → GeoJSON overlay
3. **Маршруты сообщества** — публичная библиотека маршрутов
4. **Попутчики** — события "Покатушки" с регионом и датой
5. **Личная статистика сезона** — агрегация треков по email
6. **Подготовка сервера** — async writes, rate-limit, SQLite
## Session History
- [2026-03-27/28] Desktop v0.8.2→v0.9.0 deployed: полигон-скачивание (ConvexHull, point-in-polygon), динамический выбор слоёв (radio+overlay opacity), офлайн карты (SQLite TileLayer, scan maps/, секция в layer selector), кэш тайлов (IndexedDB LRU 1-10GB, img→canvas→blob обход CORS, prefetch), светлая/тёмная тема (CSS vars, anti-flash), 160+ inline→CSS vars рефакторинг, баги Pavel Mironov (rename+sync push), Windows link restored на сайте, план социальных фич (архив гонок, карта проходимости, маршруты, попутчики). 5 раундов ревью Тома, 2 ревью Краба.
- [2026-03-27 день] Desktop v0.8.2→v0.9.0: полигон-скачивание (ConvexHull), офлайн карты (SQLite TileLayer, scan maps/), кэш тайлов (IndexedDB LRU 1-10GB, prefetch), светлая/тёмная тема, 160+ inline→CSS vars, overlay opacity, zoom range, фикс rename/sync push/overlay names, Windows link restored, deploy v0.9.0
- [2026-03-27] Desktop v0.8.0→v0.8.2: Race Report, Live Android-style, единый каталог карт, UX (dialogs/dnd/onboarding/shortcuts), лицензии Android↔Desktop, русские карты, лимит 3 устройства: Race Report (трек×маршрут, графики, timeline, экспорт HTML), Live маркеры Android-style (ромбы, цвета, PRO gold, fix String(id)), настройки размера маркеров/подписей, UI (Загрузить, контакты info@trophynav.ru), latest.json обновлён
- [2026-03-26 ночь] Desktop v0.8.0: Live мониторинг (sidebar+markers+polling), overlay subdomains fix, floating panel. Android v2.9.5→v2.9.6: MIME fix, zoom info, Tom review fixes
- [2026-03-26] Sprint 1 офлайн-карт: PolygonAreaPicker, ConvexHull, SizeEstimator, LayerSelectorBottomSheet, Firebase Crashlytics, связка файлов, подменю слоёв, polygon filter
- [2026-03-25/26 ночь] v2.8.8→v2.9.3: bearing interpolation, сегментация треков, email prompt+lock+register, деградация триала 20дн, GPS индикатор 🛰️, UiSettings/dimens жесты, START_STICKY, WakeLock fix, NaN crash fix, fullscreen fix, быстрая смена карт, мониторинг fix (server-monitor), UFW 9222, Firebase Crashlytics, Obsidian DEV-62/65
- [2026-03-22 вечер] GPS jamming (GnssStatusMonitor, C/N0, GPS dot), PRO маркеры (золото — Android + веб + сервер), Sync UX (email-based, авто-sync), TopBar toggles (STOP/GO/GPS), Яндекс тайлы (EPSG:3395, WIP), live.html (layer control fix + PRO маркеры + попап fix), live мониторинг через DE2
- [2026-03-20 день] Desktop v0.6.1→v0.6.3: поиск (Nominatim), роутинг (OSRM), редактирование маршрутов (drag&drop, rename), настройки цветов, email sync, Garmin символы, GPX save dialog, tile overzoom, AppImage сборка, opener plugin, каталог карт с сервера, блокировка объектов, очистка карты
- [2026-03-19 ночь] v2.8.5→v2.8.7(debug): GPS status dot, fix service stop, fix world-view flash
- [2026-03-19 вечер] Android v2.7.7→v2.8.5: inertia flyToGps, GPU keep-alive, TraccarService
- [2026-03-19] Почта @trophynav.ru: Postfix+Dovecot+Roundcube
- [2026-03-19] Desktop v0.6.0: GitHub Releases, страница загрузки
- [2026-03-17 вечер] 60fps camera, services stop on exit, TopBar. v2.6.5→v2.7.0
- [2026-03-17 день] 4-tab menu, звуки, WP свойства. v2.5.4→v2.6.0
- [2026-03-17 утро] Waypoint & Route Manager, GO/STOP. v2.4.4→v2.5.1
- [2026-03-16 вечер] Bearing freeze, easeCamera, фильтры трека. v2.4.2→v2.4.4
- [2026-03-16] GPS StateFlow, компас, лицензия, админка. v2.2.0→v2.4.2
