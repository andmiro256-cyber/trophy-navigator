# Харнесс аудита TN Desktop — запуск на HP

План MapLibre v3, этап 0б, пакет 0б.6. Это сценарии полной проверки функций от 07.10
(`notes/Проекты/Desktop — полная проверка функций (2026-10-07).md`), переведённые на `window.__tnTest`. Одни и те же
сценарии идут на 0.9.34, на Leaflet-адаптере и на MapLibre-адаптере. Реестр строк — `tests/parity/registry-272.tsv`.

Подход прежний:
- настоящее приложение (Rust + WebKitGTK) в невидимом дисплее Xvfb `:99`;
- управление — `WebKitWebDriver` (W3C) напрямую;
- клики, ПКМ, колесо и перетаскивание — **настоящей мышью** через XTEST (`xdotool`). Синтетический ПКМ в WebDriver
  закрывает меню ложным `click`.

## Не трогаем приложение и данные Andre

- Только через `env.sh`: свой `HOME`, `XDG_*`, `XDG_RUNTIME_DIR` и D-Bus внутри папки прогона `$A`, дисплей `:99`.
  «TN Desktop» и «TN Desktop тест» Andre не запускаются, и их папки не читаются.
- `fakebin/` стоит первым в `PATH`: `xdg-open`, `gio` и другие только пишут в `$A/logs/opener.log`, а не открывают
  окна на рабочем столе.
- Сеть: `hooks.js` блокирует `trophynav.ru/api/*` (кроме каталога тайлов) и `api.github.com`, на рабочий сервер ничего
  не уходит. Исключение — штатная проверка лицензии в первую секунду запуска, до установки перехватчика.
- HP общий: на нём идут сборки карт (planetiler) и `enrich-lab`. Перед запуском посмотрите `uptime` и `free -m`. Всё
  запускайте через `nice -n 19`. Приложению нужно около 1 ГБ памяти.

## Что нужно на HP (уже есть с 07.10)

`~/desktop-audit/root/usr/bin` — `Xvfb`, `xdotool`, `WebKitWebDriver` 2.52.6 с библиотеками в
`root/usr/lib/x86_64-linux-gnu`. Они распакованы из deb без sudo. Если папки нет: `apt-get download` пакеты `xvfb`,
`xdotool`, `webkit2gtk-driver` и недостающие зависимости, затем `dpkg -x <deb> ~/desktop-audit/root`.

## 1. Код на HP

С ноутбука, из worktree ветки:

```bash
ssh hp 'mkdir -p ~/tnd-mlharness/tools ~/tnd-mlharness/ui'
rsync -a --exclude __pycache__ tools/harness hp:tnd-mlharness/tools/
rsync -a ui/tn-geo.js ui/tn-test-api.js hp:tnd-mlharness/ui/
```

`ui/tn-geo.js` и `ui/tn-test-api.js` нужны, если в сборке нет `__tnTest`, например в чистой v0.9.34 или в 0.9.27 аудита.
Тогда `wd.session()` сама внедряет их из `ui/` рядом с харнессом.

## 2. Папка прогона и сборка

Для каждой базы — своя папка `A`, чтобы не смешивать доказательства. `~/desktop-audit` — прогон 07.10, его не трогаем.

```bash
A=~/desktop-audit-0934            # пример: baseline 0.9.34
mkdir -p $A/app $A/logs $A/shots $A/run $A/home
ln -sfn ~/desktop-audit/root $A/root
cd $A/app && ~/путь/TN\ Desktop\ тест_0.9.34_amd64.AppImage --appimage-extract >/dev/null && mv squashfs-root v1 && ln -sfn v1 cur
```

- Нужна **тестовая** сборка «TN Desktop тест»: identifier `ru.trophy-nav.desktop.test`, своя папка данных, обновления
  выключены. Её папку данных в `$A/home/Документы/` задаёт `TN_WORKDIR_NAME`, по умолчанию `TrophyNavigatorTest`.
- В отчёт записываются sha256 AppImage и `index.html` (план §3.2). `grab.py <метка>` снимает `index.html` и модули из
  живой сборки в `$A/logs/`.
- Чистый профиль — пустой `$A/home`. С данными аудита — `cp -a ~/desktop-audit/home $A/home`. В `start.sh`
  `data/*` копируется в `$A/home/Загрузки/`: это `audit-*.gpx`, Ozi в cp1251, KML, Locus XML, `audit-xss.gpx`,
  `ext-map.sqlitedb`.

## 3. Запуск

