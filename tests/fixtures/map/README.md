# Map model regression fixtures (0.9.34)

Each F directory contains source files and a `scenario.json`. Load `imports` in order by the named application function. `encoding` defaults to UTF-8; decode F11 with `TextDecoder("windows-1251")` before calling the loader. A fresh application state is required per scenario.

`actions` are performed through application editing functions, in listed order. Indices are zero based and refer to the current application arrays. F2 loads waypoints first so route imports discover `pointWaypointIds`, then renames the first WP and moves the second. F4 hides the second waypoint set and second track. F5 captures initial state, applies delete → move vertex → split → join, captures edited state, and invokes undo four times; both checkpoints are relevant.

| Fixture | Coverage |
| --- | --- |
| F1 | WP (0,0), (0,30), (59.9,0); track crosses zero coordinates |
| F2 | Linked route checkpoints, WP rename/move, short timed track for RR |
| F3 | Deterministic 301-point timed/elevation track, five checkpoints for RR |
| F4 | Visible and hidden waypoint sets/tracks |
| F5 | Delete WP, move track vertex, split/join and undo |
| F6 | Antimeridian crossing 179.95 → −179.95 |
| F7 | North/south polar coordinates ±86° |
| F11 | Ozi WPT/PLT/RTE in actual Windows-1251 bytes |
| F16 | Real nakarte 15-segment plan and Android 21-segment recording |

F3 is synthetic and deterministic: the earlier `audit-*.gpx` input is absent from this checkout/downloads; coordinates, timestamps and elevation are explicit fixture bytes. F11 reproduces the audit Ozi cases with Cyrillic names/descriptions, radius, color and PLT timestamps.

F16 `sources.json` records SHA-256 of each original download, original/retained per-segment counts and reduction method. Each segment retains up to 12 evenly sampled points including endpoints, with point child metadata and every segment boundary preserved. The Android source has a one-point segment: retain it as-is to exercise 0.9.34 behavior. Generated fixture bytes never depend on current time.

F8/F9/F10 are later performance workloads; F12/F13 are offline maps; F14 is a Live mock; F15 is the later mixed-stack acceptance case. They are outside this model/export golden task’s explicit input list.

Known baseline limitations: F2 moving a linked waypoint synchronizes labels/id/radius but leaves route checkpoint coordinates unchanged in 0.9.34. F5 has no available join operation in 0.9.34; the generator must mark join unsupported and undo the three supported edits. These limitations are captured rather than repaired by the fixture suite.
