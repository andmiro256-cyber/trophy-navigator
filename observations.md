# Observations - trophy-navigator

## Index
| # | Date | Type | Summary | Files |
|---|------|------|---------|-------|
| 79 | 2026-03-27 | bugfix | Live markers: String(id) type mismatch | ui/index.html |
| 80 | 2026-03-27 | feature | Race Report: track×route analysis | ui/index.html |
| 81 | 2026-03-27 | decision | Windows download link restored on site | /opt/trophy-desktop/index.html |
| 82 | 2026-03-27 | bugfix | Quick rename не обновлял иконку | ui/index.html |
| 83 | 2026-03-27 | bugfix | Sync push: отсутствовала обёртка data | ui/index.html |
| 84 | 2026-03-27 | bugfix | Трек не переезжал при включении | ui/index.html |
| 85 | 2026-03-28 | feature | Tile cache IndexedDB LRU | ui/index.html |
| 86 | 2026-03-28 | feature | Offline maps in layer selector | ui/index.html |
| 87 | 2026-03-28 | decision | VPN relay 158.160.243.222 whitelists | YC/CF/Obsidian |
| 88 | 2026-03-28 | feature | Premium28 / Premium Max subscriptions | YC Function, CF Worker |
| 89 | 2026-03-28 | feature | VPN agent skill | vpn-agent/SKILL.md |
| 1 | 2026-03-15 | feature | Settings restructured into 5 tabs | SettingsFragment.kt, fragment_settings.xml |
| 2 | 2026-03-15 | bugfix | Tag-based tab visibility (text match broken by collapsible) | SettingsFragment.kt, fragment_settings.xml |
| 3 | 2026-03-15 | feature | 13 new map sources + 2 overlays | MapFragment.kt |
| 4 | 2026-03-15 | discovery | findFragmentById returns wrong fragment with add() | SettingsFragment.kt |
| 5 | 2026-03-15 | bugfix | Handler leak crash in live users refresh | SettingsFragment.kt |
| 6 | 2026-03-15 | feature | Per-waypoint proximity + dual radius circles | GpxParser.kt, MapFragment.kt |
| 7 | 2026-03-15 | feature | Share buttons for track, waypoints, offline maps | MapFragment.kt, SettingsFragment.kt |
| 8 | 2026-03-15 | bugfix | Tile download: 4 bugs fixed (rect, overlays, URLs, zoom) | MapFragment.kt, TileDownloadManager.kt |
| 9 | 2026-03-16 | feature | Admin panel + license API complete | server.js, admin/index.html |
| 10 | 2026-03-16 | bugfix | Cleared fake test payments in admin DB | devices.json |
| 11 | 2026-03-16 | feature | Custom license duration in admin | server.js, admin/index.html |
| 12 | 2026-03-16 | feature | "First seen" column + installTime diag | server.js, DiagnosticsCollector.kt |
| 13 | 2026-03-16 | bugfix | Skip resume dialog for tracks <50m | MapFragment.kt |
| 14 | 2026-03-16 | feature | Auto update check on app launch | MainActivity.kt |
| 15 | 2026-03-16 | discovery | latest.json was missing on server | /var/www/html/updates/ |
| 16 | 2026-03-16 | bugfix | Bearing freeze with hysteresis (1/3 km/h) | MapFragment.kt |
| 17 | 2026-03-16 | feature | easeCamera 300ms for smooth turns | MapFragment.kt |
| 18 | 2026-03-16 | feature | Track filter settings (distance/accuracy/moving) | SettingsFragment.kt, TrackingService.kt, fragment_settings.xml |
| 19 | 2026-03-16 | bugfix | Speed filter removed from track recording | TrackingService.kt |
| 20 | 2026-03-16 | discovery | Deploy path /var/www/updates/ not /var/www/html/ | nginx config |
| 21 | 2026-03-16 | decision | Bearing thresholds: freeze<1km/h, unfreeze>3km/h | MapFragment.kt |
| 22 | 2026-03-17 | bugfix | WP circles offset from coords (padding) | MapFragment.kt |
| 23 | 2026-03-17 | feature | Route line toggle (show/hide) | MapFragment.kt, SettingsFragment.kt, fragment_settings.xml |
| 24 | 2026-03-17 | bugfix | Widget defaults: too many on by default | MapFragment.kt, SettingsFragment.kt |
| 25 | 2026-03-17 | bugfix | Quick action menu not scrolling | MapFragment.kt |
| 26 | 2026-03-17 | feature | Route editor: name field + hide button | MapFragment.kt |
| 27 | 2026-03-17 | bugfix | UI review: 6 fixes (bold, padding, colors) | fragment_map.xml, MapFragment.kt, WaypointAdapters.kt, ic_sym_square.xml |
| 28 | 2026-03-17 | feature | Sound alerts: wrong WP, finish, markers | MapFragment.kt |
| 29 | 2026-03-17 | feature | 4-tab data menu (WP/RTE/TRK/GPX) | MapFragment.kt |
| 30 | 2026-03-17 | feature | WP popup menu (properties, navigate, delete) | MapFragment.kt |
| 31 | 2026-03-17 | bugfix | Crosshair permanent in FREE mode | MapFragment.kt |
| 32 | 2026-03-17 | bugfix | WP names empty on restore/import | MapFragment.kt, GpxParser.kt |
| 33 | 2026-03-17 | feature | Stadium horn on finish (AudioTrack) | MapFragment.kt |
| 34 | 2026-03-17 | feature | Widget order: drag&drop RecyclerView | WaypointAdapters.kt, SettingsFragment.kt |
| 35 | 2026-03-17 | feature | Smooth 60fps camera (Choreographer) | MapFragment.kt |
| 36 | 2026-03-17 | bugfix | Services not stopping on app exit | TraccarService.kt, TrackingService.kt |
| 37 | 2026-03-17 | feature | TopBar left/right zones with swipe | SettingsFragment.kt, MapFragment.kt |
| 38 | 2026-03-17 | bugfix | Samsung update install silent fail | UpdateManager.kt, file_provider_paths.xml |

