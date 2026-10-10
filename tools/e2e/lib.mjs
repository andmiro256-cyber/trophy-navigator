// Общее для сквозных сценариев (tools/e2e/*-scenario.mjs): локальный сервер ui/, системный Chrome через
// playwright-core из tools/golden, фиксированные время и случайность, без внешней сети.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../golden/package.json', import.meta.url));
const { chromium } = require('playwright-core');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.pbf': 'application/x-protobuf', '.gpx': 'application/gpx+xml' };

/** Поднять сервер для каталога ui (и доп. файлов extra: {'/_e2e/x.gpx': '/abs/path'}), открыть страницу. */
export async function open(uiDir, { extra = {}, viewport = { width: 1400, height: 900 } } = {}) {
  const UI = path.resolve(uiDir);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const p = extra[url] || path.join(UI, url);
    if ((!extra[url] && !p.startsWith(UI)) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport, locale: 'ru-RU', timezoneId: 'UTC' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await ctx.addInitScript(() => {
    const T0 = Date.parse('2026-01-02T03:04:05.000Z'); const RealDate = Date; let tick = 0;
    globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [T0 + tick++])); } static now() { return T0 + tick++; } };
    let s = 0x934; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    try { localStorage.clear(); } catch {}
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/index.html`);
  await page.waitForTimeout(1500);
  const ev = (f, arg) => page.evaluate(f, arg);
  await ev(() => {
    document.getElementById('onboarding-overlay')?.remove();
    document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m.id));
  });
  const close = async () => { await browser.close(); server.close(); };
  return { page, ev, base, errors, close };
}

/** Экранная точка (клиентские px) для latlng карты. */
export function screenOf(ev, ll) {
  return ev(ll => { const p = map.latLngToContainerPoint(ll); const r = map.getContainer().getBoundingClientRect(); return [Math.round(r.left + p.x), Math.round(r.top + p.y)]; }, ll);
}
