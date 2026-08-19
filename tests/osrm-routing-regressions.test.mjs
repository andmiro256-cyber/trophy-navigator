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

function makeClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    contains: name => values.has(name),
    toggle(name, force) {
      const next = force ?? !values.has(name);
      if (next) values.add(name);
      else values.delete(name);
      return next;
    }
  };
}

function makeRoutingContext() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const listeners = {};
      elements.set(id, {
        id,
        value: '',
        textContent: '',
        classList: makeClassList(),
        addEventListener(type, handler) { listeners[type] = handler; },
        listeners
      });
    }
    return elements.get(id);
  };
  [
    'route-pick-a', 'route-pick-b', 'route-pick-hint', 'route-pick-hint-text',
    'route-from-input', 'route-to-input'
  ].forEach(element);

  const container = { classList: makeClassList() };
  const map = {
    layers: new Set(),
    listeners: {},
    on(type, handler) { this.listeners[type] = handler; },
    hasLayer(layer) { return this.layers.has(layer); },
    removeLayer(layer) { this.layers.delete(layer); },
    getContainer() { return container; }
  };
  const layer = (type, data = {}) => ({
    type,
    ...data,
    addTo(target) { target.layers.add(this); return this; }
  });
  const L = {
    latLng(first, second) {
      if (typeof first === 'object') return { lat: Number(first.lat), lng: Number(first.lng) };
      return { lat: Number(first), lng: Number(second) };
    },
    divIcon: options => ({ type: 'icon', options }),
    marker: (latlng, options) => layer('marker', { latlng, options }),
    polyline: (latlngs, options) => layer('polyline', { latlngs, options }),
    layerGroup(initial = []) {
      return {
        type: 'group',
        layers: [...initial],
        clearLayers() { this.layers = []; return this; },
        addLayer(item) { this.layers.push(item); return this; },
        getLayers() { return this.layers; },
        addTo(target) { target.layers.add(this); return this; }
      };
    }
  };
  const toasts = [];
  const context = vm.createContext({
    L,
    map,
    osrmState: { items: [] },
    workObjectsVisibilitySnapshot: null,
    currentMode: 'hand',
    document: { getElementById: id => element(id) },
    focusActiveGeometrySession: () => false,
    ensureWorkObjectsVisibleForEditing() {},
    setMode() {},
    syncOsrmRouteLayer() {},
    showToast: message => toasts.push(message)
  });
  vm.runInContext(sourceBetween('let routeFromLatLng = null;', 'async function calculateOsrmRoute() {'), context);
  return { context, elements, map, toasts };
}

test('map picking shows start immediately, advances to finish and draws a draft connector', () => {
  const { context, elements, map } = makeRoutingContext();
  context.startRoutePick('A');
  map.listeners.click({ latlng: { lat: 55.75, lng: 37.61 } });

  let state = vm.runInContext('({ mode: routePickMode, from: routeFromLatLng, to: routeToLatLng, layers: osrmDraftLayer.getLayers() })', context);
  assert.equal(state.mode, 'B');
  assert.deepEqual({ ...state.from }, { lat: 55.75, lng: 37.61 });
  assert.equal(state.to, null);
  assert.equal(state.layers.length, 1);
  assert.equal(state.layers[0].type, 'marker');
  assert.equal(elements.get('route-pick-hint-text').textContent, 'Выберите ФИНИШ на карте');

  map.listeners.click({ latlng: { lat: 55.78, lng: 37.67 } });
  state = vm.runInContext('({ mode: routePickMode, from: routeFromLatLng, to: routeToLatLng, layers: osrmDraftLayer.getLayers() })', context);
  assert.equal(state.mode, null);
  assert.deepEqual({ ...state.to }, { lat: 55.78, lng: 37.67 });
  assert.deepEqual(state.layers.map(item => item.type), ['polyline', 'marker', 'marker']);
  assert.equal(elements.get('route-pick-hint').classList.contains('open'), false);
});

test('swapping endpoints moves coordinates and exact selected coordinates survive labels', async () => {
  const { context, elements } = makeRoutingContext();
  context.setOsrmEndpoint('A', { lat: 55.71, lng: 37.51 }, 'Точный старт');
  context.setOsrmEndpoint('B', { lat: 55.81, lng: 37.71 }, 'Точный финиш');

  const exact = vm.runInContext('routeFromLatLng', context);
  const resolved = await context.resolveEndpoint('route-from-input', exact);
  assert.equal(resolved, exact);

  context.swapRouteEndpoints();
  const swapped = vm.runInContext('({ from: routeFromLatLng, to: routeToLatLng })', context);
  assert.deepEqual({ ...swapped.from }, { lat: 55.81, lng: 37.71 });
  assert.deepEqual({ ...swapped.to }, { lat: 55.71, lng: 37.51 });
  assert.equal(elements.get('route-from-input').value, 'Точный финиш');
  assert.equal(elements.get('route-to-input').value, 'Точный старт');
});

test('manual endpoint edits invalidate stale coordinates and cleanup removes draft layers', () => {
  const { context, elements, map } = makeRoutingContext();
  context.setOsrmEndpoint('A', { lat: 55.71, lng: 37.51 });
  context.setOsrmEndpoint('B', { lat: 55.81, lng: 37.71 });
  elements.get('route-from-input').listeners.input();

  let state = vm.runInContext('({ from: routeFromLatLng, to: routeToLatLng, layers: osrmDraftLayer.getLayers() })', context);
  assert.equal(state.from, null);
  assert.deepEqual({ ...state.to }, { lat: 55.81, lng: 37.71 });
  assert.equal(state.layers.length, 1);

  context.resetOsrmEndpointDraft();
  state = vm.runInContext('({ from: routeFromLatLng, to: routeToLatLng, layer: osrmDraftLayer })', context);
  assert.equal(state.from, null);
  assert.equal(state.to, null);
  assert.equal(state.layer.getLayers().length, 0);
  assert.equal(map.hasLayer(state.layer), false);
});

test('OSRM endpoint visuals are integrated with route lifecycle and map-wide cleanup', () => {
  assert.match(html, /СТАРТ/);
  assert.match(html, /ФИНИШ/);
  assert.match(html, /if \(id === 'modal-routing'[^\n]+cancelRoutePick\(\)/);
  assert.match(html, /getOsrmDraftTemporaryLayer\(\) === layer/);
  assert.match(html, /if \(getOsrmDraftTemporaryLayer\(\)\) resetOsrmEndpointDraft\(\)/);
  assert.match(html, /isActive && !getOsrmDraftTemporaryLayer\(\)/);
  assert.match(html, /osrmDraftSuppressed = true;\s*syncOsrmDraftEndpoints\(\)/);
  assert.match(html, /function fitOsrmRouteOnMap\(route\)/);
  assert.match(html, /paddingBottomRight: \[rightOcclusion, 40\]/);
  assert.match(html, /aria-label="Выбрать старт на карте"/);
});
