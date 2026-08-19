import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');

function sourceBetween(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return html.slice(start, end);
}

test('active geometry session is focused instead of being replaced', () => {
  const source = sourceBetween('function getActiveGeometrySession()', '// ─── БЛОКИРОВКА ПЕРЕМЕЩЕНИЯ ОБЪЕКТОВ');
  const calls = [];
  const context = vm.createContext({
    currentTrackEdit: null,
    currentTrackDraw: { isNew: true },
    currentRouteDraw: null,
    currentRouteSession: null,
    setMode: mode => calls.push(['mode', mode]),
    openModal: modal => calls.push(['modal', modal]),
    showToast: message => calls.push(['toast', message])
  });
  vm.runInContext(source, context);

  assert.equal(context.focusActiveGeometrySession(), true);
  assert.deepEqual(calls.slice(0, 2), [['mode', 'track'], ['modal', 'modal-tracks']]);
  assert.match(calls[2][1], /завершите или отмените рисование трека/);
});

test('all geometry entry points use the active-session guard', () => {
  for (const [start, end] of [
    ['function startNewTrack()', 'function addTrackPoint'],
    ['function startTrackEdit()', 'function finishTrackEdit'],
    ['function continueSelectedTrack()', 'function deleteSelectedTrack'],
    ['function startNewRoute()', 'function startRouteEdit'],
    ['function startRouteEdit(', 'function addRoutePoint']
  ]) {
    assert.match(sourceBetween(start, end), /focusActiveGeometrySession\(\)/, start);
  }
});

test('route double-click cleanup removes only the duplicate endpoint', () => {
  const source = sourceBetween('function removeDuplicateRouteDoubleClickPoint()', 'function finishRouteDraw()');
  const route = {
    points: [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 22, y: 22 }],
    labels: ['A', 'B', 'B'],
    pointRadii: [0, 0, 0],
    pointWaypointIds: [null, null, null]
  };
  const context = vm.createContext({
    currentRouteDraw: route,
    map: { latLngToContainerPoint: point => ({ distanceTo: other => Math.hypot(point.x - other.x, point.y - other.y) }) },
    removeRouteBuildPoint: index => {
      route.points.splice(index, 1);
      route.labels.splice(index, 1);
      route.pointRadii.splice(index, 1);
      route.pointWaypointIds.splice(index, 1);
    }
  });
  vm.runInContext(source, context);

  assert.equal(context.removeDuplicateRouteDoubleClickPoint(), true);
  assert.equal(route.points.length, 2);
  assert.deepEqual(route.labels, ['A', 'B']);
});

test('stale temporary layers are not considered current', () => {
  const source = sourceBetween('function isCurrentTemporaryMapLayer(', 'function hideAllWorkObjects()');
  const currentSearch = {};
  const context = vm.createContext({
    rulerLines: [],
    rulerMarkers: [],
    searchMarker: currentSearch,
    dlSelectRect: null,
    dlPolygonShape: null,
    dlPolygonMarkers: []
  });
  vm.runInContext(source, context);

  assert.equal(context.isCurrentTemporaryMapLayer(currentSearch), true);
  assert.equal(context.isCurrentTemporaryMapLayer({}), false);
});

test('empty GPX dashArray remains a solid route', () => {
  const source = sourceBetween('function routeDashArrayFromGpx(', 'function parsePositiveNumber');
  const context = vm.createContext({ xmlExtensionNode: root => root.node });
  vm.runInContext(source, context);

  assert.equal(context.routeDashArrayFromGpx({ node: { textContent: '' } }), '');
  assert.equal(context.routeDashArrayFromGpx({ node: null }), '8 4');
});

test('irreversible clears invalidate undo and draft routes stay out of state', () => {
  assert.match(sourceBetween('function clearCurrentData()', 'function removeWaypointList'), /undoStack\.length = 0/);
  assert.match(sourceBetween('function clearSelectedDataConfirmed()', 'function applyState'), /undoStack\.length = 0/);
  assert.match(sourceBetween('function collectState(', 'function readLocalState'), /routes\.filter\(r => !r\.isNew && r\.points\?\.length >= 2\)/);
});

test('completed and cancelled geometry changes are persisted immediately', () => {
  for (const [start, end] of [
    ['function cancelTrackDraw()', 'function renameTrack'],
    ['function finishTrackEdit()', 'function cancelTrackEdit'],
    ['function cancelTrackEdit()', 'function deleteSelectedTrackPoint'],
    ['function finishRouteDraw()', 'function cancelRouteDraw'],
    ['function cancelRouteDraw()', 'function routeLen']
  ]) {
    assert.match(sourceBetween(start, end), /saveState\(\)/, start);
  }
});
