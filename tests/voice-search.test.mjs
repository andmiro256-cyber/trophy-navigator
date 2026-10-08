// Поиск по скачанным картам и голосовой поиск (ui/tn-voice.js): фраза → запрос, падежи, звучание,
// нечёткое совпадение. Строки «как распознал Whisper» — из прогона модели base на синтезированных
// фразах (09.10): «Солочя», «Салотча», «деревни у шмор», «Найди с по склипике», «Поехали в косимов!», «Тома».
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../ui/tn-voice.js', import.meta.url), 'utf8');
function boot(places = {}, center = { lat: 54.62, lng: 39.72 }) {
  const ctx = { console, setTimeout, clearTimeout, Promise, Map, Set,
    document: { readyState: 'complete', querySelector: () => null, getElementById: () => null, head: { appendChild() {} }, addEventListener() {} },
    map: { getCenter: () => center } };
  ctx.window = ctx;
  ctx.TrophyNavMaps = { _state: { local: Object.keys(places).map(id => ({ id })) } };
  ctx.__TAURI_INTERNALS__ = { invoke: async (cmd, a) => { if (cmd === 'tnmaps_places') return places[a.id] || []; throw new Error(cmd); } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  ctx.TnPlaces.__ctx = ctx;
  return ctx.TnPlaces;
}
const P = (n, lat, lon, c = 'village', l = 'place') => ({ n, lat, lon, c, l });
const RYAZAN = [P('Солотча', 54.8012, 39.8387, 'suburb'), P('Касимов', 54.9397, 41.3952, 'town'), P('Спас-Клепики', 55.1309, 40.1761, 'town'),
  P('Ушмор', 55.1783, 40.1051), P('Тума', 55.1464, 40.5502, 'town'), P('Тумская', 55.2, 40.6), P('Солотчинский', 54.9, 39.9, 'locality', 'outdoor'),
  P('Рязань', 54.6292, 39.7351, 'city'), P('Сасово', 54.35, 41.92, 'town'), P('Кимов', 54.0, 40.0)];

test('фраза → запрос: команды, предлоги и слова «деревня/село» уходят', () => {
  const T = boot();
  assert.equal(T.cleanPhrase('Поехали в косимов!'), 'косимов');
  assert.equal(T.cleanPhrase('деревни у шмор.'), 'у шмор');
  assert.equal(T.cleanPhrase('Найди с по склипике'), 'с по склипике');
  assert.equal(T.cleanPhrase('Солочя.'), 'солочя');
  assert.equal(T.cleanPhrase('найди деревню Ушмор'), 'ушмор');
  assert.equal(T.cleanPhrase('В'), 'в', 'одно слово не выбрасываем целиком');
});

test('падежи последнего слова', () => {
  const T = boot();
  assert.ok(T.caseVariants('солотчу').includes('солотча'));
  assert.ok(T.caseVariants('касимове').includes('касимов'));
  assert.ok(T.caseVariants('касимова').includes('касимов'));
});

test('звучание: ошибки распознавания сходятся с названием', () => {
  const T = boot();
  assert.ok(T.similarity('солочя', 'Солотча') >= 0.8, String(T.similarity('солочя', 'Солотча')));
  assert.ok(T.similarity('салотча', 'Солотча') >= 0.95);
  assert.ok(T.similarity('у шмор', 'Ушмор') >= 0.95);
  assert.ok(T.similarity('с по склипике', 'Спас-Клепики') >= 0.8, String(T.similarity('с по склипике', 'Спас-Клепики')));
  assert.ok(T.similarity('косимов', 'Касимов') >= 0.95);
  assert.ok(T.similarity('солочя', 'Сасово') < 0.7);
});

test('поиск по скачанной карте: распознанные фразы находят нужное место первым', async () => {
  const T = boot({ ryazan: RYAZAN });
  const first = async q => (await T.searchLocal(q, { limit: 3 }))[0]?.name;
  assert.equal(await first('Солочя.'), 'Солотча');
  assert.equal(await first('Салотча'), 'Солотча');
  assert.equal(await first('деревни у шмор.'), 'Ушмор');
  assert.equal(await first('Найди с по склипике'), 'Спас-Клепики');
  assert.equal(await first('Поехали в косимов!'), 'Касимов');
  assert.equal(await first('Тома'), 'Тума');
  assert.equal(await first('рязань'), 'Рязань');
  assert.equal((await T.searchLocal('ыыыыы')).length, 0);
  // обзорная карта страны — не источник названий
  const T2 = boot({ 'russia-overview': [P('Солотча', 1, 1)] });
  assert.equal((await T2.searchLocal('Солотча')).length, 0);
});

test('голос: распознанная фраза ставит в строку поиска название с карты', async () => {
  const T = boot({ ryazan: RYAZAN });
  const input = { value: '', events: [], dispatchEvent(e) { this.events.push(e.type); } };
  const g = T.__ctx;
  g.document.getElementById = id => (id === 'search-input' ? input : null);
  g.Event = class { constructor(t) { this.type = t; } };
  g.showToast = () => {};
  await T._applyPhrase('Найди с по склипике');
  assert.equal(input.value, 'Спас-Клепики');
  assert.deepEqual(input.events, ['input']);
  await T._applyPhrase('Поехали в Нижнеудинск');
  assert.equal(input.value, 'Нижнеудинск', 'нет на карте — очищенная фраза для онлайн-поиска');
});
