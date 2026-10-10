# 0.9.34 model/export goldens

From the repository root, using Node 18+ and `/usr/bin/google-chrome`:

```sh
npm ci --prefix tools/golden
node tools/golden/run.mjs
node --test tests/golden.test.mjs
```

`run.mjs` serves `ui/` on an ephemeral localhost port and uses `playwright-core`, channel `chrome`, system Chrome, headless. Each fixture gets a fresh browser context. Tauri is absent: imports and exports run through the application's browser path. External network requests are blocked; tiles/catalog/license/sync responses cannot change the baseline. Startup state restoration finishes before imports. No production app files are modified.

To compare another checkout without overwriting the baseline:

```sh
GOLDEN_UI=/absolute/checkout/ui GOLDEN_OUT=/tmp/tnd-golden-comparison node tools/golden/run.mjs
cmp tests/golden/0.9.34/MANIFEST.sha256 /tmp/tnd-golden-comparison/MANIFEST.sha256
```

For a clean baseline use `git archive 6140209 ui` extracted to a temporary directory, and point `GOLDEN_UI` there. Checked-in outputs were verified against clean `6140209` (v0.9.34), and the feature branch's unchanged application UI. `BASELINE.json` records source hashes and tool versions. Future regeneration belongs in a separate output directory and must be reviewed before replacing goldens. Unexpected/stale output files cause failure instead of being silently included.

## Determinism and normalization

Before application scripts, Date is fixed to `2026-01-02T03:04:05.000Z`; explicit input dates and their arithmetic remain intact. Math.random uses an LCG seeded with `0x934`, reset after application startup. Locale is `ru-RU`, timezone UTC, viewport 1280×800. Map view is reset to 55.75/37.62, zoom 10 after imports and before state checkpoints; view animations are stopped. IDs remain the real application's generated IDs, with deterministic inputs.

`collectState.savedAt` is fixed to the same instant. Actual track timestamps, createdAt/updatedAt, IDs, coordinates, ordering, radii, visibility and segment flags are preserved. Export text is captured byte-for-byte from `window.downloadText`, evaluating the application's text factory. Fixed Date controls export date fields (including the RR footer); no regex rewriting of XML/HTML/numbers occurs. Nonfinite RR JSON numbers are represented as strings (`Infinity`, `-Infinity`, `NaN`), rather than silently becoming null. LF JSON formatting is stable; application Ozi CRLF remains unchanged.

## Outputs

Fixtures: F1–F7, F11, F16 (the explicit model/export list in Agent Bus #2727). See `tests/fixtures/map/README.md`; F8–F10/F12–F15 concern performance, offline maps, Live and stack acceptance, outside this task.

Each fixture records loaded state, every editing/undo checkpoint, final state, the earlier `b6d3e0f` map-schema projection, additive `map.offline`/`map.stack` application write/read/write results, operation results and exporter coverage. Non-empty exports use `saveWaypointsGPX`, `saveWaypointsWPT`, `saveTracksGPX`, `saveTracksPLT`, `saveRoutesGPX`, `saveRoutesRTE`. F2/F3 also record `rrMatchTrackToRoute`, `rrAnalyzeSlice`, generated report segments and real `rrExportHTML`. Inputs are checked for entity/point counts, WP links, timing/elevation, hidden objects, restored undo geometry and segment boundaries.

The additive round-trip uses `applyState` after all exports/RR; it cannot alter export baselines. This check covers existing empty offline/stack values; native offline-map files and opening additive files in 0.9.29 are later acceptance work. The JSON projection preserves point metadata, including `seg`, because the earlier serializer wrote `pointsData` as-is.

## Known 0.9.34 limitations

* No track join operation/undo action exists. F5 executes deletion, vertex drag, split, three undo actions; join and a fourth empty undo are explicitly `unsupported`. Import undo entries are cleared before the edit chain.
* No CSV exporter exists (the About dialog mentions CSV, but code contains only Ozi CSV field helpers). `exports.json` records `unsupported` for CSV.
* F2 renaming synchronizes route labels/IDs/radii; moving WP does not move route checkpoint geometry. Baseline behavior is preserved.
* F5 drag is a real application gesture (`beginTrackPointDrag`, mousemove/mouseup). Leaflet rounds through screen pixels: resulting coordinates can differ slightly from scenario target coordinates. Geometry is never normalized; later engine comparison must account for identical gesture semantics.
* F3 is deterministic synthetic data because prior audit GPX is unavailable. F16 uses both real downloads; source hashes/reduction provenance are in `sources.json`.

`MANIFEST.sha256` covers all golden files; the fixtures have a separate byte manifest (including Windows-1251 source files). `tests/golden.test.mjs` needs only built-in Node modules and does not launch Chrome or regenerate baselines in CI.
