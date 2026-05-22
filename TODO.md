# Trophy Navigator Desktop — TODO

## 🔴 Handoff: почта / бот / relay (2026-04-14)

### Что уже сделано
- В `https://trophynav.ru/sync/admin/` доработан mail UI до Gmail-подобного вида.
- В живой бот `/opt/trophynav-bot/bot.js` добавлены:
- Telegram-команды почты `/mail`, `/mailbox`, `/mailopen`, `/mailreply`, `/mailsend`, `/mailact`, `/mailauto`.
- AI-автоответ типовых вопросов через `openclaw/gemini`.
- Базовые знания и правила эскалации для типовых вопросов по Trophy Navigator.

### Текущее состояние
- Автоответ реально генерируется и письмо создаётся.
- Письма видны в `Sent`.
- Пример: автоответ на `unikom@bk.ru` создан `2026-04-14 13:50:59 UTC`.
- `mail-state.json` показывает `autoRepliedByMailbox.INBOX = [5]`.

### Где реальная проблема
- Это не баг логики бота и не баг AI.
- Исходящая доставка наружу не работает: Postfix не может отправить письма на внешние MX по `25/tcp`.
- `postqueue -p` показывает deferred-письма:
- `1E8FA18094C` -> `unikom@bk.ru`
- `421B118094B` -> `barashkin.ig@yandex.ru`
- `995CA180942` -> `barashkin.ig@yandex.ru`
- Ошибка в логах:
- `connect to mxs.mail.ru[...] :25: Connection timed out`
- `connect to mx.yandex.ru[...] :25: Connection timed out`

### Что проверено
- `Sent` содержит исходящие письма от `info@trophynav.ru`.
- `postconf -n` не содержит `relayhost`.
- Локальный firewall не режет исходящий трафик: `OUTPUT ACCEPT`.
- С сервера `25/tcp` наружу не ходит, а `587/tcp` ходит:
- `mxs.mail.ru:25` -> timeout
- `smtp.mail.ru:587` -> ok
- `smtp.yandex.ru:587` -> ok
- `smtp.gmail.com:587` -> ok
- Значит проблема почти наверняка в блокировке прямого outbound `25` у VPS/провайдера.
- Поиск по `/opt`, `/root`, `/etc` не нашёл готовых SMTP relay credentials/config.

### Что делать дальше
- Не копать дальше бота как основную причину.
- Нужно одно из двух:
- Настроить `Postfix relayhost` через SMTP submission `587` с внешним SMTP-аккаунтом.
- Либо добиться открытия исходящего `25/tcp` у провайдера.
- После настройки relay очередь Postfix должна начать уходить без переписывания логики бота.

### Побочный нюанс
- После автоответа бот пытается `markRead`, но mail API отвечает `HTTP 404`.
- Это не причина недоставки наружу, а отдельный небольшой дефект mail action API/вызова.

## 🔴 Критические (следующая сессия)

### Live маркеры не видны на карте
- Sidebar работает, данные приходят, карта перемещается к участнику
- Но маркеры (divIcon) не отображаются
- **Отладка:** открыть DevTools (F12), вкладка Console — ошибки?
- **Проверить:** Leaflet divIcon с className 'live-icon-wrapper', iconSize [60,40], iconAnchor [30,20]
- **Возможная причина:** CSS конфликт, z-index, или pane overlayTiles перекрывает

### Wikimapia белые квадраты с текстом
- При включении слоя Wikimapia — белые квадраты
- Возможно устарел параметр `r=764397` или `type=hybrid`
- Проверить URL вручную: `http://i0.wikimapia.org/?x=1&y=1&zoom=5&r=764397&type=hybrid&lng=1`

### Live список не перемещается
- Drag за заголовок — проверить mousedown handler
- Возможно конфликт с Leaflet drag на карте

## 🟡 Средние

### Деплой v0.8.0
- AppImage собран + подписан
- Обновить latest.json на сервере для автообновления
- Команда: `scp AppImage root@87.120.84.254:/opt/trophy-desktop/releases/`

### Фильтр "только онлайн" в Live sidebar
- Добавить toggle в header панели
- Скрывать offline устройства

### Размер маркеров Live
- Добавить настройку в Settings

## 🟢 Планы (из DEV-70)

### Sprint 2: Анализ треков
- Chart.js подключить
- parseGPXWithTimestamps + calculateTrackStats
- Графики скорости/высоты
- Нижняя панель + связь карта ↔ график

### Sprint 3: Offline MBTiles
- Rust: mbtiles.rs (serve_tile + metadata)
- JS: MBTilesLayer + file picker
- Drag & Drop

### Sprint 4: Race Analytics
- matchTrackToWaypoints + analyzeSegments
- Визуализация сегментов на карте
- Таблица + Timeline bar + сравнение треков

### Sprint 5: Триал + Полировка
- Trial 20 дней + деградация (как Android)
- Keyboard shortcuts (Ctrl+S, Ctrl+Z, F11)