```bash
cd ~/tnd-mlharness/tools/harness
export A=~/desktop-audit-0934
nice -n 19 sh start.sh            # Xvfb :99 + WebKitWebDriver :4455, fakebin и data/ в $A
. ./env.sh                         # дальше — только в этом окружении
nice -n 19 python3 smoke.py        # самопроверка: __tnTest, прокладка API-GAPS, помощники; код 1, если что-то упало
nice -n 19 python3 s1.py           # сценарии по одному; s1 и s8b открывают новую сессию
…
sh stop.sh                         # WebKitWebDriver, Xvfb и шина at-spi нашего XDG_RUNTIME_DIR
```

- `wd.session()` переиспользует живую сессию из `$A/logs/sid`, а с `new=True` перезапускает приложение.
- Каждый шаг пишет скриншот в `$A/shots/<прогон>-NN.png` и запись в `$A/logs/<прогон>.json`: окна, режим, тосты,
  ошибки консоли, вызовы Tauri, сеть, `extra` и `gaps`.
- `fresh.py` проверяет первый запуск на чистом профиле. Ему нужен второй драйвер на 4456 с другим `HOME`:
  `HOME=$A/home2 dbus-run-session -- WebKitWebDriver --port=4456`.
- `TN_STRICT=1` — без прокладки `tn-gaps.js`. Так нужно гонять MapLibre-адаптер: шаг, которому не хватило метода,
  падает с `API-GAP Gn`.

## Сценарии → разделы реестра 272

| Скрипт | Раздел |
|---|---|
| `s1`, `s2` | §1 тулбар (1600/1280) и меню «⋯» (≤ 1100) |
| `s3` | §2 горячие клавиши |
| `s4` | §8 файлы, импорт, экспорт |
| `s5`, `s5b`, `dbg` (XSS) | §5 точки |
| `s6` | §6 треки |
| `s7` | §7 маршруты по точкам |
| `s8`, `s8b` | §4 контекстные меню (s8b — меню трека через `dispatchAt`, обход P1 №3) |
| `s9`, `s9a`, `s9c`, `s9d` | §9 карта и слои |
| `s10`, `s10b`, `s10c`, `s10d` | §10 офлайн-карты |
| `s11`, `s11b` | §11 TrophyNav Maps и 3D |
| `s12` | §12 настройки (с перезапуском) |
| `s13`, `s14` | §13 синхронизация, §14 Live (сеть — заглушки) |
| `s15`, `s16`, `s16b` | §15 Race Report, §16 маршрут по дорогам и поиск |
| `s17` | §17 очистка, «О программе», линейка; §3 зум, «Обзор», виджеты |
| `s18` | перетаскивание файлов (§8, §10), колесо и сдвиг карты (§3) |
| `s19` | быстрое переименование, окна, КП, «📦 Скачанные карты», Live GPX, удаление TrophyNav Maps |
| `r2` | повтор дефектов на второй сборке |
| `fresh` | §18 первый запуск |
| `reg`, `grab` | DOM-инвентарь кнопок, снимок `index.html` из сборки |

Селекторы DOM взяты из 0.9.26/0.9.27. В 0.9.30–0.9.34 часть окон изменилась: «Слои поверх», спойлеры в окне треков,
своя ручка размера окон. Если на 0.9.34 шаг пишет `!! not visible: <css>` или `covered by …` (`wd.CLICKLOG`), правьте
селектор в сценарии, **не приложение**. Baseline снимается по правилам плана §3.2 → `tests/parity/baseline-0.9.34.tsv`.

## Правила для сценариев

- Карта — только через `window.__tnTest` и помощники `window.__tnh` (`tn-harness.js`):
  - `xy` — точка в координатах окна для xdotool;
  - `go` и `fit` — вид карты;
  - `wp`, `wpWhere`, `track`, `route`, `pts` — объекты и их координаты;
  - `selWp` — выбранная точка, `tiles` — счётчики тайлов, `offline` — офлайн-карты на карте.

  Из Python: `wd.V`, `wd.setview`, `wd.latlng_xy`, `wd.ctl` (кнопки карты), `wd.popsel` (попап).
- Нельзя: `map.*`, `L.*`, маркеры `waypoints[i]`, `.wpData`, `.polyline`, `.wpCircle`, `._icon`, `activeWaypoint`,
  `eachLayer`, `hasLayer`, классы `.leaflet-*`. Это проверяет сторож `tests/harness-no-leaflet.test.mjs`. Исключение —
  `tn-gaps.js`, временная прокладка.
- Состояние приложения вне движка можно читать как есть: `currentMode`, `selectedTrackId`, `currentTrackDraw`,
  `tracks[i].name`/`.points.length`/`.labels`, `offlineMaps[].name`, `customLayers` и т. п.
- Чего не хватает в `__tnTest` — записывается в `API-GAPS.md`. `ui/*` из харнесса не правится.
