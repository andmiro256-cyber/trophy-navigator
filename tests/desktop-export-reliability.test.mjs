import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

function makeExportContext(save) {
  const files = new Map();
  const directories = new Set(['C:\\Users\\Test\\Documents\\TrophyNavigator']);
  const toasts = [];
  const confirmations = [];
  const localStorageValues = new Map();
  const fsApi = {
    async exists(target) {
      return directories.has(target) || files.has(target);
    },
    async mkdir(target) {
      directories.add(target);
    },
    async readTextFile(target) {
      if (!files.has(target)) throw new Error('not found');
      return files.get(target);
    },
    async writeTextFile(target, value) {
      files.set(target, value);
    }
  };
  const context = vm.createContext({
    console: { warn() {}, log() {} },
    Date,
    Promise,
    setTimeout,
    clearTimeout,
    document: { hasFocus: () => true },
    localStorage: {
      getItem: key => localStorageValues.get(key) ?? null,
      setItem: (key, value) => localStorageValues.set(key, value),
      removeItem: key => localStorageValues.delete(key)
    },
    showToast: (message, type) => toasts.push({ message, type }),
    tndConfirm: (message, title) => {
      confirmations.push({ message, title });
      return Promise.resolve(true);
    },
    initWorkingDirectory: async () => 'C:\\Users\\Test\\Documents\\TrophyNavigator',
    window: {
      __TAURI__: {
        dialog: { save },
        fs: fsApi,
        path: {
          join: async (...parts) => path.win32.join(...parts),
          dirname: async target => path.win32.dirname(target),
          basename: async target => path.win32.basename(target)
        }
      }
    }
  });

  let exportSource = sourceBetween('let exportSaveInFlight = false;', 'function downloadTextFallback');
  exportSource = exportSource
    .replace('const EXPORT_DIALOG_TIMEOUT_MS = 30000;', 'const EXPORT_DIALOG_TIMEOUT_MS = 20;')
    .replace('const EXPORT_DIALOG_HARD_TIMEOUT_MS = 90000;', 'const EXPORT_DIALOG_HARD_TIMEOUT_MS = 60;')
    .replace('const EXPORT_DIALOG_WATCHDOG_POLL_MS = 250;', 'const EXPORT_DIALOG_WATCHDOG_POLL_MS = 2;');
  vm.runInContext(`
    var appDataPath = 'C:\\\\Users\\\\Test\\\\Documents\\\\TrophyNavigator';
    var lastSaveDir;
    ${exportSource}
  `, context);
  return { context, files, toasts, confirmations };
}

function backupFiles(files) {
  return [...files.keys()].filter(target => /\\backup\\export-[^\\]+$/.test(target));
}

test('slow visible native dialog resolves before the hard deadline', async () => {
  const { context } = makeExportContext(() => Promise.resolve(null));
  const slowDialog = new Promise(resolve => setTimeout(() => resolve('C:\\chosen\\slow.gpx'), 45));
  const { outcome } = await context.waitForExportDialog(slowDialog, {
    timeoutMs: 10,
    pollMs: 2,
    isHostFocused: () => false
  });
  assert.equal(outcome.status, 'resolved');
  assert.equal(outcome.path, 'C:\\chosen\\slow.gpx');
});

test('hard deadline backs up and unlocks when an unresolved dialog keeps host unfocused', async () => {
  let call = 0;
  const { context, files } = makeExportContext(() => {
    call += 1;
    if (call === 1) return new Promise(() => {});
    return Promise.resolve('C:\\chosen\\after-hard-timeout.gpx');
  });
  context.document.hasFocus = () => false;

  await context.downloadText('tnd-export.gpx', 'application/gpx+xml', '<gpx>hard-timeout</gpx>');
  assert.equal(backupFiles(files).length, 1);
  assert.match(
    files.get('C:\\Users\\Test\\Documents\\TrophyNavigator\\export.log'),
    /"reason":"hard_deadline"/
  );

  context.document.hasFocus = () => true;
  await context.downloadText('tnd-export.gpx', 'application/gpx+xml', '<gpx>unlocked</gpx>');
  assert.equal(files.get('C:\\chosen\\after-hard-timeout.gpx'), '<gpx>unlocked</gpx>');
  assert.equal(call, 2);
});

