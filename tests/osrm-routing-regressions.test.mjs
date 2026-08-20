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

function makeRoutingContext(options = {}) {
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
    hasLayer(layer) { return !!layer?.onMap; },
    removeLayer(layer) { if (layer) layer.onMap = false; this.layers.delete(layer); },
    getContainer() { return container; }
  };
  const layer = (type, data = {}) => ({
    type,
    ...data,
    addTo(target) { this.onMap = true; target.layers.add(this); return this; },
    bindTooltip(content, tooltipOptions) { this.tooltip = { content, options: tooltipOptions }; return this; },
    setStyle(style) { this.style = { ...(this.style || {}), ...style }; return this; },
    bringToFront() { this.broughtToFront = true; return this; }
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
        addTo(target) { this.onMap = true; target.layers.add(this); return this; }
      };
    }
  };
  const toasts = [];
  let context;
  context = vm.createContext({
    L,
    map,
    osrmState: { items: [], activeId: null, nextId: 1 },
    routePickMode: null,
    dlPolygonMode: false,
    workObjectsVisibilitySnapshot: null,
    currentMode: 'hand',
    document: { getElementById: id => element(id) },
    fetch: options.fetch,
    console,
    escapeHtml: value => String(value),
    focusActiveGeometrySession: () => false,
    cancelAreaSelect() { context.dlPolygonMode = false; },
    ensureWorkObjectsVisibleForEditing() {},
    setMode() {},
    syncOsrmRouteLayer() {},
    selectOsrmRoute(id) {
      context.osrmState.activeId = id;
      context.osrmState.items.forEach(route => context.syncOsrmRouteLayer(route));
    },
    renderOsrmRouteList() {},
    showToast: message => toasts.push(message)
  });
  const endMarker = options.includeCalculation ? 'function setRoutePoint(' : 'async function calculateOsrmRoute() {';
  vm.runInContext(sourceBetween('let routeFromLatLng = null;', endMarker), context);
  if (options.includeCalculation) {
    vm.runInContext(sourceBetween('function shortRouteLabel(', 'function updateRoutingInfo()'), context);
  }
  return { context, elements, map, toasts };
}

test('changing map tool cancels pending OSRM selection before another map click', () => {
  const calls = [];
  let context;
  const emptyClassList = makeClassList();
  context = vm.createContext({
    currentMode: 'hand',
    routePickMode: 'A',
    modeNames: { waypoint: 'Добавить точку' },
    btnMap: { waypoint: 'btn-wpt' },
    document: {
      querySelectorAll: () => [],
      getElementById: id => id === 'sb-mode'
        ? { textContent: '' }
        : { classList: emptyClassList, closest: () => null }
    },
    map: { getContainer: () => ({ style: {} }) },
    cancelRoutePick() { calls.push('cancel'); context.routePickMode = null; },
    clearRuler() {},
    closeTransientMapModals() {},
    updateRulerPanel() {},
    showToast() {}
  });
  vm.runInContext(sourceBetween('function setMode(mode)', 'function toggleMode(mode)'), context);

  context.setMode('waypoint');

  assert.equal(context.routePickMode, null);
  assert.deepEqual(calls, ['cancel']);
  assert.match(sourceBetween('function trackGestureAllowed()', 'let trackHoverCheckedAt'), /!routePickMode/);
  assert.match(sourceBetween('function startAreaSelect()', 'function onDlEscape'), /cancelRoutePick\(\)/);
});

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
  const { context, elements, toasts } = makeRoutingContext();
  context.setOsrmEndpoint('A', { lat: 55.71, lng: 37.51 }, 'Точный старт');
  context.setOsrmEndpoint('B', { lat: 55.81, lng: 37.71 }, 'Точный финиш');

  const exact = vm.runInContext('routeFromLatLng', context);
  const resolved = await context.resolveEndpoint('route-from-input', exact);
  assert.equal(resolved, exact);

  context.osrmState.items.push({ id: 1 });
  context.swapRouteEndpoints();
  const swapped = vm.runInContext('({ from: routeFromLatLng, to: routeToLatLng })', context);
  assert.deepEqual({ ...swapped.from }, { lat: 55.81, lng: 37.71 });
  assert.deepEqual({ ...swapped.to }, { lat: 55.71, lng: 37.51 });
  assert.equal(elements.get('route-from-input').value, 'Точный финиш');
  assert.equal(elements.get('route-to-input').value, 'Точный старт');
  assert.equal(elements.get('route-draft-status').hidden, false);
  assert.match(toasts.at(-1), /нажмите «Построить»/);
});

test('successful OSRM build replaces the draft with exactly two active endpoint markers', async () => {
  const { context, map } = makeRoutingContext({
    includeCalculation: true,
    fetch: async () => ({
      json: async () => ({
        code: 'Ok',
        routes: [{
          geometry: { coordinates: [[37.51, 55.71], [37.61, 55.76], [37.71, 55.81]] },
          distance: 12500,
          duration: 900
        }]
      })
    })
  });
  context.setOsrmEndpoint('A', { lat: 55.71, lng: 37.51 }, 'Старт');
  context.setOsrmEndpoint('B', { lat: 55.81, lng: 37.71 }, 'Финиш');

  await context.calculateOsrmRoute();

  const state = vm.runInContext(`({
    count: osrmState.items.length,
    activeId: osrmState.activeId,
    suppressed: osrmDraftSuppressed,
    draftLayers: osrmDraftLayer.getLayers().length,
    draftOnMap: map.hasLayer(osrmDraftLayer),
    markersOnMap: map.hasLayer(osrmState.items[0].markersLayer),
    route: osrmState.items[0]
  })`, context);
  assert.equal(state.count, 1);
  assert.equal(state.activeId, state.route.id);
  assert.equal(state.suppressed, true);
  assert.equal(state.draftLayers, 0);
  assert.equal(state.draftOnMap, false);
  assert.equal(state.route.markersLayer.getLayers().length, 2);
  assert.equal(state.markersOnMap, true);
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
