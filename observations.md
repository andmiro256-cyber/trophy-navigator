# Observations - trophy-navigator

## Index
| # | Date | Type | Summary | Files |
|---|------|------|---------|-------|
| 134 | 2026-05-22 | release | Desktop v0.9.17 released with offline, map and sync improvements | ui/index.html, src-tauri/*, sync-server/* |
| 133 | 2026-05-15 | ux/ops | Mac downloads highlighted on public site and desktop page | /opt/trophy-desktop/index.html, /opt/trophy-desktop/download.html |
| 132 | 2026-05-15 | release/ops | Desktop v0.9.16 released with Mac downloads hosted on trophynav.ru | ui/index.html, src-tauri/*, .github/workflows/build.yml, /opt/trophy-desktop |
| 131 | 2026-05-15 | bugfix/perf | Native streaming offline map downloader writes SQLite incrementally | ui/index.html, src-tauri/src/main.rs |
| 130 | 2026-05-15 | bug/discovery | Large offline map download OOMs before final SQLite file write | ui/index.html |
| 129 | 2026-05-15 | bugfix | Offline map disable now uses actual Leaflet layer state | ui/index.html |
| 128 | 2026-05-15 | bugfix/ops | Desktop v0.9.15 Linux looked like 0.9.14 because UI version was hardcoded | ui/index.html, src-tauri/src/main.rs, src-tauri/tauri.conf.json, ~/Applications/TrophyNavigator.AppImage |
| 127 | 2026-05-14 | release/ops | Desktop v0.9.15 released: offline layer list, WP rename sync, restore, Linux updater relaunch | ui/index.html, src-tauri/*, .github/workflows/build.yml, /opt/trophy-desktop |
| 126 | 2026-05-13 | release/ops | Desktop v0.9.14 released: track point hover, z17 markers, native offline map reader | ui/index.html, src-tauri/*, .github/workflows/build.yml, /opt/trophy-desktop |
| 125 | 2026-05-13 | bugfix/perf/ops | Track point hover + z17 markers + native offline map reader + tile proxy redirects | ui/index.html, src-tauri/src/main.rs, /opt/tnd-sync/server.js |
| 124 | 2026-05-13 | bugfix/perf | TND Desktop tile cache: race condition + double fetch fix + legacy cleanup | ui/index.html |
| 123 | 2026-05-13 | bugfix | tnd-sync rastart loop: убран mail вызов в crash-report | /opt/tnd-sync/server.js |
| 122 | 2026-05-13 | ops/bugfix | Desktop updater always serves stable channel; no desktop beta testers | /opt/tnd-sync/server.js, sync-server/server.js |
| 121 | 2026-05-13 | ops/bugfix | Desktop updater v0.9.13 download hang fixed by local update URLs | /var/www/updates/latest-desktop.json, .github/workflows/build.yml |
| 120 | 2026-05-12 | release/ops | Desktop v0.9.13 released: track perf, local maps, tile cache | ui/index.html, src-tauri/*, .github/workflows/build.yml, /opt/trophy-desktop |
| 119 | 2026-05-12 | bugfix/perf | Desktop track render, local offline-map import, and tile cache fixed locally | ui/index.html, src-tauri/src/main.rs, src-tauri/Cargo.toml, src-tauri/capabilities/default.json |
| 112 | 2026-04-27 | release/ops | Desktop v0.9.12 released: track cleanup, PLT fix, sync deletion fix | ui/index.html, sync-server/server.js, src-tauri/*, .github/workflows/build.yml, /opt/trophy-desktop |
| 111 | 2026-04-27 | bugfix/discovery | Cloud sync deletion semantics fixed and deployed | ui/index.html, sync-server/server.js, /opt/tnd-sync/server.js |
| 110 | 2026-04-27 | verification/bugfix | Broad desktop smoke for core data flows | ui/index.html, /tmp/trophy-track-smoke |
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
| 90 | 2026-04-03 | bugfix | yt-api disabled после переезда DE2 | systemd/yt-api.service |
| 91 | 2026-04-03 | feature | Charm Bot — AI userbot (Telethon) | /opt/charm-bot/bot.py |
| 92 | 2026-04-04 | feature | Charm Bot: фото/голос/профили/обучение | /opt/charm-bot/bot.py |
| 93 | 2026-04-20 | discovery | Desktop file-model audit: WPT/RTE/PLT/GPX смешаны, route props/file registry broken | ui/index.html |
| 94 | 2026-04-20 | feature | Desktop files/routes + self-share: multi-import, source registry, route props, self devices | ui/index.html, sync-server/server.js |
| 95 | 2026-04-20 | release | Desktop v0.9.9 hotfix: WPT radius fixed, route edit mode added, site/updater moved to 0.9.9 | ui/index.html, src-tauri/{Cargo.toml,Cargo.lock,tauri.conf.json}, /opt/trophy-desktop/{index,download}.html |
| 96 | 2026-04-20 | decision | Route semantics fixed: only via explicit points/KP or from a track, never “just on the map” | ui/index.html, project memory |
| 97 | 2026-04-20 | feature | Desktop UI readability pass: light/dark tokens, active windows, safer modal drag | ui/index.html |
| 98 | 2026-04-20 | feature | Desktop live/share simplified to GPX-only package semantics | ui/index.html |
| 99 | 2026-04-21 | bugfix | Light theme context menus now use real `#ctx-menu*` selectors and theme variables | ui/index.html |
| 100 | 2026-04-22 | ops | Local Linux AppImage updated to v0.9.10; clean launcher avoids Obsidian/Snap GIO env conflicts | ~/Applications/TrophyNavigator.AppImage, ~/.local/bin/trophy-navigator-desktop |
| 101 | 2026-04-22 | feature/ops | Waypoint external map links added; Android site fallback/changelog refreshed | ui/index.html, /opt/trophy-desktop/{index,android}.html, /var/www/updates/changelog.json |
| 102 | 2026-04-23 | feature | Waypoint map links open in app WebView window instead of browser/iframe | ui/index.html, src-tauri/src/main.rs |
| 103 | 2026-04-23 | decision | Дизайн-рефреш trophynav.ru: палитра trophy-orange, social proof, 3-tier pricing, globe hero вместо фото | workspace/trophynav-design-review.md |
| 104 | 2026-04-23 | feature | Hero globe animation (cobe.js) с точками трофи-локаций и arcs-маршрутами — в работе у Тима+Джема | workspace/trophynav-globe-concept.md, ui/index.html |
| 105 | 2026-04-23 | bugfix/feature | Ruler toggles off and can be saved as a track | ui/index.html |
| 106 | 2026-04-23 | feature | Waypoint map actions added to context menu and point list | ui/index.html |
| 107 | 2026-04-23 | bugfix | AppImage now rebuilds embedded frontend when UI changes; map context menu also has map actions | `ui/index.html`, `src-tauri/build.rs` |
| 108 | 2026-04-23 | release | Desktop v0.9.11 released: map/panorama viewer, quick map actions, ruler-to-track, frontend watch | `ui/index.html`, `src-tauri/*`, `.github/workflows/build.yml`, `/opt/trophy-desktop` |
| 109 | 2026-04-27 | bugfix/feature | Selective data deletion + Ozi PLT export fixed | ui/index.html |
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

### [134] 2026-05-22 | release | Desktop v0.9.17: core engine optimizations and offline map sync fixes
**Before:** Desktop was at `v0.9.16`. Discovered several core engine and offline synchronization issues, including Yandex Sat EPSG:3395 projection offset on Leaflet, non-atomic session saves leading to potential file corruption, single-threaded tile downloader limitations, tile proxy redirect failures in sync-server for `waymarkedtrails_*` sources, and live poll connection leakage on abort.
**After:** Desktop bumped to `v0.9.17`. Fully implemented EPSG:3395 projection/shift handling in Javascript Leaflet, transitioned session saving to atomic `.tmp`-file replacement logic `save_state_atomic`, established 8-thread tile downloader pool, integrated `sharp` on-the-fly reprojection in `sync-server` along with follow-redirect (up to 3 hops) tile proxy logic, and deployed cross-platform `AbortController` live poll cleanup.
**Files:** `ui/index.html`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, `sync-server/server.js`, `sync-server/package.json`, `sync-server/package-lock.json`
**Why:** Critical release stabilizing core map display, synchronizations, and app reliability under multi-device field usage.

### [133] 2026-05-15 | ux/ops | Mac downloads highlighted on public site and desktop page
**Before:** The public site had direct Mac DMG links, but the first pass made Mac look like the only featured platform and left Windows/Linux visually secondary.
**After:** The main page Desktop card and `/desktop.html` now use a balanced platform grid: Mac Apple Silicon, Mac Intel, Windows and Linux are equal download cards. Mac still has a small `new` badge, but Windows/Linux are no longer pushed into a lesser section. All primary download buttons use local `trophynav.ru/releases/` URLs, not GitHub.
**Verification:** Public `/` and `/desktop.html` contain the balanced platform grid and local links; Windows/Linux/macOS URLs return `200 OK`, `application/octet-stream`, and `Accept-Ranges`. Headless desktop/mobile screenshots were checked for obvious layout issues.
**Files:** DE2 `/opt/trophy-desktop/index.html`, `/opt/trophy-desktop/download.html`.
**Why:** The public announcement should point users to our own site, and new Mac support should be visible without making existing Windows/Linux users feel deprioritized.

### [132] 2026-05-15 | release/ops | Desktop v0.9.16 released with Mac downloads hosted on trophynav.ru
**Before:** Fixes for Linux startup, visible version labels, offline-map disable state and native streaming offline-map downloads were local/pushed, but the release had been interrupted while waiting for CI. The public site still showed `0.9.15`, and macOS DMG artifacts existed only in GitHub Release.
**After:** Confirmed `main` and tag `v0.9.16` at commit `ca8198d`; GitHub Actions run `25919922524` completed successfully for Linux, Windows, macOS arm64, macOS x64 and release. GitHub Release `v0.9.16` contains Windows, Linux and macOS assets. DE2 `/opt/trophy-desktop/releases/` now hosts Windows setup, Linux AppImage, Apple Silicon DMG and Intel DMG under local `/releases/trophy-navigator-desktop_0.9.16_*` URLs. `/opt/trophy-desktop/index.html` and `download.html` now show `v0.9.16` and include direct Mac download buttons from `trophynav.ru`.
**Verification:** Public updater manifest returns `0.9.16`; public `/` and `/desktop.html` link to `0.9.16`; Windows/Linux/macOS local release URLs return `200 OK`, `application/octet-stream` and `Accept-Ranges`; SHA-256 of hosted files matches GitHub Release asset digests.
**Files:** `ui/index.html`, `src-tauri/*`, `.github/workflows/build.yml`, DE2 `/opt/trophy-desktop/{index.html,download.html,releases/}`.
**Why:** The release is not finished until the app updater, GitHub Release, local download files and public site all agree. For public announcements, use `https://trophynav.ru/desktop.html` and local `trophynav.ru/releases/...dmg` links instead of GitHub links.

### [131] 2026-05-15 | bugfix/perf | Native streaming offline map downloader writes SQLite incrementally
**Before:** Large Desktop offline-map downloads used `sql.js` in WebKit, accumulated the whole SQLite DB in memory, then exported/wrote the file only at the end. A ~800MB expected map could push WebKit to ~9GB RSS, get OOM-killed, and leave no recoverable file.
**After:** Added native Tauri commands `download_offline_map` and `cancel_offline_map_download`. For one base layer without second-layer/overlay merging, the UI now sends tile ranges/source template to Rust. Rust downloads tiles with `ureq`, filters polygon tiles natively, and writes RMaps/OsmAnd-compatible `tiles(x,y,z,s,image)` SQLite rows in committed batches, emitting progress events. Stop/cancel asks Rust to finish the current batch and return a partial saved DB. The old JS/sql.js path remains for merged layer downloads.
**Verification:** `cargo fmt --check`, `cargo check`, inline JS syntax check, and `git diff --check -- src-tauri/src/main.rs ui/index.html` passed. `cargo tauri build` created local `.deb`, `.rpm`, and `.AppImage` artifacts, then exited at updater signing because local `TAURI_SIGNING_PRIVATE_KEY` was not set; the generated AppImage exists under `src-tauri/target/release/bundle/appimage/` and `~/Applications/TrophyNavigator.AppImage` was not replaced.
**Files:** `src-tauri/src/main.rs`, `ui/index.html`.
**Why:** Offline-map downloads must be crash-tolerant and memory-bounded; the file should exist on disk during the download instead of only after a full in-memory export.

### [130] 2026-05-15 | bug/discovery | Large offline map download OOMs before final SQLite write
**Before:** Andre downloaded an offline map expected to be ~800MB; the app closed, and after restart the map was not in the offline list.
**Finding:** No new `.sqlitedb/.mbtiles/.rmap/.sqlite` file over 100MB exists in `~/Документы/TrophyNavigator/maps`, `/tmp`, Downloads, or the recent home search. The configured last save directory was `~/Документы/TrophyNavigator/maps`. System logs show that at `2026-05-15 12:52:22` the kernel OOM-killer killed `WebKitWebProcess` inside the Trophy Navigator app scope; the killed process had `anon-rss` about `9.4GB`. The app was launched again at `12:55:01`.
**Root cause:** Current `downloadTiles()` uses sql.js in the WebKit process, stores the whole SQLite DB in memory, then calls `db.export()` and `writeFile()` only at the end. If memory is exhausted before final export/write, there is no partial offline map file to list or recover.
**Verification:** Standard maps folder currently contains only `OpenTopoMap+1ов_z9-17.sqlitedb` (8.8MB) and `ГГЦ_500м+Магнум_z7-14.sqlitedb` (45MB); no 800MB map file was found.
**Next fix:** Move large tile downloading to native Rust with streaming SQLite writes/checkpointing, or at least block/split large jobs until the native path exists.
**Files:** `ui/index.html`.

### [129] 2026-05-15 | bugfix | Offline map disable now uses actual Leaflet layer state
**Before:** In Desktop, downloaded/offline maps could be enabled from both `Офлайн карты → Мои карты` and the `Скачанные карты` section in the layer selector. The UI kept a separate `entry.active` flag that could drift from the real Leaflet state after rescans or switching from the other list, so a card could show/treat an active map as inactive and fail to turn it off.
**After:** Added `isOfflineMapActive()` based on `entry.layer && map.hasLayer(entry.layer)` and routed card/list state through helpers `updateOfflineMapCardState()` and `deactivateOfflineMap()`. The list is cleared when no offline maps exist, and enabling/disabling from one UI surface updates the other.
**Verification:** Inline JS syntax check, `git diff --check`, and `cargo check` passed. A signed AppImage with the fix was built under `src-tauri/target/release/bundle/appimage/`, but it was not copied into `~/Applications` because Andre was downloading a map and asked not to touch the running app.
**Files:** `ui/index.html`.
**Why:** Offline maps are implemented as overlay tile layers on top of the current online base layer; UI state must follow actual layer membership on the map, not an independent flag.

### [128] 2026-05-15 | bugfix/ops | Linux AppImage displayed stale 0.9.14
**Before:** Andre reported that Linux still showed `0.9.14` after updating to the latest version. The local `/home/andre22/Applications/TrophyNavigator.AppImage` had already been replaced at 12:05 and matched the public DE2 `0.9.15` AppImage by SHA/size, but the embedded UI still contained hardcoded `v0.9.14` strings in the HTML title, footer, About modal, and Tauri window config.
**After:** Added native `get_app_version` Tauri command returning `CARGO_PKG_VERSION`, registered it in `main.rs`, and changed the UI to refresh displayed version/title/footer/About from that command. The update-check UI now compares against this app version instead of the stale About text. Rebuilt a signed local Linux AppImage and replaced `~/Applications/TrophyNavigator.AppImage`; previous local file is backed up as `TrophyNavigator.AppImage.bak-ui-version-20260515_121945`.
**Verification:** `cargo fmt --check`, `cargo check`, inline JS syntax check, and `git diff --check` passed. `strings` on the new local AppImage no longer finds `0.9.14`; the currently running old process must be closed and launched again to load the replaced file.
**Files:** `ui/index.html`, `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`, `~/Applications/TrophyNavigator.AppImage`.
**Why:** The updater had not failed at this point; the visible version label was stale because it was not tied to the package version. Future releases should avoid manual UI version labels and source visible version from Tauri/Cargo.

### [127] 2026-05-14 | release/ops | Desktop v0.9.15 released
**Before:** Fixes from local field testing after `v0.9.14` were not yet available through the public desktop updater: discovered offline maps needed to appear in the main layer list; tile downloads had to respect server catalog `maxzoom` while display overzoomed to z22; quick WP rename needed to reopen and sync route/OSRM labels; restored sessions could miss refreshed track/route lists; Linux updater needed an explicit relaunch path; track point hover popup needed the track name.
**After:** Bumped Desktop to `0.9.15`, committed `5682de5 release: desktop v0.9.15`, pushed `main` and tag `v0.9.15`. GitHub Actions runs `25851302153` (tag) and `25851302258` (main) completed successfully; GitHub Release `v0.9.15` contains Windows NSIS/MSI, Linux AppImage, and `latest-desktop.json`. Tom gave QA sign-off through Agent Bus `#171`. DE2 public downloads were refreshed as `/opt/trophy-desktop/releases/trophy-navigator-desktop_0.9.15_x64-setup.exe` and `..._amd64.AppImage`; `/opt/trophy-desktop/index.html` and `download.html` now point to v0.9.15.
**Verification:** `node` syntax check for `ui/index.html`, `cargo fmt --check`, targeted `git diff --check`, `cargo check`, and signed local `cargo tauri build` passed. Public checks passed: updater manifest returns `0.9.15` with local Linux/Windows URLs, GitHub Release assets exist, site pages show `v0.9.15`, both local release files return `200 OK` with `application/octet-stream`, `Accept-Ranges: bytes`, and a 1024-byte range request succeeds.
**Follow-up:** Andre hit Linux updater `signature failed`. Root cause was a race between the simultaneous `main` and `tag` GitHub Actions runs: the server manifest signature did not match the actual AppImage served from `/releases`. Fixed on DE2 by re-signing the actual public `trophy-navigator-desktop_0.9.15_{amd64.AppImage,x64-setup.exe}` files with the Tauri signing key and replacing `/var/www/updates/latest-desktop.json` after backups `latest-desktop.json.bak.sigfix*`; `/api/updates/latest.json` is `Cache-Control: no-store` and now carries the corrected signatures.
**Files:** `ui/index.html`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, `.github/workflows/build.yml`, DE2 `/opt/trophy-desktop/{index.html,download.html,releases/}`.
**Why:** Andre explicitly asked to update users and make Linux update available; desktop updater requires the signed manifest, GitHub Release assets, and DE2 local binary URLs/site links to be aligned.

### [126] 2026-05-13 | release/ops | Desktop v0.9.14 released
**Before:** Fixes from [125] were local/server-only: Desktop public channel still served `0.9.13`, while Andre needed the track-point hover fix, z17 marker threshold, faster multi-track UI, and native external/offline map loading delivered to all desktop users.
**After:** Bumped Desktop to `0.9.14`, committed `8ba38db release: desktop v0.9.14`, and pushed `main`. GitHub Actions run `25820551396` completed successfully for `build-linux`, `build-windows`, and `release`; GitHub Release/tag `v0.9.14` contains Windows exe/MSI, Linux AppImage, and `latest-desktop.json`. Tom gave QA sign-off through Agent Bus `#170`. DE2 public downloads were refreshed as `/opt/trophy-desktop/releases/trophy-navigator-desktop_0.9.14_x64-setup.exe` and `/opt/trophy-desktop/releases/trophy-navigator-desktop_0.9.14_amd64.AppImage`; `/opt/trophy-desktop/index.html` and `download.html` now point to v0.9.14.
**Verification:** `node` syntax check for the main `ui/index.html` script, `cargo fmt --check`, `cargo check`, and `git diff --check` passed. Local `cargo tauri build` produced release bundles up to the signing step and failed only because `TAURI_SIGNING_PRIVATE_KEY` is absent locally; CI signed and published successfully. Public checks passed: updater manifest version `0.9.14` with local Linux/Windows URLs, `https://trophynav.ru/` shows `v0.9.14`, `https://trophynav.ru/desktop.html` shows `v0.9.14`, both local release files return `200 OK`.
**Files:** `ui/index.html`, `src-tauri/src/main.rs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, `.github/workflows/build.yml`, DE2 `/opt/trophy-desktop/{index.html,download.html,releases/}`.
**Why:** Desktop updater and public downloads require the GitHub Release, signed updater manifest, and DE2 local artifacts to move together; otherwise users see an update that cannot download or a site link that points to a missing file.

### [125] 2026-05-13 | bugfix/perf/ops | Track point hover + z17 markers + native offline map reader + tile proxy redirects
**Before:** Andre сообщил, что при наведении/клике на точку трека больше не показывается информация о точке — вместо этого открывался список треков. Также нужны точки только с zoom 17, интерфейс тормозит на нескольких треках, а офлайн-карты работают неполноценно: скачанные приложением и пользовательские файлы из других источников нельзя нормально подключать как локальные карты без копирования/чтения всего файла. При проверке сервера карт отдельная проблема: `waymarkedtrails_*` в каталоге вели на `http://tile.waymarkedtrails.org/...`, апстрим отдавал `301`, а `/tiles/:id/:z/:x/:y` возвращал этот redirect вместо картинки.
**After:** В `ui/index.html` добавлен отдельный canvas renderer для точек трека, отключено всплытие событий от точек, click по точке теперь показывает tooltip, polyline hover ищет ближайшую точку и показывает `formatTrackPointTooltip()`. Детальные точки для больших/суммарно тяжёлых треков показываются с `TRACK_MARKER_DETAIL_ZOOM = 17`, маркеры переиспользуются через `track.markerMap` и обновляются по viewport через `requestAnimationFrame`. Офлайн-карты: добавлен реестр внешних путей в localStorage, кнопка "Подключить файл" регистрирует `.sqlitedb/.mbtiles/.rmap/.db/.sqlite` без копирования, "Скопировать в папку" оставляет старый сценарий, скачанные через приложение файлы автоматически регистрируются после сохранения. В `src-tauri/src/main.rs` добавлены команды `inspect_offline_map` и `read_offline_tile` на `rusqlite`: поддержаны MBTiles и RMaps/SQLite `tiles(x,y,z,image)`, RMaps inverted zoom определяется trend-анализом как в Android `TileServer`, тайлы читаются по одному вместо полной загрузки файла в память. На DE2 точечно задеплоен серверный follow-redirect для `/tiles/*` с бэкапом `/opt/tnd-sync/server.js.bak.20260513_214037`, без заливки локального `sync-server/server.js` целиком.
**Verification:** `node` syntax check основного script в `ui/index.html`, `cargo fmt --check`, `cargo check`, `git diff --check`, `node --check sync-server/server.js`. Публично проверено: `https://trophynav.ru/tiles/waymarkedtrails_hiking/12/2476/1280` и `waymarkedtrails_mtb` теперь `200 OK` `image/png`; `esri_sat` остаётся `200 OK` `image/jpeg`; `pm2 status tnd-sync` online после рестарта.
**Status:** Локальные desktop-правки не закоммичены и не релизились; в `ui/index.html` остаётся Opus tile-cache diff #124, ожидающий ревью Тома. Серверный redirect fix уже в проде DE2.
**Files:** `ui/index.html`, `src-tauri/src/main.rs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `/opt/tnd-sync/server.js`, локально `sync-server/server.js` содержит только рабочий аналог redirect patch поверх уже грязного файла.
**Why:** Производительность упиралась не только в число треков, а в количество DOM/SVG marker-слоёв и полное пересоздание точек при движении карты; офлайн-карты требовали native tile-serving вместо sql.js/readFile для больших файлов. Серверная проблема WayMarked была отдельным redirect edge-case на прокси, не общим падением `tnd-sync`.

### [124] 2026-05-13 | bugfix/perf | TND Desktop tile cache: race condition + double fetch fix + legacy cleanup
**Before:** Andre сообщил о тормозах карт в десктопе. Анализ кэша (IndexedDB `tnd-tile-cache`, 14478 записей, 26 МБ через прямое чтение SQLite на остановленном приложении) выявил:
  (1) **race condition**: `TileCache.open()` запускается без `await` (3810), а `createTile` (3878) при `!TileCache.db` уходит в fastpath `tile.src=url` БЕЗ записи в кэш. Первые ~10-50 тайлов после старта приложения теряются мимо кэша каждый запуск.
  (2) **двойная загрузка при miss**: при cache miss тайл качается через `img.src=url` (для Leaflet рендера), а потом отдельно через `fetch_tile_bytes` (Tauri native) для записи blob. Удвоенный трафик при панорамировании по новой области.
  (3) **7915 мёртвых записей** в кэше — старые тайлы через прокси `87.120.84.254:9222` (был proxy-каталог в прошлых версиях), сейчас Desktop ходит к источникам напрямую. ~13 МБ балласта, давит на LRU eviction.
  Гипотеза subdomain-дубликатов НЕ подтвердилась: Leaflet выбирает subdomain детерминированно (`Math.abs(x+y) % subdomains.length`), 0 дубликатов в живой БД.
**After:** В `ui/index.html`: (a) `TileCache.open()` теперь идемпотентен, сохраняет Promise в `_opening`. (b) `createTile` всегда дожидается `TileCache.open().then(...)`. (c) cache miss делает **один** вызов `fetchTileBlobForCache(url)` — рендерит из blob и пишет в кэш из того же blob. (d) Добавлен `_cleanupLegacyProxy()` — one-time миграция (флаг `tnd-cache-legacy-cleanup-v1` в localStorage), которая при первом запуске собранной версии удалит записи с URL содержащим `87.120.84.254` через IndexedDB API (без orphaned blob-файлов в `BlobFiles`). (e) `directLoad()` fallback на любой ошибке open/get/fetch.
**Verification:** JS syntax check через `new Function()` прошёл. Diff: +86/-35 строк. Том получил два handoff'а: #168 (основной diff) + #169 (addendum про миграцию).
**Status:** Awaiting Tom review. После GO — пересборка AppImage и тест Andre.
**Files:** `ui/index.html`
**Why:** Тормоза карт реальны и связаны с сетевыми запросами тайлов; сервер карт (tnd-sync) оказался здоров. Десктоп ходит за тайлами напрямую к источникам, и кэш IndexedDB должен это компенсировать — но имел три проблемы, мешавшие ему быть эффективным. Анализ через прямое SQLite чтение `IndexedDB.sqlite3` (Tauri WebKit на Linux) намного эффективнее, чем добавление UI-индикаторов: 5 минут вместо пересборки приложения.

### [123] 2026-05-13 | bugfix | tnd-sync restart loop: убран mail вызов в crash-report
**Before:** При диагностике производительности карт обнаружен цикл рестартов `pm2 tnd-sync` (↺=7 за 16 минут на проде DE2). В error.log массово сыпалось `Crash email failed: /bin/sh: 1: mail: not found` — handler `POST /api/crash-report` пытался отправить email через `execSync('echo … | mail -s …')`, но бинаря `mail` в системе нет. Хотя вызов был в try/catch, восстановление шумело логом и каждый Android-краш создавал мусор.
**After:** В `/opt/tnd-sync/server.js` блок `try { execSync(... | mail ...) } catch` удалён из обработчика `/api/crash-report`. Краши продолжают писаться в `data/crash-reports.log` (это и было основной целью). `pm2 restart tnd-sync` → uptime растёт, новых `mail: not found` после фикса нет, healthcheck (каталог, прокси-тайл, updater) — все 200 OK.
**Verification:** Тест `POST /api/crash-report` вернул `{"ok":true}`, запись появилась в `crash-reports.log`. Через 3 минуты после рестарта счётчик ↺ стабилен (8 — наш ручной restart), сервер не падает. Бэкап: `/opt/tnd-sync/server.js.before-mail-fix-20260513-010251`.
**Files:** `/opt/tnd-sync/server.js`
**Why:** Производительность карт в десктопе спрашивалась пользователем. Сервер карт оказался не виноват (десктоп ходит за тайлами напрямую к источникам), но во время диагностики обнаружен отдельный баг — цикл рестартов от вызова отсутствующей утилиты `mail`. Локальный `sync-server/server.js` НЕ трогался: там идёт незаконченная фича re-projection Яндекса (`/tiles-wgs/`), которую надо деплоить отдельным шагом.

### [122] 2026-05-13 | ops/bugfix | Desktop updater always serves stable channel; no desktop beta testers
**Before:** `/api/updates/latest.json` used recent device/license tracking to send tester emails to `/var/www/updates/latest-desktop-beta.json`. Desktop has no beta channel, and that stale beta manifest still contained `0.9.4`, so a Linux device mapped to tester/beta did not see `0.9.13` as an available update.
**After:** DE2 `/opt/tnd-sync/server.js` was backed up and patched so Desktop updater endpoint always serves `/var/www/updates/latest-desktop.json` with `channel=stable`. `pm2 restart tnd-sync --update-env` completed and the same device that logged `channel=beta` now logs `channel=stable`. Repo commit `3b39b7a` stores the same route change without staging unrelated pre-existing `sync-server/server.js` edits.
**Verification:** `https://trophynav.ru/api/updates/latest.json` returns version `0.9.13` and local Linux AppImage URL. PM2 status for `tnd-sync` is online. Logs show `HW-A860EC28F4591F42 channel=stable` after restart.
**Files:** `/opt/tnd-sync/server.js`, `sync-server/server.js`, `/var/www/updates/latest-desktop.json`
**Why:** Desktop release checklist states there is no desktop beta channel; keeping a beta branch in updater routing creates stale-version failures for tester-marked devices.

### [121] 2026-05-13 | ops/bugfix | Desktop updater v0.9.13 download hang fixed by local update URLs
**Before:** Desktop saw v0.9.13 in updater manifest and offered the update, but download could hang because the manifest pointed at GitHub Release assets, which require redirects to temporary release-assets URLs.
**After:** DE2 `/var/www/updates/latest-desktop.json` was backed up and patched to use local public files: `https://trophynav.ru/releases/trophy-navigator-desktop_0.9.13_x64-setup.exe` and `https://trophynav.ru/releases/trophy-navigator-desktop_0.9.13_amd64.AppImage`. The signatures were kept unchanged because the file bytes are the same. `.github/workflows/build.yml` now generates future desktop updater manifests with local `trophynav.ru/releases` URLs instead of GitHub URLs; committed as `55334d5`.
**Verification:** `https://trophynav.ru/api/updates/latest.json` returns `0.9.13` with local URLs. Both release files return `200 OK`, `Accept-Ranges: bytes`, and `curl --range 0-1023` succeeds for Windows exe and Linux AppImage.
**Files:** `/var/www/updates/latest-desktop.json`, `.github/workflows/build.yml`
**Why:** The desktop updater should download from the project domain with stable direct URLs, not from GitHub redirect URLs that can stall in the embedded updater/network path.

### [120] 2026-05-12 | release/ops | Desktop v0.9.13 released
**Before:** Fixes from [119] were local only; public updater and DE2 download pages still served Desktop `v0.9.12`.
**After:** Bumped Desktop to `0.9.13`, committed `da8ea08`, pushed `main` and tag `v0.9.13`. GitHub Actions tag-run `25760665164` completed successfully for `build-linux`, `build-windows`, and `release`; GitHub Release contains Windows exe/MSI, Linux AppImage, and `latest-desktop.json`. Updater manifest `https://trophynav.ru/api/updates/latest.json` returns `0.9.13` with Linux/Windows signatures and GitHub asset URLs. DE2 public downloads were refreshed as `/opt/trophy-desktop/releases/trophy-navigator-desktop_0.9.13_x64-setup.exe` and `..._amd64.AppImage`; `/opt/trophy-desktop/index.html` and `download.html` now point to v0.9.13.
**Verification:** `node --check /tmp/tnd-ui-check.js`, `cargo check`, `cargo fmt --check`, and targeted `git diff --check` for release files are green. Full `git diff --check` is still blocked by pre-existing unrelated whitespace in repo-root `observations.md:42`. Local `cargo tauri build` reached release compile and produced deb/rpm, but AppImage bundling hung on local `appimagetool`; CI built and signed the AppImage successfully. Public checks passed: updater manifest version `0.9.13`, `https://trophynav.ru/` shows `v0.9.13`, `https://trophynav.ru/desktop.html` shows `v0.9.13`, both local release files return `200 OK`.
**Files:** `ui/index.html`, `src-tauri/{Cargo.toml,Cargo.lock,tauri.conf.json,src/main.rs,capabilities/default.json,gen/schemas/capabilities.json}`, `.github/workflows/build.yml`, `/opt/trophy-desktop/{index.html,download.html,releases/}`
**Why:** Desktop users need these fixes through updater and public downloads, not only as a local patch. The release also keeps GitHub Release notes, updater notes, and DE2 website links aligned.

### [119] 2026-05-12 | bugfix/perf | Desktop track render, local offline-map import, and tile cache fixed locally
**Before:** В Desktop `v0.9.12` три загруженных больших трека могли заметно тормозить UI, потому что каждый трек создавал `circleMarker` + tooltip на каждую точку сразу. Вкладка `Офлайн карты → Загрузить файл` выглядела как dropzone, но клик только показывал toast, drag/drop не был подключён, а standard MBTiles schema фактически не читался. Тайловый cache показывал сетевые тайлы, но сохранение через `img → canvas → blob` часто не работало из-за CORS/tainted canvas.
**After:** Трековые линии переведены на canvas renderer; большие треки (>600 точек) показывают точки с `z15` и только внутри текущего viewport. Офлайн-карты можно выбрать диалогом или перетащить `.sqlitedb/.mbtiles/.rmap`; файлы копируются в `Documents/TrophyNavigator/maps`, поддержаны RMaps/Locus и standard MBTiles. Для тайлового кэша добавлен Tauri command `fetch_tile_bytes`, который сохраняет байты через native HTTP fallback и не зависит от canvas CORS.
**Verification:** `node --check /tmp/tnd-ui-check.js`, `cargo check`, `git diff --check` зелёные. `cargo tauri build --bundles appimage` прошёл release-компиляцию, но завис на `appimagetool/linuxdeploy` и был остановлен; GUI smoke не запускался, релиз/деплой не выполнялся.
**Files:** `ui/index.html`, `src-tauri/src/main.rs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/capabilities/default.json`, `src-tauri/gen/schemas/capabilities.json`
**Why:** Desktop должен рендерить большие треки как лёгкие линии с детализацией по зуму, импортировать локальные карты реальным выбором файла и хранить в cache реальные байты тайлов, а не зависеть от canvas extraction с внешних источников.

### [112] 2026-04-27 | release/ops | Desktop v0.9.12 released
**Before:** Desktop `v0.9.11` не имел публичного удаления отдельного трека из списка/ПКМ, корзина удаляла всё сразу, OziExplorer PLT мог давать разлёт точек, а prod sync resurrected deleted objects.
**After:** Выпущен `v0.9.12`: commit `5a86b35`, tag `v0.9.12`, GitHub Actions run `25007401060` green. Tom/Shtab `DEV-243` дал GO. DE2 `/opt/tnd-sync/server.js` обновлён с бэкапом и `pm2 restart tnd-sync`; prod smoke `node /tmp/trophy-track-smoke/prod-sync-smoke.js` стал `deletionWorks:true`. Updater manifest `https://trophynav.ru/api/updates/latest.json` отдаёт `0.9.12`; `/` и `/desktop.html` обновлены; `/releases/trophy-navigator-desktop_0.9.12_{x64-setup.exe,amd64.AppImage}` отдают `200 OK`. Локальный `~/Applications/TrophyNavigator.AppImage` заменён на `0.9.12`.
**Files:** `ui/index.html`, `sync-server/server.js`, `src-tauri/{Cargo.toml,Cargo.lock,tauri.conf.json}`, `.github/workflows/build.yml`, `/opt/tnd-sync/server.js`, `/opt/trophy-desktop/{index.html,download.html,releases/}`
**Why:** Релиз закрывает пользовательский запрос по удалению треков/частичной очистке, исправляет PLT compatibility и доводит cloud deletion semantics до prod.

### [111] 2026-04-27 | bugfix/discovery | Cloud sync deletion semantics fixed and deployed
**Before:** Prod `/api/sync/push` принимал данные и `pull/status` работали, но server-side merge был append/update-only: отсутствующие в новом push элементы не удалялись. После удаления трека/точки/маршрута/GPX в desktop следующий pull мог вернуть старый объект из облака.
**After:** Prod-smoke на синтетическом email подтвердил баг: после второго push с 1 точкой/1 треком/0 routes/0 GPX сервер всё равно вернул 2 точки/2 трека/1 route/1 GPX. Локально исправлено: `buildSyncPayload()` помечает выбранные типы `replace:true`; `sync-server/server.js` считает входящие full docs with `items[]`/`replace:true` authoritative snapshot, stamps `syncedAt` и заменяет список, так что deletion propagates. Локальный smoke `SYNC_BASE=http://127.0.0.1:19324 node /tmp/trophy-track-smoke/prod-sync-smoke.js` стал `deletionWorks:true`. Клиентский `node /tmp/trophy-track-smoke/sync-ui-smoke.js` зелёный.
**Files:** `ui/index.html`, `sync-server/server.js`, `/tmp/trophy-track-smoke/{prod-sync-smoke.js,sync-ui-smoke.js}`
**Why:** Новая выборочная очистка/удаление треков должна синхронизироваться в облако как удаление, а не приводить к воскрешению старых объектов.
**Deploy:** Tom/Shtab `DEV-243` дал GO после повторного review. DE2 `/opt/tnd-sync/server.js` обновлён с бэкапом, `pm2 restart tnd-sync`, публичный `/api/ping` OK, prod smoke `deletionWorks:true`.

### [110] 2026-04-27 | verification/bugfix | Broad desktop smoke for core data flows
**Before:** После трекового smoke были покрыты PLT/TRK сценарии, но точки, маршруты, state restore, combined GPX, линейка и выборочная корзина по нетрековым объектам ещё не были проверены тем же уровнем.
**After:** `node /tmp/trophy-track-smoke/general-smoke.js` прошёл 45 проверок: waypoint sets/table/bulk edit/delete/WPT+GPX export-import, routes draw/edit/reorder/delete/RTE+GPX export-import, combined GPX import, state collect/apply/localStorage restore, clear dialog для waypoints/routes/GPX/source registry, ruler→track, modals, layer switch. Найден и исправлен мелкий баг: `saveRulerAsTrack()` создавал track с `source:'ruler'`, но сразу вызывал `touchTrack()`, который перетирал source на `desktop`; лишний вызов убран.
**Additional check:** `node /tmp/trophy-track-smoke/create-edit-smoke.js` прошёл создание/корректировку: waypoint properties modal меняет имя/описание/цвет/радиус/иконку/координаты; `startNewTrack`/finish, continuation cancel/finish, track edit cancel/insert/delete/finish; `startNewRoute`/finish, route edit cancel/finish, route props и КП label/radius correction.
**Files:** `ui/index.html`, `/tmp/trophy-track-smoke/general-smoke.js`
**Why:** Перед релизом desktop-изменений по данным нужен быстрый воспроизводимый smoke не только по трекам, но и по соседним пользовательским workflow.

### [109] 2026-04-27 | bugfix/feature | Selective data deletion + Ozi PLT export fixed
**Before:** Корзина в toolbar удаляла всё сразу без выбора, а отдельный трек можно было удалить только через выбранную панель свойств. PLT export писал несколько Ozi track-секций в один `.plt`; сторонние парсеры могли принять повторные header/count строки за координаты, из-за чего точки “разлетались” по миру.
**After:** В списке треков добавлена явная кнопка `✕`, а в контекстном меню трека на карте — пункт удаления всего трека. Диалог корзины теперь показывает чеклист загруженных данных: наборы точек, отдельные треки, маршруты, GPX-пакеты и реестр исходных файлов; можно удалить всё или только выбранные элементы. `loadedSourceFiles` получил `entityIds`, чтобы новые импортированные источники очищались вместе со своими объектами. `saveTracksPLT()` теперь пишет валидный single-section OziExplorer Track Point File: один header, общий счётчик точек, координаты `lat,lon` с 8 знаками и break-флаг между треками; высота/время сохраняются в Ozi-полях, импорт PLT читает их обратно.
**Verification:** `node /tmp/trophy-track-smoke/track-smoke.js` прошёл 30 проверок: создание/список/свойства/видимость/разворот/продолжение/редактирование точек, удаление по одному и из контекстного меню, выборочная корзина, PLT export/import roundtrip, старый multi-section PLT без разлёта координат, GPX import и очистка реестра источников.
**Files:** `ui/index.html`
**Why:** Пользователю нужен безопасный частичный cleanup перед гонкой/подготовкой маршрута, а `.plt` должен быть совместим с обычными Ozi-парсерами, которые не понимают несколько track headers внутри одного файла.

### [108] 2026-04-23 | release | Desktop v0.9.11 released
**Before:** Быстрые карты/панорамы, toggle линейки и ruler-to-track уже были готовы локально, но публичный desktop-релиз оставался `v0.9.10`, а витрина DE2 ссылалась на старые `0.9.10` файлы.
**After:** Выпущен `v0.9.11`: commit `4bb1c24`, tag `v0.9.11`, GitHub Actions run `24807395117` green. Updater manifest `https://trophynav.ru/api/updates/latest.json` отдаёт `0.9.11` с release notes; GitHub Release содержит Windows/Linux артефакты. На DE2 скачаны локальные `/opt/trophy-desktop/releases/trophy-navigator-desktop_0.9.11_x64-setup.exe` и `..._amd64.AppImage`, обновлены `index.html`/`download.html`, публичные `curl -sI` дают `200 OK`. Локальный `~/Applications/TrophyNavigator.AppImage` заменён на `0.9.11`.
**Files:** `ui/index.html`, `src-tauri/{Cargo.toml,Cargo.lock,tauri.conf.json,src/main.rs,build.rs}`, `.github/workflows/build.yml`, `/opt/trophy-desktop/{index.html,download.html,releases/}`
**Why:** Релиз нужно доводить до трёх поверхностей одновременно: GitHub tag/release, updater manifest и публичная витрина DE2. Иначе пользователи видят старую версию или скачивают старый файл, даже если updater уже обновился.

### [107] 2026-04-23 | bugfix | AppImage rebuilds embedded frontend on UI changes
**Before:** После добавления быстрых map actions пользователь не видел новых пунктов в ПКМ. Диагностика показала, что запущенный AppImage был новым по времени, но build script не следил за `ui/index.html`, поэтому при сборках был риск получить AppImage со старым embedded frontend. Дополнительно пользователь мог жать ПКМ по карте/около точки, а новые пункты были только в waypoint-меню.
**After:** `src-tauri/build.rs` теперь явно сообщает Cargo `rerun-if-changed` для `../ui/index.html`, `../ui/leaflet.css`, `../ui/leaflet.js`. В `ctx-menu-map` добавлены действия `Яндекс Карты здесь`, `Яндекс Панорама здесь`, `Google Maps здесь`, `Street View здесь`, которые открывают координату клика через `map_viewer`. Локальный AppImage пересобран и заменён, backup `TrophyNavigator.AppImage.bak-before-map-menu-rebuild-20260423_011638`.
**Files:** `ui/index.html`, `src-tauri/build.rs`, `~/Applications/TrophyNavigator.AppImage`
**Why:** Для single-file Tauri UI нельзя полагаться, что Cargo сам заметит изменения вне `src-tauri`; build script должен явно следить за frontendDist, иначе релиз/локальный AppImage может выглядеть собранным, но показывать старый UI.

### [106] 2026-04-23 | feature | Waypoint map actions in context menu and point list
**Before:** Быстро открыть карты/панорамы по координате можно было только из окна свойств точки. Для частого сценария подготовки КП это лишний заход в свойства, особенно при работе по карте или таблице точек.
**After:** В waypoint ПКМ-меню добавлены действия `Яндекс Карты`, `Яндекс Панорама`, `Google Maps`, `Street View`, которые используют уже существующее Tauri WebView-окно `map_viewer`. В таблице точек добавлена колонка `Карта` с компактными кнопками `🗺` и `👁` для Яндекс карты и панорамы. Локальный AppImage `v0.9.10` пересобран и установлен в `~/Applications/TrophyNavigator.AppImage`, backup `TrophyNavigator.AppImage.bak-before-wpt-map-actions-20260423_010240`.
**Files:** `ui/index.html`, `~/Applications/TrophyNavigator.AppImage`
**Why:** Функция просмотра места полезна не только в свойствах точки: быстрый доступ из ПКМ и списка точек сокращает клики при подготовке маршрута и проверке КП.

### [105] 2026-04-23 | bugfix/feature | Ruler toggles off and can be saved as a track
**Before:** Кнопка линейки `📐` и горячая клавиша `M` вызывали `setMode('ruler')`, поэтому повторное нажатие не выключало линейку. Измеренную линию нельзя было превратить в обычный трек без ручного перерисовывания в режиме трека.
**After:** Кнопка `📐` и клавиша `M` переведены на `toggleMode('ruler')`. Добавлена нижняя панель линейки с текущей дистанцией, количеством точек, undo последней точки, очисткой, закрытием и кнопкой `В трек`; `saveRulerAsTrack()` создаёт обычный track через `createTrackFromPoints()`, задаёт orange style/source `ruler`, обновляет список треков и сохраняет состояние. Title/statusbar внутри HTML обновлены до `v0.9.10`. Локальный AppImage `v0.9.10` пересобран и установлен в `~/Applications/TrophyNavigator.AppImage`, последний backup `TrophyNavigator.AppImage.bak-before-versionlabel-20260423_002935`.
**Files:** `ui/index.html`, `~/Applications/TrophyNavigator.AppImage`
**Why:** Линейка должна быть быстрым временным инструментом, который выключается повторным нажатием, но при необходимости её геометрию можно сохранить как нормальный трек для экспорта/синхронизации.

### [102] 2026-04-23 | feature | Waypoint map links open in app WebView window
**Before:** Кнопки координат в свойствах точки строили корректные Яндекс/Google URL, но обычное открытие могло не срабатывать в текущем desktop-окружении, а iframe-встраивание не подходит: полные страницы Яндекс/Google карт блокируют embedding через browser headers.
**After:** В `src-tauri/src/main.rs` добавлена команда `open_map_viewer`: она принимает только `http/https` ссылки на Google/Yandex hosts, создаёт или переиспользует окно `map_viewer`, ставит размер `560x430`, минимум `360x260`, позиционирует окно внизу слева рабочей области монитора и оставляет его resizable. В `ui/index.html` кнопки `Яндекс Карты`, `Я.Панорама`, `Google Maps`, `Street View` теперь сначала открывают это Tauri WebView-окно; для запуска HTML вне Tauri оставлен browser fallback. Локальный AppImage `v0.9.10` пересобран и установлен в `~/Applications/TrophyNavigator.AppImage`, backup `TrophyNavigator.AppImage.bak-before-mapviewer-20260423_001308`.
**Files:** `ui/index.html`, `src-tauri/src/main.rs`, `~/Applications/TrophyNavigator.AppImage`
**Why:** Для карт и панорам нужен не iframe, а top-level WebView без адресной строки: так это остаётся окном приложения, но не упирается в запреты встраивания внешних карт.

### [101] 2026-04-22 | feature/ops | Waypoint external map links + Android site refresh
**Before:** В свойствах точки desktop показывал координаты, но не давал быстрых внешних ссылок на эту точку в веб-картах/панорамах. На публичной Android-странице fallback-версия в hero оставалась `v2.9.6`, а `/updates/changelog.json` не показывал последние Android stable/beta релизы, хотя manifests уже отдавали stable `2.9.9/384` и beta `2.9.82/385`.
**After:** В `ui/index.html` добавлен блок `Открыть координату` с кнопками `Яндекс Карты`, `Я.Панорама`, `Google Maps`, `Street View`; ссылки строятся из текущих полей широты/долготы в свойствах точки и открываются через Tauri `opener.openUrl` с browser fallback. Локально собран AppImage `v0.9.10` и установлен в `~/Applications/TrophyNavigator.AppImage`, предыдущий файл сохранён как `TrophyNavigator.AppImage.bak-before-maplinks-20260422_234859`. На DE2 обновлены главная `/opt/trophy-desktop/index.html` (Android card `v2.9.9`), `/opt/trophy-desktop/android.html` (`v2.9.9`) и `/var/www/updates/changelog.json` с fresh stable `2.9.9/2.9.8/2.9.7` и beta `2.9.82/2.9.81/2.9.80`; бэкапы `*.bak.20260422_234859`.
**Files:** `ui/index.html`, `~/Applications/TrophyNavigator.AppImage`, `/opt/trophy-desktop/{index,android}.html`, `/var/www/updates/changelog.json`
**Why:** Для подготовки точек удобно сразу смотреть окружение и панорамы места, а публичная страница Android должна совпадать с фактическими update manifests.

### [100] 2026-04-22 | ops | Local Linux AppImage reinstall + clean launcher
**Before:** На ноуте Andre локальный `/home/andre22/Applications/TrophyNavigator.AppImage` был старее прод-релиза: файл от 2026-04-19, тогда как updater manifest уже отдавал `v0.9.10` от 2026-04-21. Запуск из Obsidian Terminal дополнительно наследовал Snap-переменные `GIO_MODULE_DIR`, `XDG_*`, `GDK_PIXBUF_MODULE_FILE`, из-за чего Tauri/WebKit пытался грузить несовместимые GTK/GIO-модули и писал ошибки `undefined symbol`.
**After:** AppImage заменён на `v0.9.10`, старый файл сохранён как `TrophyNavigator.AppImage.bak-20260422_231628`. Ярлык `trophy-navigator.desktop` теперь запускает `~/.local/bin/trophy-navigator-desktop`; wrapper чистит Snap/GIO env, выставляет нормальные XDG paths и даёт приложению совместимый GIO TLS-модуль из AppImage. Проверка: `desktop-file-validate` OK, запуск wrapper на 12 секунд без stderr и без немедленного краша.
**Files:** `~/Applications/TrophyNavigator.AppImage`, `~/.local/bin/trophy-navigator-desktop`, `~/.local/share/applications/trophy-navigator.desktop`, `~/.local/share/trophy-navigator-desktop/gio-modules/libgiognutls.so`
**Why:** Если Linux AppImage "не работает" именно на ноуте Andre, сначала проверять локальный файл/ярлык и окружение Obsidian/Snap, а не сразу искать баг в релизе.

### [97] 2026-04-20 | feature | Desktop UI readability pass
**Before:** Открытые окна desktop-приложения были плохо различимы: все modal overlay жили на одном z-layer, повторное открытие окна не поднимало его наверх, centered-модалки при перетаскивании сохраняли `translateX(-50%)`, а светлая тема частично зависела от hardcoded dark colors.
**After:** В `ui/index.html` расширены CSS tokens для light/dark (`modal/input/row/selected/shadow`), базовые списки точек/треков/маршрутов и footer модалок переведены на переменные, активное окно получает отдельный z-index и акцентную рамку, drag убирает `transform`, ограничивает окно экраном и поднимает его наверх. Настройки темы синхронизируются при старте и при открытии окна настроек.
**Files:** ui/index.html
**Why:** Первый безопасный слой перед GPX-only sync: интерфейс должен быть читаемым в обоих режимах, иначе любые новые окна обмена файлами будут выглядеть как очередная тёмная/серая каша. Проверки: inline JS syntax, `git diff --check`, headless Chrome screenshots для light/dark с открытыми окнами. Урок: при smoke-вставке script в этот HTML временный патч должен заменять только финальный `</body></html>`, потому что внутри JS есть export HTML template со своим `</body>`.

### [98] 2026-04-20 | feature | Desktop live/share GPX-only package semantics
**Before:** Desktop live/share уже фактически отправлял XML через `buildGPXWithData()`, а сервер сохранял blob как `.gpx`, но frontend metadata и UI продолжали показывать разные типы (`waypoints`, `track`, `route`). Это создавало ложную модель, будто синхронизируются отдельные форматы данных, а не GPX-контейнер.
**After:** Все новые share presets в `liveBuildSharePresets()` выставляют `type: 'gpx'`, labels стали `GPX: ...`, окно отправки переименовано в “Отправка GPX”, summary показывает `GPX-пакет`, входящие показываются как GPX-пакет, а legacy типы `route/track/waypoints` через `liveAttachmentTypeLabel()` отображаются как GPX для обратной совместимости.
**Files:** ui/index.html
**Why:** Это первый безопасный шаг к GPX-only sync без изменения server API и Android: контейнер GPX уже несёт точки/треки/маршруты/extensions, поэтому UI должен показывать пользователю именно “GPX-пакет”, а не отдельные внутренние типы.

### [99] 2026-04-21 | bugfix | Light theme context menu contrast
**Before:** В светлой теме контекстное меню по клику на карте было плохо читаемым: фон и текст сливались. Причина — light CSS правило было на `.ctx-menu`, а реальные меню в HTML имеют только id `#ctx-menu`, `#ctx-menu-map`, `#ctx-menu-track`.
**After:** Light override переведён на реальные `#ctx-menu*` selectors, а базовые стили контекстных меню теперь используют theme variables (`--modal-bg`, `--text-primary`, `--row-hover`, `--bg-danger`, `--panel-shadow`). Меню поднято над окнами через `z-index: 5200`. Локально пересобран и перезапущен Linux AppImage.
**Files:** ui/index.html
**Why:** При рефакторинге светлой темы нельзя полагаться на несуществующие классы. Для старого single-file UI нужно проверять фактические id/class в разметке перед добавлением theme override.

### [96] 2026-04-20 | decision | Route semantics fixed
**Before:** В обсуждении route editor оставалась двусмысленность: можно ли считать маршрут просто произвольной линией “по карте”, без опорных точек/КП и без связи с треком.
**After:** Зафиксировано проектное правило: маршрут в Trophy Navigator допустим только в двух моделях. Первая — как последовательность явных точек/КП на карте. Вторая — как маршрут, построенный по готовому треку. Абстрактный “маршрут просто по карте” без точек и без трека считать некорректной моделью данных и UX; следующие доработки route registry/editor должны исходить именно из этого.
**Files:** `ui/index.html`, project memory
**Why:** Это закрепляет семантику маршрута и уменьшает риск, что следующий агент снова начнёт проектировать route как свободную полилинию без опорной сущности.

### [95] 2026-04-20 | release | Desktop v0.9.9 hotfix: WPT radius + route edit
**Before:** После релиза `0.9.8` пользователь принёс реальный `WPT` `Magnum25_Sport1.wpt`, где proximity лежит в стандартном Ozi field 14 (idx `13`). Desktop читал не ту колонку и не подхватывал радиусы. Маршруты можно было перекрасить, но явного режима добавления/доработки КП после импорта не было.
**After:** `parseOziWaypointRadius()` переведён на Ozi idx `13` с узким fallback для legacy desktop-export, `saveWaypointsWPT()` теперь пишет radius обратно в правильную колонку. Для маршрутов добавлен `routeedit` режим: кнопка `✎ КП`, snapshot/cancel, добавление КП по клику на карту и по существующим waypoint-ам, выбранный маршрут автоматически раскрывается и показывает rename/radius/delete для КП. Выпущен `v0.9.9`, GitHub Release и updater manifest опубликованы, `trophynav.ru` переведён на `0.9.9`, workflow run `#76` зелёный.
**Files:** `ui/index.html`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, `/opt/trophy-desktop/index.html`, `/opt/trophy-desktop/download.html`
**Why:** Hotfix на реальном пользовательском формате: без него боевые `WPT` теряли радиус сближения, а загруженный маршрут оставался неудобным для дальнейшего редактирования.

### [94] 2026-04-20 | feature | Desktop files/routes + self-share
**Before:** В desktop не было стабильного списка загруженных файлов, `PLT/RTE/WPT/GPX` обрабатывались как пересекающиеся сущности, удаление точки трека было спрятано и плохо обнаруживалось, у маршрута не было редактора цвета/толщины, GPX extension-поля `color/radius/waypointId` читались непоследовательно, а отправить выбранный трек/маршрут/точки самому себе на планшет через сервер было нельзя: групповая логика специально исключала свои устройства.
**After:** В `ui/index.html` добавлены multi-import и реестр `loadedSourceFiles`, который сохраняется в state и отображается в модали файлов; импортёры `WPT/RTE/PLT/GPX` теперь регистрируют source-файлы и нормальнее разделяют `point set / route / track`. Для трека добавлено явное удаление выбранной точки, для маршрутов появилась панель свойств (`name/color/width/dash/visibility`) и редактирование радиусов/имён КП. `RTE` теперь старается связываться с загруженными waypoint-ами, а GPX import/export корректно читает и пишет route/track styles и radius/waypointId через namespace-safe extension parsing. В live/sync добавлены `GET /api/live2/my-devices` и контур `self-share` с TTL 24 часа, плюс на desktop появились фильтр `Мои устройства`, отправка данных на своё устройство и отображение хвоста собственного устройства.
**Files:** ui/index.html, sync-server/server.js
**Why:** Нужен был рабочий desktop hotfix для сценария `desktop ↔ tablet`: нормальный импорт файлов, редактирование маршрутов/треков, сохранение контекста загруженных файлов и ручная пересылка собственных данных через сервер без групповых костылей.

### [93] 2026-04-20 | discovery | Desktop file-model audit: WPT/RTE/PLT/GPX смешаны
**Before:** Пользователь сообщил, что в desktop-клиенте не получается нормально редактировать загруженные треки и маршруты: у трека неочевидно/не работает удаление точек, у загруженного маршрута нельзя менять цвет, после refresh/open-update список исходных файлов ведёт себя нестабильно, а форматы `WPT/RTE/PLT/GPX` обрабатываются как будто это одна сущность.
**After:** Аудит `ui/index.html` показал несколько корневых причин. 1) В приложении нет единого реестра загруженных файлов: реальные сущности живут в отдельных массивах `waypoints/tracks/routes`, а `GPX` дополнительно хранится отдельным контейнером `importedGpxFiles`, из-за чего UI и sync смотрят на разные источники истины. 2) `openFile()` открывает только один файл за раз и не передаёт вызывающему путь/метаданные источника, поэтому нельзя корректно вести “открытые файлы”. 3) У маршрутов есть только список и reorder/delete KP, но нет панели свойств по аналогии с треками; `saveRoutesGPX()` не пишет route color и не объявляет `xmlns:tnd`, хотя использует `tnd:*` теги. 4) `loadGPXRoutes()` читает только `rtept`, но игнорирует route-level color, а `loadRTE()` создаёт маршрут только из точек и подписей, без привязки к ранее загруженному waypoint set. 5) Связь `route -> waypoint` через `pointWaypointIds` реально используется только в Race Report, а не в основном workflow карты. 6) Парсинг XML extension-полей для `color/radius` сделан непоследовательно (`color/radius` в одних местах и `*|radius` в других), поэтому нужны реальные фикстуры пользовательских файлов и единый parser layer.
**Files:** `ui/index.html`
**Why:** Пока нет нормальной модели `source file / point set / route / track`, любой точечный фикс будет снова ломаться на sync/import/UI.

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

| 90 | 2026-03-28 | decision | AI agents migrated DE2→DE3 | DE3, systemd, AGENTS.md |
| 91 | 2026-03-28 | decision | Tom=deputy, Jack=subordinate | AGENTS.md, CLAUDE.md |
| 93 | 2026-04-11 | bugfix | Android companion sync aligned with current TND API | ../racenav-android/MapFragment.kt, ../racenav-android/SettingsFragment.kt |
| 95 | 2026-04-17 | feature | Mail DKIM+DMARC: score 5.9→ok, письма из спама → inbox | DE2 postfix/opendkim/dovecot, reg.ru DNS |

### [90] 2026-03-28 | decision | AI agents migrated from DE2 to DE3
**Before:** All bots on DE2 (87.120.84.254) — overloaded server
**After:** 6 services on DE3 (94.156.115.172): Claude Bot, Codex Bot, OpenClaw, yt-api, ttyd, Штаб AI
**Files:** DE3 systemd services, ~/.codex/AGENTS.md, CLAUDE.md, ~/.openclaw/
**Why:** Separate AI workload from VPN/TND. DE2 freed ~3GB RAM.

### [91] 2026-03-28 | decision | Hierarchy change: Tom=deputy, Jack=subordinate
**Before:** Джек=заместитель, Том=кодер/QA
**After:** Том=заместитель Опуса + главный инженер, Джек=инженер в подчинении Тома
**Files:** ~/.codex/AGENTS.md, /opt/claude-telegram-bot/CLAUDE.md on DE3
**Why:** Том (GPT-5.4) более изобретательный и самостоятельный чем Джек (Sonnet)

### [93] 2026-04-11 | bugfix | Android companion sync aligned with current TND API
**Before:** Desktop already used `POST /api/email/register`, `GET /api/sync/pull`, `POST /api/sync/push`, but Android still depended on dead `GET /api/sync/by-email/:email` and legacy `/api/state` flow. Android push also sent only the active track and left points/routes empty.
**After:** Android key resolution moved to `POST /api/email/register`; sync uses `X-Sync-Email` + `X-Sync-Key` with modern pull/push endpoints when email is present. Push/pull now cover all core entities: points, tracks, routes.
**Files:** ../racenav-android/app/src/main/java/com/andreykoff/racenav/MapFragment.kt, ../racenav-android/app/src/main/java/com/andreykoff/racenav/SettingsFragment.kt
**Why:** Cross-device sync between desktop and Android had stopped working for the real companion workflow.

### [94] 2026-04-11 | release | Android sync hotfix actually rolled out to users
**Before:** Sync compatibility fix was prepared locally, but public OTA channels still served stable `2.9.5 / 374` and beta `2.9.73 / 374`.
**After:** Clean release APKs were built and published on DE2: stable `2.9.6 / 375`, beta `2.9.74 / 375`. Public verification succeeded for `https://trophynav.ru/updates/latest.json`, `https://trophynav.ru/api/update/beta`, `https://trophynav.ru/updates/racenav.apk`, and `https://trophynav.ru/updates/racenav-beta.apk`.
**Files:** DE2 `/var/www/updates/latest.json`, DE2 `/var/www/updates/latest-beta.json`, DE2 `/var/www/updates/racenav.apk`, DE2 `/var/www/updates/racenav-beta.apk`
**Why:** User explicitly needed the fix to reach real users through the update mechanism, not remain as a local patch.

### [95] 2026-04-17 | feature | Mail auth: DKIM + DMARC + dedicated mailbox
**Before:** Порт 25 был закрыт Play2Go — очередь postfix накопила 4 письма в deferred; SPF настроен (`v=spf1 ip4:87.120.84.254 -all`), DKIM/DMARC отсутствуют; письма от `info@trophynav.ru` попадали в спам Gmail.
**After:** Порт 25 открыт пользователем → очередь разгрузилась. На DE2 установлен `opendkim` (селектор `mail`, RSA 2048), подключён к postfix как milter на `127.0.0.1:8891` с `milter_default_action=accept` (безопасный fallback). Добавлены DNS TXT в reg.ru: `mail._domainkey.trophynav.ru` (DKIM public key) и `_dmarc.trophynav.ru` (сначала `p=none`, затем `p=quarantine; rua=mailto:dmarc@trophynav.ru`). Создан отдельный ящик `dmarc@trophynav.ru` (virtual_mailboxes + dovecot users, maildir `/var/mail/vhosts/trophynav.ru/dmarc/`) — бот его НЕ мониторит, чтобы не зашумлять Telegram DMARC-отчётами.
**Files:** DE2 `/etc/postfix/main.cf`, `/etc/opendkim.conf`, `/etc/opendkim/KeyTable`, `/etc/opendkim/SigningTable`, `/etc/opendkim/TrustedHosts`, `/etc/opendkim/keys/trophynav.ru/mail.private`, `/etc/postfix/virtual_mailboxes`, `/etc/dovecot/users`, reg.ru DNS (TXT mail._domainkey, TXT _dmarc)
**Why:** Админка `trophynav.ru` отправляет транзакционные письма (@trophynav_bot имеет mail API для автоответов через AI). Без DKIM письма стабильно попадали в спам. mail-tester score до настройки ~3-4/10, после DKIM = 5.9/10, после `p=quarantine` остался 5.9/10 (mail-tester не зачёл без `sp=quarantine; pct=100` — пользователь решил не добивать до 8.9/10, приоритет "не сломать что работает"). Остались отложенные улучшения: (1) `sp=quarantine; pct=100` в DMARC; (2) PTR-запрос в Play2Go: `87.120.84.254 → mail.trophynav.ru`. Бэкапы: `/etc/postfix/main.cf.bak-20260417-065726`, `/etc/opendkim.conf.bak-20260417-071712`, `/etc/dovecot/users.bak-20260417-083201`, `/etc/postfix/virtual_mailboxes.bak-20260417-083127`. Откат при проблеме: `systemctl stop opendkim` — postfix продолжит слать письма без подписи (milter_default_action=accept).

### [96] 2026-04-21 | bugfix | Light UI panels + loaded track/route edit ergonomics
**Before:** После перевода `#ctx-menu*` на theme variables часть меню/панелей всё ещё оставалась тёмной в light theme; включение редактирования трека прятало окно с action-кнопками, выбор точки был ненадёжен, а у импортированного маршрута перестановка КП зависела от drag/drop.
**After:** Поисковая выдача, роутинг, file/sync/license панели, footer/load/save buttons и track tooltip используют theme variables. Редактирование трека/маршрута оставляет окно открытым; ЛКМ/ПКМ по точке трека выбирают её для удаления/разбиения; добавлена кнопка `✂ Разбить` для выбранной точки; КП маршрута получили явные `↑/↓/✕` в списке и `✎` рядом с маршрутом.
**Files:** `ui/index.html`
**Why:** В Tauri/Linux контекстные/drag actions должны иметь явные видимые controls; скрывать edit-панель при входе в режим редактирования делает импортированные TRK/RTE практически нередактируемыми.

### [97] 2026-04-21 | bugfix | PLT/GPX track import must reject Null Island ghost points
**Before:** При загрузке треков могла появляться точка `0,0`, которой нет в реальном треке. Главная причина: PLT-заголовок вида `0,0,<color>,<name>...` формально похож на координатную строку и старый `isTrackHeaderRow()` не считал его заголовком, потому что `0,0` проходил `isTrackPointRow()`.
**After:** Добавлен общий `parseTrackLatLng()` с диапазонной проверкой и отбрасыванием Null Island. PLT-заголовки распознаются до проверки точки; GPX `trkpt` с `0,0` пропускается; restore старой сессии чистит уже сохранённые мусорные `0,0` точки.
**Files:** `ui/index.html`
**Why:** В Ozi PLT первые поля строки заголовка не являются координатами; для trophy-навигации `0,0` при импорте трека почти всегда sentinel/мусор, а не реальная точка маршрута.

### [98] 2026-04-21 | release | Desktop v0.9.10 shipped with light-theme and imported-track hotfixes
**Before:** Fixes for light-theme readability, imported TRK/RTE editing, and `0,0` ghost-track filtering existed only locally after v0.9.9, so users would not receive them through the updater.
**After:** Bumped desktop to `0.9.10`, committed `d5c643b`, got Tom/Штаб sign-off `DEV-228 GO`, pushed tag `v0.9.10`, and GitHub Actions run `24711242547` completed successfully. The updater manifest at `https://trophynav.ru/api/updates/latest.json` returns `0.9.10` with Linux/Windows signatures. DE2 public downloads were refreshed as `/opt/trophy-desktop/releases/trophy-navigator-desktop_0.9.10_x64-setup.exe` and `/opt/trophy-desktop/releases/trophy-navigator-desktop_0.9.10_amd64.AppImage`; `index.html` and `download.html` now point to v0.9.10.
**Files:** `ui/index.html`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, DE2 `/opt/trophy-desktop/{index.html,download.html,releases/}`
**Why:** Desktop updater requires a strictly newer version than v0.9.9; public site links also need manual refresh after CI publishes GitHub Release assets.

### [99] 2026-05-14 | bugfix | Desktop offline maps, WP rename, restore lists, Linux updater restart
**Before:** Added offline maps were hard to discover because only active offline layers appeared in the main layer list; quick WP rename reused marker popups and could not reliably reopen, while route/OSRM labels kept old WP names; after restart the map data could be present without refreshed route/track lists, and a session with empty `routes` did not recover saved route GPX files; Linux updater installed but did not explicitly relaunch the AppImage.
**After:** All discovered offline maps appear under the layer selector and can be enabled there with overzoom/fitting. Download zoom is clamped by the server tile catalog `maxzoom` for selected base/overlay sources, while display still uses `maxZoom=22` + `maxNativeZoom=<last real zoom>` so maps stretch instead of requesting missing tiles. Quick rename uses a standalone popup and syncs route labels, waypoint ids/radii, and OSRM endpoint labels; state now carries `savedAt`, syncs restored file state back to localStorage, refreshes waypoint/track/route lists after `applyState`, and recovers all GPX files from `Documents/TrophyNavigator/{waypoints,tracks,routes}` when a collection is empty. After update install the UI calls Tauri process relaunch/restart with a manual fallback message.
**Follow-up:** Track point hover popup now shows the track name as the first line; point number/count stays below it.
**Files:** `ui/index.html`
**Why:** These were user-visible regressions reported after v0.9.14 field use; local data should survive restarts and desktop offline maps should behave closer to Android.
