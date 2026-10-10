import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ui = resolve(process.env.GOLDEN_UI || `${root}/ui`);
const fixtures = `${root}/tests/fixtures/map`;
const output = resolve(process.env.GOLDEN_OUT || `${root}/tests/golden/0.9.34`);
const ids = ['F1','F2','F3','F4','F5','F6','F7','F11','F16'];
const server = createServer(async (req, res) => {
  try {
    const path = resolve(ui, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
    if (!path.startsWith(ui + '/')) { res.writeHead(403).end(); return; }
    const data = await readFile(path);
    res.setHeader('Content-Type', {'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(path)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const files = [];
async function emit(id, name, content) {
  const path = `${output}/${id}/${name}`;
  await mkdir(dirname(path), {recursive:true});
  await writeFile(path, content);
  files.push(`${id}/${name}`);
}
const json = value => JSON.stringify(value, (_, v) => typeof v === 'number' && !Number.isFinite(v) ? String(v) : v, 2) + '\n';
try {
  browser = await chromium.launch({channel:'chrome', executablePath:'/usr/bin/google-chrome', headless:true, args:['--no-sandbox']});
  for (const id of ids) {
    const scenario = JSON.parse(await readFile(`${fixtures}/${id}/scenario.json`, 'utf8'));
    const context = await browser.newContext({viewport:{width:1280,height:800}, timezoneId:'UTC', locale:'ru-RU', reducedMotion:'reduce'});
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    await context.addInitScript(() => {
      const RealDate = Date;
      const epoch = RealDate.parse('2026-01-02T03:04:05.000Z');
      class FixedDate extends RealDate { constructor(...args) { super(...(args.length ? args : [epoch])); } static now() { return epoch; } }
      window.Date = FixedDate;
      let seed = 0x934;
      window.__goldenResetRandom = () => { seed = 0x934; };
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      localStorage.setItem('tnd-device-id', 'golden-device');
    });
    const page = await context.newPage();
    await page.goto(origin, {waitUntil:'load'});
    await page.waitForFunction(() => typeof collectState === 'function' && typeof loadGPXTracks === 'function' && statePersistenceReady);
    await page.evaluate(() => {
      map.stop(); map.setView([55.75,37.62],10,{animate:false});
      clearCurrentData(); waypointSetIdCounter = 1;
      window.__goldenResetRandom();
      window.__goldenDownloads = [];
      window.downloadText = (name, mime, text) => {
        const content = typeof text === 'function' ? text() : text;
        if (typeof content !== 'string') throw new Error('Non-text export: ' + name);
        window.__goldenDownloads.push({name,mime,content});
        return Promise.resolve({ok:true});
      };
    });
    for (const item of scenario.imports) {
      const buffer = await readFile(`${fixtures}/${id}/${item.file}`);
      const text = new TextDecoder(item.encoding || 'utf-8').decode(buffer);
      await page.evaluate(({loader,text,file}) => {
        const fn = window[loader];
        if (typeof fn !== 'function') throw new Error('Missing loader ' + loader);
        fn(text,file,{silent:true});
        map.stop(); map.setView([55.75,37.62],10,{animate:false});
      }, {...item,text});
    }
    await page.evaluate(() => { undoStack.length = 0; });
    const snap = () => page.evaluate(() => { map.stop(); map.setView([55.75,37.62],10,{animate:false}); const state = collectState(); state.savedAt = '2026-01-02T03:04:05.000Z'; return state; });
    const loadedState = await snap();
    for (const key of ['waypoints','tracks','routes']) {
      if (Number.isInteger(scenario.assertions?.[key]) && loadedState[key].length !== scenario.assertions[key]) throw new Error(`${id}: expected ${scenario.assertions[key]} ${key}, got ${loadedState[key].length}`);
    }
    if (scenario.assertions?.trackPointCounts && json(loadedState.tracks.map(t => t.points.length)) !== json(scenario.assertions.trackPointCounts)) throw new Error(id + ': wrong point counts');
    if (scenario.assertions?.linkedRoutePoints) {
      const ids = new Set(loadedState.waypoints.map(w => w.id));
      const linked = loadedState.routes.flatMap(r => r.pointWaypointIds).filter(id => ids.has(id)).length;
      if (linked !== scenario.assertions.linkedRoutePoints) throw new Error(id + ': route waypoint links missing');
    }
    if (scenario.assertions?.allPointsHaveEleAndTime && !loadedState.tracks.every(t => t.pointsData.every(p => p.ele != null && p.time))) throw new Error(id + ': timed/elevation points missing');
    if (scenario.assertions?.sourceSegments) {
      const segments = loadedState.tracks.reduce((n,t) => n + 1 + t.pointsData.filter(p => p.seg).length, 0);
      if (segments !== scenario.assertions.sourceSegments.reduce((n,s) => n+s,0)) throw new Error(id + ': source segment boundaries lost');
    }
    await emit(id,'state-loaded.json',json(loadedState));
    const results = [];
    for (const [index, action] of (scenario.actions || []).flatMap(a => Array.from({length:a.op === 'undo' ? (a.count || 1) : 1}, () => a)).entries()) {
      const result = await page.evaluate(async a => {
        const wp = waypoints[a.index ?? 0];
        const track = tracks[a.trackIndex ?? a.index ?? 0];
        switch (a.op) {
          case 'renameWaypoint': {
            openQuickRename(wp);
            document.getElementById(`wp-rename-${wp.wpData.num}`).value = a.name || 'КП renamed';
            applyQuickRename(wp.wpData.num); break;
          }
          case 'moveWaypoint': {
            wp.setLatLng([a.lat ?? wp.wpData.lat + 0.0001, a.lng ?? wp.wpData.lng + 0.0001]);
            wp.fire('drag'); wp.fire('dragend'); break;
          }
          case 'hideWaypointSet': toggleSetVisibility(waypointSets[a.index ?? 0].id); break;
          case 'hideTrack': toggleTrackVisible(track.id); break;
          case 'deleteWaypoint': ctxTarget = wp; await ctxAction('delete'); break;
          case 'moveTrackPoint': {
            selectedTrackId = track.id; startTrackEdit();
            const point = track.points[a.pointIndex ?? 1];
            const target = L.latLng(a.lat ?? point.lat + 0.0001, a.lng ?? point.lng + 0.0001);
            const p = map.latLngToContainerPoint(target);
            const rect = map.getContainer().getBoundingClientRect();
            beginTrackPointDrag(track, a.pointIndex ?? 1);
            map.fire('mousemove',{latlng:target,originalEvent:{clientX:p.x+rect.left,clientY:p.y+rect.top}});
            map.fire('mouseup'); finishTrackEdit(); break;
          }
          case 'splitTrack':
            selectedTrackId = track.id; startTrackEdit();
            currentTrackEdit.selectedPointIdx = a.pointIndex ?? 2;
            splitSelectedTrackPoint(); break;
          case 'joinTracks': return {op:a.op,status:'unsupported',reason:'0.9.34 has no track join function or undo action'};
          case 'undo':
            if (!undoStack.length) return {op:a.op,status:'unsupported',reason:'Undo stack empty (join unavailable)'};
            undoLastAction(); break;
          default: throw new Error('Unknown action ' + a.op);
        }
        return {op:a.op,status:'executed'};
      }, action);
      results.push(result);
      await emit(id,`state-step-${String(index+1).padStart(2,'0')}-${action.op}.json`,json(await snap()));
    }
    await emit(id,'scenario-results.json',json(results));
    const finalState = await snap();
    await emit(id,'state.json',json(finalState));
    // b6d3e0f's collectState map schema: center, zoom, layer.
    const legacyState = {...finalState, map:{center:finalState.map.center, zoom:finalState.map.zoom, layer:finalState.map.layer}};
    await emit(id,'state-legacy-schema.json',json(legacyState));
    if (id === 'F4' && (finalState.waypointSets.filter(s => s.visible === false).length !== 1 || finalState.tracks.filter(t => t.visible === false).length !== 1)) throw new Error('F4: hidden objects missing');
    if (id === 'F5') {
      const geometry = state => ({waypoints: state.waypoints.map(w => [w.id,w.lat,w.lng]).sort(), tracks:state.tracks.map(t => ({id:t.id,points:t.points,pointsData:t.pointsData}))});
      if (json(geometry(loadedState)) !== json(geometry(finalState))) throw new Error('F5: undo did not restore geometry');
    }
    const exports = await page.evaluate(async () => {
      const result = [];
      for (const fn of ['saveWaypointsGPX','saveWaypointsWPT','saveTracksGPX','saveTracksPLT','saveRoutesGPX','saveRoutesRTE']) {
        const start = __goldenDownloads.length;
        await window[fn]();
        result.push({fn,status:__goldenDownloads.length > start ? 'exported' : 'empty',downloads:__goldenDownloads.slice(start)});
      }
      return result;
    });
    for (const item of exports) for (const [i, download] of item.downloads.entries()) {
      await emit(id,`${item.fn}${i ? '-' + i : ''}${extname(download.name)}`,download.content);
    }
    await emit(id,'exports.json',json([...exports.map(({downloads,...r}) => r),{fn:'CSV',status:'unsupported',reason:'0.9.34 has no CSV export function'}]));
    if (id === 'F2' || id === 'F3') {
      const rr = await page.evaluate(() => {
        const track = tracks[0];
        if (!routes.length) throw new Error('Missing fixture route for RR');
        const route = routes[0];
        const hits = rrMatchTrackToRoute(track,route,30);
        const overall = rrAnalyzeSlice(track,0,track.points.length-1);
        const start = __goldenDownloads.length;
        // Use application's report generator (including segment calculations).
        document.getElementById('rr-select-track').innerHTML = `<option value="${track.id}">${track.name}</option>`;
        document.getElementById('rr-select-route').innerHTML = `<option value="${route.id}">${route.name}</option>`;
        rrGenerate();
        if (!rrData) throw new Error('Race Report did not generate');
        rrExportHTML();
        const {segments,raceTimeSec,missedCPs} = rrData;
        return {numbers:{hits,overall,segments,raceTimeSec,missedCPs},html:__goldenDownloads[start]?.content};
      });
      if (!rr.html) throw new Error(`${id}: missing RR HTML`);
      await emit(id,'rr.json',json(rr.numbers));
      await emit(id,'rrExportHTML.html',rr.html);
    }
    // Additive map fields have a separate application write/read/write check.
    const additive = {offline: finalState.map.offline, stack: finalState.map.stack};
    const roundTrip = await page.evaluate(state => {
      applyState(state); map.stop(); map.setView([55.75,37.62],10,{animate:false});
      return collectState();
    }, finalState);
    const restored = {offline: roundTrip.map.offline, stack: roundTrip.map.stack};
    if (json(additive) !== json(restored)) throw new Error(id + ': additive state round-trip changed');
    await emit(id,'state-additive-roundtrip.json',json({written:additive,restored}));
    await context.close();
    console.log(`${id}: generated`);
  }
  const actual = [];
  async function walk(dir) { for (const entry of await readdir(dir,{withFileTypes:true})) { const path = `${dir}/${entry.name}`; if (entry.isDirectory()) await walk(path); else if (entry.name !== 'MANIFEST.sha256') actual.push(relative(output,path)); } }
  await walk(output);
  if (actual.sort().join('\n') !== files.sort().join('\n')) throw new Error('Output directory contains stale/unexpected files; use a fresh GOLDEN_OUT');
  const manifest = [];
  for (const name of files) manifest.push(`${createHash('sha256').update(await readFile(`${output}/${name}`)).digest('hex')}  ${name}`);
  await writeFile(`${output}/MANIFEST.sha256`,manifest.join('\n')+'\n');
  console.log(`MANIFEST: ${files.length} files`);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
