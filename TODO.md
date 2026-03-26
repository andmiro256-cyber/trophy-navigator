# Trophy Navigator Desktop — TODO

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
