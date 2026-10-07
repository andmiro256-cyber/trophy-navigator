# Сторонние библиотеки для TrophyNav Maps (локально, без CDN)

| Файл | Пакет | Версия | Лицензия | Источник |
|---|---|---|---|---|
| `maplibre-gl.js`, `maplibre-gl.css` | maplibre-gl | 4.7.1 | BSD-3-Clause (`LICENSE-maplibre-gl.txt`) | npm `maplibre-gl@4.7.1`, `dist/` |
| `leaflet-maplibre-gl.js` | @maplibre/maplibre-gl-leaflet | 0.1.4 | ISC (`LICENSE-maplibre-gl-leaflet.txt`) | npm `@maplibre/maplibre-gl-leaflet@0.1.4` |

SHA-256 npm-архивов, из которых взяты файлы:

- `maplibre-gl-4.7.1.tgz` — `7e8a778cff03abad64ae19674977058616e1cf7c3712cabd1c35461ae465f923`
- `maplibre-maplibre-gl-leaflet-0.1.4.tgz` — `5b9a6fef107b387610dc01c76aa469f3a1d9201a138b1cc5357d7bb8eb34d452`

Почему 4.x, а не 5.x: ветка 5 требует WebGL2, а WebKitGTK на части Linux-машин даёт только WebGL1.

Стиль, темы, спрайты и шрифты карты (`ui/vector/`) — копия `app/src/main/assets/vector` Android
(racenav-android `429e587`): стиль OSM Liberty (лицензия `ui/vector/LICENSE-osm-liberty.md`),
шрифты Roboto (Apache 2.0), данные карт © OpenMapTiles © OpenStreetMap contributors.

SHA-256 файлов в репозитории:

- `maplibre-gl.js` — `be9633c4d870e26fb37f1cfe5c5a77181667114003ea16207ac7850d8da8add1`
- `maplibre-gl.css` — `576b085fdd9487a65a19215328c1e086c07ce5bf6da09b666b3806d3d008dae9`
- `leaflet-maplibre-gl.js` — `1e6cf8cb3eb5fd909879aa1bf36a383fb506c9a5b2dbbfababce65a294dd1fcb`
