// Тема Desktop = палитра Android. Цвета интерфейса записаны только в ui/theme.css;
// везде остальное — var(--…). Исключения — цвета данных (выбранные пользователем цвета
// точек/треков/маршрутов, значения по умолчанию для них, цвета на самой карте): такие строки
// помечены комментарием «theme-check: data», а блок экспорта отчёта — «theme-check: off … on».
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const html = read('../ui/index.html');
const themeCss = read('../ui/theme.css');
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

function block(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `в theme.css нет блока ${selector}`);
  return css.slice(start, css.indexOf('\n}', start));
}
function tokens(body) {
  const map = new Map();
  for (const m of body.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)) map.set(m[1], m[2].trim());
  return map;
}
const light = tokens(block(themeCss, ':root'));
const dark = tokens(block(themeCss, '[data-theme="dark"]'));

/** Строки с цветом, которые не являются данными и не стоят в отключённом блоке */
function leaks(source, name) {
  const out = [];
  let off = false;
  source.split('\n').forEach((line, i) => {
    if (line.includes('theme-check: off')) off = true;
    if (line.includes('theme-check: on')) { off = false; return; }
    if (off || line.includes('theme-check: data')) return;
    // значение <input type="color" value="#…"> — это данные пользователя
    const clean = line.replace(/<input\b[^>]*>/g, tag =>
      (/type="color"/.test(tag) || /id="live-group-color"/.test(tag)) ? tag.replace(/value="#[0-9a-fA-F]{3,8}"/, '') : tag);
    if (COLOR.test(clean)) out.push(`${name}:${i + 1}: ${line.trim().slice(0, 140)}`);
  });
  return out;
}

test('Android palette: the same base tokens in both themes, values from colors.xml', () => {
  const android = {
    // акцент — оранжевый сайта trophynav.ru (решение Andre 07.10), остальное — colors.xml Android
    '--primary': ['#C2541E', '#D9743F'], '--primary-variant': ['#A4441A', '#C2541E'],
    '--background': ['#E4E8EC', '#121212'], '--surface': ['#EFF2F5', '#1E1E1E'], '--surface-top': ['#DDE2E7', '#1A1A1A'],
    '--surface-tab': ['#D5DAE0', '#111111'], '--surface-variant': ['#E8ECF0', '#242424'], '--surface-overlay': ['#D8DDE3', '#1A1A2E'],
    '--text-primary': ['#111111', '#FFFFFF'], '--text-secondary': ['#4C5563', '#CCCCCC'], '--text-muted': ['#6F7782', '#888888'],
    '--text-hint': ['#8C95A3', '#666666'], '--success': ['#2E7D32', '#4CAF50'], '--warning': ['#8D6E00', '#FFEB3B'], '--error': ['#C62828', '#FF4444'],
  };
  for (const [name, [l, d]] of Object.entries(android)) {
    assert.equal(light.get(name), l, `светлая ${name}`);
    assert.equal(dark.get(name), d, `тёмная ${name}`);
  }
  for (const name of dark.keys()) assert.ok(light.has(name), `${name} есть в тёмной теме, но нет в :root`);
});

test('every var(--…) used by the UI is defined in theme.css', () => {
  const sources = [html, read('../ui/trophynav-maps.js'), read('../ui/trophynav-3d.js'), read('../ui/tn-icons.js'), read('../ui/tn-widgets.js')];
  const missing = new Set();
  for (const src of sources) {
    for (const m of src.matchAll(/var\((--[\w-]+)/g)) if (!light.has(m[1])) missing.add(m[1]);
  }
  assert.deepEqual([...missing], [], 'неизвестные токены');
});

test('no hex/rgb colours outside theme.css (data colours are marked)', () => {
  const found = [
    ...leaks(html, 'ui/index.html'),
    ...leaks(read('../ui/trophynav-maps.js'), 'ui/trophynav-maps.js'),
    ...leaks(read('../ui/trophynav-3d.js'), 'ui/trophynav-3d.js'),
    ...leaks(read('../ui/trophynav-maps-core.js'), 'ui/trophynav-maps-core.js'),
    ...leaks(read('../ui/trophynav-symbols.js'), 'ui/trophynav-symbols.js'),
    ...leaks(read('../ui/tn-icons.js'), 'ui/tn-icons.js'),
    ...leaks(read('../ui/tn-widgets.js'), 'ui/tn-widgets.js'),
  ];
  assert.deepEqual(found, []);
});

test('no theme patches: no [data-theme="light"] overrides, no [style*=…] hacks', () => {
  assert.doesNotMatch(html, /\[data-theme="light"\]/);
  assert.doesNotMatch(html, /\[style\*=/);
  // ранний скрипт всегда ставит data-theme (тёмная по умолчанию, как раньше)
  assert.match(html, /setAttribute\('data-theme',t==='light'\?'light':'dark'\)/);
});

// ── контраст ──
function rgb(value, map) {
  let v = value;
  for (let i = 0; i < 5 && v.startsWith('var('); i++) v = map.get(v.slice(4, -1)) ?? light.get(v.slice(4, -1));
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  assert.ok(hex, `ожидался #RRGGBB: ${value} → ${v}`);
  return hex[1].match(/../g).map(h => parseInt(h, 16) / 255);
}
const lum = c => { const [r, g, b] = c.map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function contrast(fg, bg, map) {
  const a = lum(rgb(fg, map)), b = lum(rgb(bg, map));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('text tokens are readable on surfaces in both themes', () => {
  for (const [name, map] of [['светлая', light], ['тёмная', dark]]) {
    const get = t => map.get(t) ?? light.get(t);
    for (const bg of ['--surface', '--background', '--surface-variant', '--tile-bg', '--bar-bg']) {
      for (const fg of ['--text-primary', '--text-secondary']) {
        assert.ok(contrast(get(fg), get(bg), map) >= 4.5, `${name}: ${fg} на ${bg}`);
      }
      assert.ok(contrast(get('--primary-text'), get(bg), map) >= 4.5, `${name}: --primary-text на ${bg}`);
      assert.ok(contrast(get('--error-text'), get(bg), map) >= 4.5, `${name}: --error-text на ${bg}`);
      assert.ok(contrast(get('--success-text'), get(bg), map) >= 4.5, `${name}: --success-text на ${bg}`);
    }
    assert.ok(contrast(get('--text-muted'), get('--surface'), map) >= 3, `${name}: --text-muted`);
    // белый на оранжевой «пилюле»: светлая ≥ 4.5:1; в тёмной ≥ 3:1 — там текст кнопки полужирный 13px
    assert.ok(contrast(get('--on-primary'), get('--primary'), map) >= (map === light ? 4.5 : 3), `${name}: кнопка primary`);
    assert.ok(contrast(get('--status-ink'), get('--status-bad-fill'), map) >= 4.5, `${name}: статус-кнопка`);
  }
});