## Details

### [1] 2026-03-15 | feature | Settings restructured into 5 tabs
**Before:** 4 tabs (Основные, Файлы, Сеть, О программе), settings mixed between sections
**After:** 5 tabs (Основные, Файлы, Карты, Сеть, О программе) with logical grouping
**Files:** SettingsFragment.kt, fragment_settings.xml
**Why:** Settings were disorganized — navigation settings under marker, track recording without section header

### [2] 2026-03-15 | bugfix | Tag-based tab visibility system
**Before:** applyTabVisibility used text.contains() matching — broke when setupCollapsibleSections prepended "▶ " to header text
**After:** Each section header has android:tag="tab:xxx" in XML, applyTabVisibility reads tag instead of text
**Files:** SettingsFragment.kt, fragment_settings.xml
**Why:** Text matching was unreliable — "О ПРИЛОЖЕНИИ" tab was always empty, content showed in "Сеть"

### [3] 2026-03-15 | feature | 13 new map sources + 2 overlays added
**Before:** 10 base maps, 9 overlays
**After:** 23 base maps (Yandex Sat, Google Maps/Terrain/Hybrid, ESRI Clarity, 2GIS, etc.), 11 overlays
**Files:** MapFragment.kt
**Why:** More map coverage needed, especially for Russia (Yandex) and outdoor activities

### [4] 2026-03-15 | discovery | findFragmentById returns wrong fragment with add()
**Before:** findFragmentById(R.id.container) as? MapFragment — returns null because SettingsFragment is on top (added via add(), not replace())
**After:** fragments.filterIsInstance<MapFragment>().firstOrNull() — searches all fragments
**Files:** SettingsFragment.kt (30 occurrences)
**Why:** Settings fragment is added on top of MapFragment, both in same container

### [8] 2026-03-15 | bugfix | Tile download: 4 bugs fixed
**Before:** Rectangle not drawn (triple-nested GeoJSON brackets), only base maps in dialog, overlay URLs not resolved (getTileSourceInfoMap only had tileSources), zoom seekbar hardcoded max=17
**After:** GeoJSON coordinates fixed to double brackets, overlay sources shown in separate "Оверлеи" section, getTileSourceInfoMap includes overlay sources, zoom max dynamically calculated from selected sources' maxZoom
**Files:** MapFragment.kt, TileDownloadManager.kt
**Why:** Tile download feature was non-functional — 0 tiles downloaded because overlay keys weren't in the source info map, rectangle invisible due to malformed GeoJSON

