// Поиск по адресу: Photon основной, Nominatim запасной (Nominatim отвечает 403 на запросы из российских
// сетей — поиск молча ничего не находил). Функции вырезаются из index.html и гоняются в vm с поддельным fetch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
const start = html.indexOf('const GEOCODE_TIMEOUT_MS');
const end = html.indexOf('async function nominatimSearch');
const code = html.slice(start, end);
function setup(handler) {
  const urls = [];
  const ctx = { setTimeout, clearTimeout, AbortController, console,
    tnMap: { getCenter: () => ({ lat: 54.62, lng: 39.72 }) },
    fetch: async url => { urls.push(url); return handler(url); } };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.geocode = geocode;', ctx);
  return { geocode: ctx.geocode, urls };
}
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
const photon = { features: [
  { geometry: { coordinates: [39.8387, 54.8012] }, properties: { name: 'Солотча', city: 'Рязань', state: 'Рязанская область', country: 'Россия' } },
  { geometry: { coordinates: [1, 2] }, properties: {} },
] };

test('Photon: найдено, имя для списка, приоритет около центра карты', async () => {
  const { geocode, urls } = setup(url => (url.includes('photon') ? json(200, photon) : json(500, [])));
  const r = JSON.parse(JSON.stringify(await geocode('Солотча', 5)));
  assert.deepEqual(r, [{ lat: 54.8012, lon: 39.8387, display_name: 'Солотча, Рязань, Рязанская область, Россия' }]);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /^https:\/\/photon\.komoot\.io\/api\/\?q=%D0%A1.*&limit=5&lang=default&lat=54\.6200&lon=39\.7200$/);
});

test('Photon недоступен → Nominatim; оба недоступны → ошибка с причинами', async () => {
  const nom = [{ lat: '54.6', lon: '39.7', display_name: 'Рязань, Россия' }];
  let s = setup(url => (url.includes('photon') ? json(502, {}) : json(200, nom)));
  assert.equal((await s.geocode('Рязань', 1))[0].display_name, 'Рязань, Россия');
  assert.match(s.urls[1], /nominatim\.openstreetmap\.org\/search\?q=.*&limit=1&accept-language=ru/);
  s = setup(url => (url.includes('photon') ? Promise.reject(new Error('сеть')) : json(403, 'Access denied')));
  await assert.rejects(s.geocode('Рязань'), e => e.geocodeFailed && /сеть/.test(e.message) && /Nominatim 403/.test(e.message));
});

test('index.html: оба места поиска идут через geocode, ошибка понятная', () => {
  assert.match(html, /const onlineP = geocode\(query, 5\)/);
  assert.match(html, /const data = await geocode\(val, 1\);/);
  assert.equal((html.match(/nominatim\.openstreetmap\.org\/search/g) || []).length, 1);
  assert.match(html, /Нет связи с сервисом поиска, а на скачанных картах такого названия нет\./);
});