test('hung dialog creates a verified backup and releases single-flight', async () => {
  let call = 0;
  const { context, files, confirmations } = makeExportContext(() => {
    call += 1;
    if (call === 1) return new Promise(() => {});
    return Promise.resolve('C:\\chosen\\second.gpx');
  });

  await context.downloadText('tnd-export.gpx', 'application/gpx+xml', '<gpx>first</gpx>');
  const backups = backupFiles(files);
  assert.equal(backups.length, 1);
  assert.equal(files.get(backups[0]), '<gpx>first</gpx>');
  assert.match(confirmations[0].message, /TrophyNavigator\\backup\\export-gpx-/);
  const exportLog = files.get('C:\\Users\\Test\\Documents\\TrophyNavigator\\export.log');
  assert.doesNotMatch(exportLog, /C:\\|Users|Documents|<gpx>/);

  await context.downloadText('tnd-export.gpx', 'application/gpx+xml', '<gpx>second</gpx>');
  assert.equal(files.get('C:\\chosen\\second.gpx'), '<gpx>second</gpx>');
  assert.equal(call, 2);
});

test('late dialog choice is saved when no newer export started', async () => {
  let resolveDialog;
  const { context, files } = makeExportContext(() => new Promise(resolve => { resolveDialog = resolve; }));

  await context.downloadText('tnd-export.gpx', 'application/gpx+xml', '<gpx>late</gpx>');
  assert.equal(backupFiles(files).length, 1);
  resolveDialog('C:\\chosen\\late.gpx');
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(files.get('C:\\chosen\\late.gpx'), '<gpx>late</gpx>');
});

test('late dialog choice is ignored after a newer export starts', async () => {
  let resolveFirstDialog;
  let call = 0;
  const { context, files } = makeExportContext(() => {
    call += 1;
    if (call === 1) return new Promise(resolve => { resolveFirstDialog = resolve; });
    return Promise.resolve('C:\\chosen\\new.gpx');
  });

  await context.downloadText('tnd-export.gpx', 'application/gpx+xml', '<gpx>old</gpx>');
  await context.downloadText('tnd-export.gpx', 'application/gpx+xml', '<gpx>new</gpx>');
  resolveFirstDialog('C:\\chosen\\stale.gpx');
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(files.get('C:\\chosen\\new.gpx'), '<gpx>new</gpx>');
  assert.equal(files.has('C:\\chosen\\stale.gpx'), false);
});

test('finishing a new drawn track makes it persistable immediately', () => {
  const functionSource = sourceBetween('function finishTrackDraw()', 'function cancelTrackDraw()');
  const track = { id: 7, name: 'Трек 7', points: [{}, {}], isNew: true };
  let saveCalls = 0;
  let countRefreshes = 0;
  const context = vm.createContext({
    currentTrackDraw: track,
    currentTrackSnapshot: {},
    selectedTrackId: null,
    touchTrack() {},
    setTrackEditingVisualState() {},
    syncTrackMarkers() {},
    setMode() {},
    updateTrackList() {},
    updateSyncCounts: () => { countRefreshes += 1; },
    saveState: () => { saveCalls += 1; },
    openModal() {},
    showToast() {},
    trackLen: () => 1,
    document: { getElementById: () => ({ style: {} }) }
  });
  vm.runInContext(functionSource, context);
  context.finishTrackDraw();

  assert.equal(track.isNew, false);
  assert.equal([track].filter(item => !item.isNew).length, 1);
  assert.equal(saveCalls, 1);
  assert.equal(countRefreshes, 1);
});

test('sync push summary keeps accepted zero counts visible', () => {
  const functionSource = sourceBetween('function formatSyncPushCounts', 'async function checkSyncServerInfo');
  const context = vm.createContext({});
  vm.runInContext(functionSource, context);
  const summary = context.formatSyncPushCounts({
    waypoints: { count: 59 },
    tracks: { count: 0 },
    routes: { count: 1 },
    gpx: { count: 0 }
  }, { waypoints: true, tracks: true, routes: true, gpx: true });
  assert.equal(summary, 'точки: 59, треки: 0, маршруты: 1, GPX: 0');
});