### [9] 2026-03-16 | feature | Admin panel + license API complete
**Before:** Admin panel had dummy tariffs (1m/3m/6m/12m with 0 revenue), no auth, no license API, no email binding, no payment tracking
**After:** 3 real plans (license 2000r/yr, full 5000r/yr, server 500r/mo), Basic Auth (admin/***REMOVED***), GET /api/license/:deviceId with trial support, email binding, payments array, disable-server endpoint, revenue tracking
**Files:** /opt/tnd-sync/server.js, /opt/tnd-sync/admin/index.html
**Why:** Need working monetization infrastructure for RaceNav app launch

### [10] 2026-03-16 | bugfix | Cleared fake test payments in admin DB
**Before:** 5 devices had fake payment records from testing admin buttons (total 18500₽ fake revenue)
**After:** Payments cleared, only snowwolf888 devices (4D46E43F vivo, 6DD48574 samsung) have permanent license (2099), others on trial
**Files:** /opt/tnd-sync/data/admin/devices.json
**Why:** Admin activate button auto-creates payment records — testing left fake data

### [11] 2026-03-16 | feature | Custom license duration in admin
**Before:** Hardcoded durations: license=12mo, server=1mo, full=12mo+12mo
**After:** Duration field in form (default 12/1), prompt on row buttons, backend accepts licenseDuration/serverDuration overrides
**Files:** /opt/tnd-sync/server.js, /opt/tnd-sync/admin/index.html
**Why:** Need flexibility to issue licenses for different periods

### [12] 2026-03-16 | feature | "First seen" column + installTime in diagnostics
**Before:** No install date tracked; trial counted from first diagnostics report (all today)
**After:** DiagnosticsCollector sends installTime from SharedPreferences; server shows "Первый запуск" column; fallback to history.log first entry
**Files:** /opt/tnd-sync/server.js, DiagnosticsCollector.kt
**Why:** Trial period must count from real install date, not first server contact

### [13] 2026-03-16 | bugfix | Skip resume dialog for tracks <50m
**Before:** App offered "Continue recording?" even for tracks with 0 km (2 GPS points)
**After:** Tracks under 50m are silently discarded on next launch
**Files:** MapFragment.kt
**Why:** Annoying UX — no point resuming an empty track

### [14] 2026-03-16 | feature | Auto update check on app launch
**Before:** Update check only available manually from Settings
**After:** Auto-check 3s after launch, shows dialog "Доступно обновление" with changelog
**Files:** MainActivity.kt
**Why:** Users weren't aware of new versions

### [15] 2026-03-16 | discovery | latest.json was missing on server
**Before:** UpdateManager pointed to /updates/latest.json but file didn't exist, directory didn't exist
**After:** Created /var/www/html/updates/latest.json with version, url, changelog
**Files:** /var/www/html/updates/latest.json
**Why:** Update system was implemented in code but never deployed server-side

### [16] 2026-03-16 | bugfix | Bearing freeze with hysteresis
**Before:** Simple threshold at 1 km/h — no hysteresis, cursor could flap between frozen/unfrozen
**After:** Freeze at <1 km/h (0.3 m/s), unfreeze at >3 km/h (0.8 m/s). Separate bearingFrozen + lastValidBearing state
**Files:** MapFragment.kt
**Why:** GPS bearing unreliable at low speed; trophy raid vehicles often move at 1-2 km/h

### [17] 2026-03-16 | feature | easeCamera 300ms for smooth turns
**Before:** animateCamera() 500ms — sluggish rotation especially in 3D mode
**After:** easeCamera() 300ms — linear interpolation, more responsive
**Files:** MapFragment.kt (FOLLOW_NORTH + FOLLOW_COURSE)
**Why:** Research showed Google/Yandex use fast easing; 300ms matches GPS update interval

### [18] 2026-03-16 | feature | Track filter settings
**Before:** Hardcoded distance=2m, accuracy=50m, no user control
**After:** 3 settings: min distance (1-50m), max accuracy (10-100m, step 5), only-moving toggle. TrackingService reads from SharedPreferences
**Files:** SettingsFragment.kt, TrackingService.kt, fragment_settings.xml
**Why:** Locus Map exposes similar filters; users need control over track quality vs detail

### [19] 2026-03-16 | bugfix | Speed filter removed from track recording
**Before:** speed >= 1.0 m/s filter caused gaps on Vivo (accurate GPS chip reports real speed)
**After:** Distance-only filter; speed check moved to optional "only moving" setting
**Files:** TrackingService.kt
**Why:** Vivo GPS reports hasSpeed()=true with real values; Samsung often returns hasSpeed()=false

### [20] 2026-03-16 | discovery | Deploy path is /var/www/updates/ not /var/www/html/
**Before:** Put latest.json and APK in /var/www/html/updates/ — wrong path
**After:** nginx maps /updates/ → /var/www/updates/ (alias). All APKs historically in /var/www/updates/
**Files:** nginx sites-enabled config
**Why:** Opus put files in wrong dir, updates didn't reach users

### [21] 2026-03-16 | decision | Bearing thresholds for trophy raid
**Before:** Industry standard 2 km/h freeze
**After:** 1 km/h freeze, 3 km/h unfreeze — vehicles crawl at 1-2 km/h in mud/swamp
**Files:** MapFragment.kt
**Why:** Trophy raid specific — participants move very slowly on obstacles

### [22] 2026-03-17 | bugfix | WP circles offset from coordinates
**Before:** createWaypointBitmap had cx = circleR + 2*circleScale and circleBlockW = circleDiam + 4*circleScale — left padding shifted circle right of anchor point
**After:** cx = circleR, circleBlockW = circleDiam — circle center aligns exactly with coordinate when iconAnchor="left"
**Files:** MapFragment.kt
**Why:** WP markers visually shifted from their GPS coordinates on the map

### [23] 2026-03-17 | feature | Route line independent toggle
**Before:** Route line visibility was tied to WP toggle (setLoadedWpVisible toggled both)
**After:** Separate setRouteLineVisible() method, PREF_ROUTE_LINE_VISIBLE pref, rowRouteLine in settings with eye toggle button
**Files:** MapFragment.kt, SettingsFragment.kt, fragment_settings.xml
**Why:** Users need to hide route line independently from waypoint markers

### [24] 2026-03-17 | bugfix | Widget defaults: too many on by default
**Before:** altitude=true, tripmaster=true, nextcp_name=false — 7 widgets on by default, bottom bar overflowed
**After:** altitude=false, tripmaster=false, nextcp_name=true — 5 widgets on by default (speed, bearing, tracklen, nextcp, nextcp_name)
**Files:** MapFragment.kt, SettingsFragment.kt
**Why:** Too many widgets stretched the bottom bar, settings button didn't fit

### [25] 2026-03-17 | bugfix | Quick action menu not scrolling
**Before:** android.widget.ScrollView inside BottomSheetDialog — scroll conflicts with sheet drag
**After:** androidx.core.widget.NestedScrollView — proper nested scrolling with BottomSheet
**Files:** MapFragment.kt (showQuickActionMenu)
**Why:** With many points loaded, the quick action menu content exceeded screen height but couldn't scroll

### [26] 2026-03-17 | feature | Route editor: name field + hide button
**Before:** No way to rename route or hide it from editor
**After:** EditText for route name (saved to PREF_ROUTE_NAME on Apply), "Hide route" button (setLoadedWpVisible(false))
**Files:** MapFragment.kt (showRouteEditor)
**Why:** Users needed quick access to rename and hide route from the editor dialog

### [27] 2026-03-17 | bugfix | UI review: 6 design fixes
**Before:** GO button double-bold (textStyle+fontFamily), padding 24px not dp, route editor buttons unstyled, zebra #1A1A1A vs #1E1E1E, divider margins 1dp, square icon too small
**After:** GO bold removed (fontFamily only), padding 16dp density-aware, 5 buttons colored, zebra unified #1E1E1E, divider margins 4dp, square path M3,3h18v18H3z
**Files:** fragment_map.xml, MapFragment.kt, WaypointAdapters.kt, ic_sym_square.xml
**Why:** Designer review flagged inconsistencies and missing styling in programmatic UI

### [28] 2026-03-17 | feature | Sound alerts: wrong WP, finish, user markers
**Before:** Only active waypoint checked; approach beep + taken beep; finish = silent Toast; user markers ignored
**After:** All WPs checked for wrong-order entry (harsh buzzer, once per WP); finish = victory fanfare + emoji Toast; user markers trigger approach beep on proximity
**Files:** MapFragment.kt
**Why:** Navigators need audible warning when entering wrong waypoint zone; finish should be celebratory; user markers deserve proximity alerts too

### [34] 2026-03-17 | feature | Widget order: drag&drop RecyclerView
**Before:** Bottom widget order changed via Up/Down arrow ImageButtons, rebuilt entire view on each move
**After:** RecyclerView with WidgetOrderAdapter, drag handle, smooth ItemTouchHelper drag&drop, order saved on drop
**Files:** WaypointAdapters.kt (WidgetOrderAdapter), SettingsFragment.kt (buildWidgetOrderUI)
**Why:** Arrow buttons were clunky UX; drag&drop is standard for reordering lists
| 39 | 2026-03-19 | feature | Desktop v0.6.0 задеплоен на GitHub Releases | download.html, nginx |
| 40 | 2026-03-19 | bugfix | nginx /desktop отдавал octet-stream → исправлен default_type | /etc/nginx/sites-enabled/updates |
| 41 | 2026-03-19 | decision | Домен trophynav.ru, план лендинга, macOS отложен | - |

### [39] 2026-03-19 | feature | Desktop v0.6.0 задеплоен
**Before:** download.html указывал на v0.5.9 (несуществующая версия), заглушка вместо скриншота
**After:** v0.6.0, реальный скриншот + иконка приложения, ссылки на правильные артефакты (.exe 2MB NSIS, .AppImage 77MB)
**Files:** /opt/trophy-desktop/download.html, /opt/trophy-desktop/icon.png, /opt/trophy-desktop/screenshot.png
**Why:** v0.6.0 вышел на GitHub Releases, страница загрузки должна быть актуальной

### [40] 2026-03-19 | bugfix | nginx /desktop отдавал application/octet-stream
**Before:** location /desktop { alias .../download.html } — nginx не определял MIME по URL без расширения → браузер скачивал файл
**After:** location = /desktop.html + default_type text/html — открывается как страница
**Files:** /etc/nginx/sites-enabled/updates
**Why:** URL без .html расширения → nginx fallback на octet-stream

### [41] 2026-03-19 | decision | Домен и план сайта
**Before:** нет домена, нет лендинга
**After:** план: купить trophynav.ru (~200₽/год), сделать полноценный лендинг с историей проекта и про автора. macOS отложен до реального спроса ($99/год нецелесообразно)
**Files:** /root/notes/Проекты/Trophy Navigator Desktop.md
**Why:** нужна красивая публичная ссылка для распространения приложения
| 42 | 2026-03-19 | feature | Почтовый сервер Postfix+Dovecot+Roundcube | /etc/postfix/*, /etc/dovecot/*, nginx |
| 43 | 2026-03-19 | feature | Mail tab в админке + fetch auth fix | /opt/tnd-sync/server.js, admin/index.html |
| 44 | 2026-03-19 | bugfix | Бот: @Andreykoff, "до 3 ваших устройств" | /opt/trophynav-bot/bot.js |
| 45 | 2026-03-19 | feature | Email + контакты на сайте (navbar + footer) | /opt/trophy-desktop/index.html |

### [42] 2026-03-19 | feature | Почтовый сервер на DE2
**Before:** нет почты @trophynav.ru
**After:** Postfix+Dovecot+Roundcube, webmail https://trophynav.ru/mail/, ящики info@ и andrey@, DNS MX+SPF
**Files:** /etc/postfix/main.cf, /etc/dovecot/dovecot.conf, /etc/roundcube/config.inc.php, nginx
**Why:** Нужна корпоративная почта для поддержки клиентов

### [43] 2026-03-19 | feature | Mail management в админке
**Before:** нет управления почтой в admin panel
**After:** GET/POST /api/admin/mail/* в server.js, вкладка "✉️ Почта" в admin/index.html, MAIL_AUTH с явным Basic Auth заголовком
**Files:** /opt/tnd-sync/server.js, /opt/tnd-sync/admin/index.html
**Why:** Управление ящиками через GUI без SSH

### [44] 2026-03-19 | bugfix | Бот: контакты и лицензия
**Before:** @andmiro256 как контакт, "до 3 устройств" без пояснения
**After:** @Andreykoff, "до 3 ваших устройств (бэкап и синхронизация между ними)"
**Files:** /opt/trophynav-bot/bot.js
**Why:** Правильный ник + корректное описание ограничения по устройствам
| 46 | 2026-03-19 | bugfix | firstGpsAnim никогда не срабатывал | MapFragment.kt |
| 47 | 2026-03-19 | feature | TraccarService→FusedLocation/locationFlow | TraccarService.kt |
| 48 | 2026-03-19 | bugfix | Второе уведомление MainActivity убрано | MainActivity.kt |
| 49 | 2026-03-19 | decision | startForeground() обязателен — КРАШ при пропуске | TraccarService.kt, TrackingService.kt |
| 50 | 2026-03-19 | feature | flyToGps инерционный эффект overshoot 20% | MapFragment.kt |
| 51 | 2026-03-19 | bugfix | GPU keep-alive triggerRepaint в GPS callback | MapFragment.kt |
| 52 | 2026-03-20 | feature | GPS status dot в TopBar | MapFragment.kt, fragment_map.xml |
| 53 | 2026-03-20 | bugfix | Service stop on exit (onDestroy) | MainActivity.kt |
| 54 | 2026-03-20 | bugfix | World-view flash on startup | MapFragment.kt |
| 55 | 2026-03-20 | bugfix | Zombie notification race condition | TraccarService.kt, TrackingService.kt |
| 56 | 2026-03-20 | decision | onTaskRemoved — checkpoint only, not stop | TrackingService.kt, TraccarService.kt |

### [46] 2026-03-19 | bugfix | firstGpsAnim никогда не срабатывал
**Before:** waitingForFirstGps = false на строке 5408, проверка анимации на строке 5413 — флаг уже false
**After:** блок анимации перемещён ВНУТРЬ if (!initialZoomDone), до сброса waitingForFirstGps
**Files:** MapFragment.kt:5398-5419
**Why:** Баг порядка операций — Tom нашёл при ревью

### [47] 2026-03-19 | feature | TraccarService единый источник GPS
**Before:** TraccarService всегда GPS_PROVIDER → кэшированные координаты на Vivo (разлёт 10км)
**After:** TrackingService запущен → locationFlow (идентично курсору); иначе → FusedLocation; fallback GPS_PROVIDER
**Files:** TraccarService.kt
**Why:** Точность мониторинга = точность курсора, особенно критично на Vivo/BBK

### [48] 2026-03-19 | bugfix | Убрано второе уведомление
**Before:** MainActivity показывала APP_RUNNING_NOTIF_ID=1002 "RaceNav активен" параллельно с сервисным
**After:** Метод showAppRunningNotification() полностью удалён
**Files:** MainActivity.kt
**Why:** Добавлено в v2.7.3 для MIUI badge, стало лишним и раздражающим

### [49] 2026-03-19 | decision | startForeground() обязателен для каждого сервиса
**Before:** Попытка пропустить startForeground() в одном сервисе если другой уже foreground
**After:** Оба всегда вызывают startForeground() — Android убивает приложение через 5с если не вызвать
**Files:** TraccarService.kt, TrackingService.kt
**Why:** RemoteServiceException: "did not then call Service.startForeground()" — жёсткое требование API

### [50] 2026-03-19 | feature | flyToGps инерционный эффект
**Before:** zoom-анимация при возврате к GPS (пользователь просил убрать)
**After:** overshoot 20% мимо GPS → snap back 300ms+180ms; zoom меняется только если < 8
**Files:** MapFragment.kt (flyToGps)
**Why:** "Эффект тряхнуло" — живее и быстрее чем zoom

### [51] 2026-03-19 | bugfix | Лаг скролла после idle
**Before:** После паузы первые жесты на карте "залипали" на Samsung и Xiaomi
**After:** triggerRepaint() в GPS callback раз в секунду держит GPU warm, touch pipeline не засыпает
**Files:** MapFragment.kt (GPS callback)
**Why:** Samsung GPU снижает частоту после idle; triggerRepaint не даёт render loop засыпать

### [52] 2026-03-20 | feature | GPS status dot в TopBar
**Before:** нет индикатора качества GPS
**After:** точка 12dp в TopBar: зелёная (ок), оранжевая (accuracy>20м), красная (глушилка: координаты залипли + speed>5км/ч), серая (нет фиксов 5с)
**Files:** MapFragment.kt, fragment_map.xml
**Why:** Vivo показывал скорость 36км/ч при неподвижном курсоре — пользователь не понимал что GPS ненадёжен

### [53] 2026-03-20 | bugfix | Service stop on exit
**Before:** onDestroy() пустой → сервисы продолжали работать при закрытии
**After:** onDestroy: stopAllServices() + cancel(1001). Три уровня: ACTION_STOP, onDestroy сервисов, cancel notification
**Files:** MainActivity.kt
**Why:** Мониторинг висел в шторке после закрытия приложения

### [54] 2026-03-20 | bugfix | World-view flash on startup
**Before:** setStyle() сбрасывал камеру в (0,0,zoom=0), восстановление только в callback → видна вспышка
**After:** alpha=0 перед setStyle, alpha=1 в onStyleLoaded + safety timer 2с
**Files:** MapFragment.kt (loadTileStyle)
**Why:** Карта улетала на весь мир при каждом запуске

### [55] 2026-03-20 | bugfix | Zombie notification
**Before:** stopTracking() делал stopForeground(REMOVE) потом NotificationHelper.update() если другой сервис жив → зомби-уведомление
**After:** убран NotificationHelper.update() из stop-методов
**Files:** TraccarService.kt, TrackingService.kt
**Why:** Краб (Gemini 3.1 Pro) нашёл race condition при одновременной остановке

### [56] 2026-03-20 | decision | onTaskRemoved — only checkpoint
**Before:** планировали stopTracking/stopTraccar в onTaskRemoved
**After:** TrackingService.onTaskRemoved: только autoSaveTrack(). TraccarService: не переопределён.
**Files:** TrackingService.kt, TraccarService.kt
**Why:** Краб предупредил: Samsung/Vivo вызывают onTaskRemoved при переключении приложений, не только при свайпе

### [57] 2026-03-20 | feature | Desktop v0.6.1→v0.6.3 major update
**Before:** Desktop v0.6.0 с базовыми функциями
**After:** v0.6.3: поиск Nominatim, роутинг OSRM, настройки цветов, email sync, Garmin символы, GPX save dialog с чекбоксами, редактирование маршрутов (drag&drop), блокировка объектов, каталог карт с сервера, tile overzoom
**Files:** ui/index.html, src-tauri/Cargo.toml, src-tauri/src/main.rs, src-tauri/capabilities/default.json
**Why:** Массивное обновление функционала Desktop приложения за одну сессию

### [58] 2026-03-20 | decision | Email привязка для лицензий и синхронизации
**Before:** Лицензия привязана к machineId, sync к API key (TND-XXXX)
**After:** POST /api/email/register привязывает email → sync key → все устройства. Лицензия на одном устройстве = лицензия на всех устройствах email
**Files:** /opt/tnd-sync/server.js, ui/index.html
**Why:** Пользователь хочет одну учётку на все устройства (Android + Desktop)

### [59] 2026-03-20 | bugfix | Дублирование точек при восстановлении state
**Before:** restoreState() (localStorage) + loadStateFromFile() (session.json) = двойная загрузка
**After:** Один вызов в initApp(): loadStateFromFile || restoreState
**Files:** ui/index.html
**Why:** При каждом запуске точки маршрута задваивались

### [60] 2026-03-20 | bugfix | Лицензия показывала триал вместо lifetime
**Before:** Сервер возвращал daysLeft без expiry, клиент не мог сохранить лицензию
**After:** Клиент вычисляет expiry из daysLeft
**Files:** ui/index.html
**Why:** На всех устройствах бессрочная лицензия но показывало "29 дней"

### [61] 2026-03-20 | feature | AppImage сборка заработала
**Before:** linuxdeploy падал с ошибкой (libfuse.so.2 + librsvg)
**After:** sudo apt install libfuse2 librsvg2-dev → AppImage собирается с подписью
**Files:** Cargo.toml, main.rs, capabilities/default.json
**Why:** Автообновление на Linux работает только с AppImage

### [62] 2026-03-20 | decision | Tile overzoom — растяжение вместо белого экрана
**Before:** maxZoom = maxNativeZoom, при превышении — белый экран
**After:** maxNativeZoom = реальный лимит источника, maxZoom = 22 на всех слоях
**Files:** ui/index.html
**Why:** Пользователь жаловался на белый экран при зуме

### [63] 2026-03-22 | feature | GPS jamming: GnssStatusMonitor + C/N0
**Before:** Only basic accuracy/age checks, no satellite data
**After:** GnssStatusMonitor.kt with C/N0, satellite count, GPS dot in TopBar (green/yellow/red/grey)
**Files:** GnssStatusMonitor.kt (new), MapFragment.kt, fragment_map.xml
**Why:** Users encounter GPS jamming, need real-time detection

### [64] 2026-03-22 | feature | PRO gold markers for full plan
**Before:** All markers white border
**After:** Full plan: gold border + glow on arrow, gold diamond + ⭐ on live markers
**Files:** MapFragment.kt, LiveUsersPoller.kt
**Why:** Visual premium differentiation

### [65] 2026-03-22 | feature | Sync UX: Account & Data
**Before:** Separate Sync (TND key) + Backup (email)
**After:** Unified: email-first, manual key fallback, auto-sync toggles, data counters
**Files:** SettingsFragment.kt, fragment_settings.xml
**Why:** Simplify sync, email instead of cryptic keys

### [66] 2026-03-22 | bugfix | MainScope() crash in SettingsFragment
**Before:** MainScope().launch — crashes on detached fragment
**After:** viewLifecycleOwner.lifecycleScope.launch
**Files:** SettingsFragment.kt
**Why:** Tom found it — real crash when closing settings quickly

### [67] 2026-03-22 | discovery | Yandex sat tiles always EPSG:3395
**Before:** Assumed projection=web_mercator param fixes it
**After:** Confirmed: param has NO effect on sat tiles. Yandex sat is always Elliptical Mercator.
**Files:** Research in Obsidian
**Why:** Root cause of persistent ~15km shift

### [68] 2026-03-22 | problem | Yandex reprojection stitch artifacts
**Symptoms:** Individual reprojected tiles correct, but on map tiles stitch poorly
**Impact:** Yandex Спутник unusable with reprojection
**Status:** Open — reverted to regular proxy
**Files:** /opt/tnd-sync/yandex-reproject.js on DE2

| 69 | 2026-03-25 | feature | Bearing interpolation + Яндекс-like жесты | MapFragment.kt, dimens.xml |
| 70 | 2026-03-25 | feature | Track segmentation (NaN markers) | TrackingService.kt, GpxParser.kt, MapFragment.kt |
| 71 | 2026-03-25 | feature | Email prompt + lock + server register | MapFragment.kt, SettingsFragment.kt |
| 72 | 2026-03-25 | feature | Trial degradation 20 days | LicenseManager.kt, MainActivity.kt, MapFragment.kt |
| 73 | 2026-03-25 | bugfix | NaN crash in trackPoints getter | MapFragment.kt:82 |
| 74 | 2026-03-25 | bugfix | START_STICKY + onTaskRemoved fix | TrackingService.kt, TraccarService.kt |
| 75 | 2026-03-25 | bugfix | Mониторинг HTTP 500 (live2 proxy) | server-monitor/server.js |
| 76 | 2026-03-25 | decision | Firebase Crashlytics for crash reporting | build.gradle.kts, RaceNavApp.kt |

### [69] 2026-03-25 | feature | Bearing interpolation + gestures
**Before:** Bearing snapped once per GPS fix (1Hz), жесты с дефолтными порогами
**After:** displayBearing lerp 0.15/кадр, EMA 0.4, гистерезис freeze, UiSettings zoomRate=1.0, dimens.xml
**Files:** MapFragment.kt (moveCameraSmooth, smoothBearing), dimens.xml
**Why:** Пользователь просил плавность как Яндекс Навигатор

### [70] 2026-03-25 | feature | Track segmentation
**Before:** Трек рисовал прямую через весь город при паузе
**After:** NaN маркер при gap >200м + >30с, MultiLineString, GPX trkseg split
**Files:** TrackingService.kt, GpxParser.kt, MapFragment.kt
**Why:** При выходе из машины и переезде трек портился

### [73] 2026-03-25 | bugfix | NaN crash in trackPoints getter
**Before:** getter конвертировал NaN маркеры в LatLng(NaN,NaN) → MapLibre crash
**After:** getter фильтрует NaN, updateTrackOnMap работает с TrackingService.trackPoints напрямую
**Files:** MapFragment.kt:82
**Why:** Критический краш при записи трека с сегментами

### [74] 2026-03-25 | bugfix | GPS services stability
**Before:** START_NOT_STICKY, onTaskRemoved→stopTracking, WakeLock reference counted
**After:** START_STICKY + null intent resume, onTaskRemoved→checkpoint only, setReferenceCounted(false)
**Files:** TrackingService.kt, TraccarService.kt
**Why:** GPS пропадал через 30-70 мин, Samsung/Vivo убивали сервисы

### [75] 2026-03-25 | bugfix | Live monitoring HTTP 500
**Before:** server-monitor проксировал /api/live2/devices на 217.60.1.225:80 (nginx 404)
**After:** Использует getLive2Users() напрямую через Traccar API :8082
**Files:** /opt/server-monitor/server.js
**Why:** Устройства не видели друг друга на карте

| 77 | 2026-03-26 | feature | Sprint 1 офлайн-карт: полигон + оценка + слои | ConvexHull.kt, PolygonAreaPicker.kt, SizeEstimator.kt, LayerSelectorBottomSheet.kt |
| 78 | 2026-03-26 | decision | Офлайн карты: связка файлов + подменю слоёв | архитектурное решение |

### [77] 2026-03-26 | feature | Sprint 1 офлайн-карт
**Before:** Скачивание карт через 2 клика (прямоугольник), без выбора слоёв, без оценки
**After:** Полигон 3-8 точек (ConvexHull), BottomSheet с выбором base/overlays/zoom/имя, realtime оценка МБ, прогресс-плашка с отменой
**Files:** ConvexHull.kt, PolygonAreaPicker.kt, SizeEstimator.kt, LayerSelectorBottomSheet.kt, MapFragment.kt
**Why:** DEV-65 архитектура, аналог Locus Map/AlpineQuest

### [78] 2026-03-26 | decision | Офлайн: связка файлов (подход Б)
**Before:** Один файл на карту (без оверлеев), или мерж в один MBTiles
**After:** Раздельные файлы связанные по имени (Карта.mbtiles + Карта_слой_X.mbtiles), авто-подключение всех слоёв при выборе, подменю для вкл/выкл
**Files:** архитектурное решение, реализация в следующем спринте
**Why:** Гибкость (удалить/добавить слой отдельно), простота для пользователя (одна карта = всё включено)

### [79] 2026-03-27 | bugfix | Live markers deleted every 4s due to type mismatch
**Before:** Markers created but immediately removed — Set had number keys, Object.keys returned strings
**After:** String(id) conversion fixes matching — markers persist on map
**Files:** ui/index.html (liveProcessDevices, liveUpdateMarker)
**Why:** JavaScript Set.has("104") !== Set.has(104). Markers flashed into existence and got cleaned up same tick.

### [80] 2026-03-27 | feature | Race Report: track × route analysis tool
**Before:** No way to analyze race performance from GPS tracks
**After:** Full Race Report: segments table, speed/segment charts, timeline, map overlays, HTML export
**Files:** ui/index.html (+900 lines: rrMatchTrackToRoute, rrAnalyzeSlice, rrRenderCharts etc.)
**Why:** Core feature for trophy raid post-race analysis — shows where time was lost, stops, segment speeds

### [81] 2026-03-27 | decision | Windows download link restored on site
**Before:** Windows .exe download button hidden (style="display:none") since 2026-03-20, version showed v0.6.3, URLs pointed to GitHub Releases with old filenames
**After:** Button visible, version v0.8.2, URLs point to server /releases/ with current files (2.2MB exe, 77MB AppImage)
**Files:** /opt/trophy-desktop/index.html (DE2 server)
**Why:** Windows link was hidden until licensing was ready. Licensing now fully working (v0.8.2), so download restored for both platforms

| 82 | 2026-03-27 | bugfix | Quick rename не обновлял иконку | ui/index.html |
| 83 | 2026-03-27 | bugfix | Sync push: отсутствовала обёртка data | ui/index.html |
| 84 | 2026-03-27 | bugfix | Трек не переезжал при включении | ui/index.html |
| 85 | 2026-03-28 | feature | Tile cache IndexedDB LRU | ui/index.html |
| 86 | 2026-03-28 | feature | Offline maps in layer selector | ui/index.html |
| 87 | 2026-03-28 | decision | VPN relay 158.160.243.222 whitelists | YC/CF/Obsidian |
| 88 | 2026-03-28 | feature | Premium28 / Premium Max subscriptions | YC Function, CF Worker |
| 89 | 2026-03-28 | feature | VPN agent skill | vpn-agent/SKILL.md |

### [82] 2026-03-27 | bugfix | Quick rename не обновлял иконку на карте
**Before:** applyQuickRename() менял wpData.name но не вызывал refreshWaypoint() → маркер на карте показывал старое имя
**After:** Добавлен refreshWaypoint(marker) → иконка и tooltip обновляются мгновенно
**Files:** ui/index.html (applyQuickRename)
**Why:** Репорт от пользователя Pavel Mironov (Windows). refreshWaypoint вызывает setIcon(makeDivIcon) который рендерит имя

### [83] 2026-03-27 | bugfix | Sync push отправлял плоский state вместо {data: state}
**Before:** syncPush() отправлял JSON.stringify(state) — сервер ожидал req.body.data и возвращал 400 Missing data
**After:** Обернул в {data: state, deviceId, deviceType, timestamp} — сервер принимает корректно
**Files:** ui/index.html (syncPush), server.js (/api/sync/push)
**Why:** Репорт от Pavel Mironov. Несовпадение формата между клиентом и сервером

### [84] 2026-03-27 | bugfix | Трек не переезжал при включении видимости
**Before:** toggleTrackVisible() добавлял polyline на карту но не перемещал viewport
**After:** Добавлен fitBounds с padding и maxZoom при включении видимости
**Files:** ui/index.html (toggleTrackVisible)
**Why:** UX ожидание — при включении трека карта должна показать его

### [85] 2026-03-28 | feature | Tile cache IndexedDB LRU with prefetch
**Before:** Online tiles loaded from network every time, no caching
**After:** IndexedDB cache 1-10GB, LRU eviction, img→canvas→blob (CORS bypass), prefetch neighbors, stats UI
**Files:** ui/index.html (TileCache, CachedTileLayer, tab-cache)
**Why:** Speed up map loading, enable partial offline access for cached areas

### [86] 2026-03-28 | feature | Offline maps in layer selector
**Before:** Downloaded maps only toggleable in "My Maps" tab
**After:** Active offline maps appear in layer switcher as "📦 Скачанные карты" with opacity slider
**Files:** ui/index.html (updateOfflineLayersList, #offline-layers-section)
**Why:** UX — users expect downloaded maps in the same place as online maps

### [87] 2026-03-28 | decision | VPN relay IP 158.160.243.222 confirmed in whitelists
**Before:** Old relay 158.160.111.246 lost (preemptible VM IP changed)
**After:** New relay in zone ru-central1-d, static IP reserved, tested in field
**Files:** YC Function, CF Worker, Obsidian VPN notes
**Why:** Zone d gives 158.160.* IPs which work in mobile operator whitelists

### [88] 2026-03-28 | feature | VPN subscriptions Premium28 / Premium Max
**Before:** Single subscription type, generic name in apps
**After:** Premium28 (8 own servers) + Premium Max (own + ~110 whitelist), proper profile-title
**Files:** YC Function index.js, CF Worker worker.js
**Why:** Users need different profiles for mobile (relay) vs WiFi (all servers)

### [89] 2026-03-28 | feature | VPN agent skill created
**Before:** No structured VPN management knowledge
**After:** Skill vpn-agent with full infrastructure docs, workflows, server configs
**Files:** ~/.claude/skills/vpn-agent/SKILL.md
**Why:** Automate VPN management tasks — relay restart, IP rotation, config updates
