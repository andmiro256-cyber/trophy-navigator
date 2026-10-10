# Agent Bus #2727 — MapLibre 0б.3

Автор: Тим 2. 10.10.2026. Ветка `tim2/maplibre-golden`, worktree `~/Projects/tnd-mlgold`.

Поставка: F1–F7/F11/F16 (явный список поручения), 24 исходных файла под fixture manifest; браузерный golden-генератор с фиксированными Date/random, локальным HTTP и системным Chrome; 106 golden-файлов, manifest-тест без браузера, README и BASELINE.json с SHA исходного `ui/` от `6140209`.

Проверка: два независимых полных прогона на `ui/`, извлечённом через `git archive 6140209 ui`, дают одинаковый MANIFEST; он также равен прогону feature-ветки от `32d31d6`. `node --test tests/golden.test.mjs`: 2/2 PASS. `node --check tools/golden/run.mjs`: PASS. `git -c core.whitespace=cr-at-eol diff --cached --check`: PASS (Ozi-источники и экспорты намеренно используют CRLF).

SHA-256 golden MANIFEST: `b25e3036266d75b6a3067ee66c029541630ba54bda04f4879d70fb9080c30018`.
SHA-256 fixture MANIFEST: `25df08dd414ac44ee4a97d7e0a092facca7ec78a3894cea0ca170a18f8fab70e`.

F2/F3: RR числа и настоящий HTML приложения, 3/5 КП. F4: hidden flags сохранены в collectState. F5: checkpoints delete/move/split и отмена трёх операций, исходная геометрия восстановлена; порядок WP после undo записан как выдаёт приложение. F16: 15 сегментов плана, 21 сегмент Android (Android содержит два трека), суммарно 36 сегментов/3 трека; все разрывы сохранены, включая однопунктовый сегмент. Оригинальные SHA и сокращение до 12 точек/сегмент — sources.json.

Ограничения исходной 0.9.34, переданы Opus через #2728: join и CSV-export отсутствуют в коде, записаны `unsupported`; перемещение WP не перемещает геометрию связанного КП. F3 — синтетический 301-point timed fixture: audit GPX недоступен. F5 drag сохраняет округление координат через экранные пиксели Leaflet. Реальные native offline-map round-trip и открытие state в 0.9.29 остаются следующими gates, данный round-trip проверяет существующие defaults offline/stack.

`ui/index.html`, `ui/*.js`, production и релизы не менялись.
