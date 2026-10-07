/*
 * Значки темы «Топо» TrophyNav Maps — порт Android MapSymbols.kt (рисуются на canvas, без эмодзи):
 * вода — синий круг, постройки — коричневый квадрат, препятствия — оранжевый ромб,
 * рельеф — серый треугольник, интересное — фиолетовый круг. Плюс штриховки болота/тростника.
 * Цвета — смысловые цвета условных знаков карты (как на Android), от темы приложения не зависят.
 */
(function (root) {
  'use strict';

  const WATER = '#1E6FD9', BUILT = '#7A4A24', HAZARD = '#F57C00', TERRAIN = '#5F6B73', SIGHT = '#7B1FA2', REST = '#2E7D32';
  const WHITE = '#FFFFFF', BOG_LINE = '#1F5FA8', BARRIER_STRIPE = '#D84315';

  /** Объекты слоя «outdoor» (class → знак). */
  const OUTDOOR = {
    spring: ['spring', 'circle', WATER],
    water: ['tap', 'circle', WATER],
    ford: ['ford', 'circle', WATER],
    shelter: ['hut', 'square', BUILT],
    camp_site: ['tent', 'square', REST],
    picnic: ['fire', 'square', REST],
    hunting_stand: ['stand', 'square', BUILT],
    tower: ['tower', 'square', BUILT],
    abandoned_place: ['ruin', 'square', TERRAIN],
    historic: ['monument', 'circle', SIGHT],
    viewpoint: ['eye', 'circle', SIGHT],
    barrier: ['barrier', 'diamond', HAZARD],
    cave: ['cave', 'triangle', TERRAIN],
    rock: ['rock', 'triangle', TERRAIN],
    pass: ['pass', 'triangle', TERRAIN],
  };

  function canvas(size) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    return c;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawShape(ctx, shape, s, inset, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    if (shape === 'circle') ctx.ellipse(s / 2, s / 2, s / 2 - inset, s / 2 - inset, 0, 0, Math.PI * 2);
    else if (shape === 'square') roundRect(ctx, inset, inset, s - 2 * inset, s - 2 * inset, s * 0.18);
    else if (shape === 'diamond') { ctx.moveTo(s / 2, inset); ctx.lineTo(s - inset, s / 2); ctx.lineTo(s / 2, s - inset); ctx.lineTo(inset, s / 2); ctx.closePath(); }
    else { ctx.moveTo(s / 2, inset); ctx.lineTo(s - inset, s - inset * 1.3); ctx.lineTo(inset, s - inset * 1.3); ctx.closePath(); }
    ctx.fill();
  }

  function drawGlyph(ctx, glyph, b) {
    const w = b.r - b.l, h = b.b - b.t;
    const X = f => b.l + w * f, Y = f => b.t + h * f;
    ctx.strokeStyle = WHITE; ctx.fillStyle = WHITE;
    ctx.lineWidth = w * 0.11; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    const path = (build, fill) => { ctx.beginPath(); build(); if (fill) ctx.fill(); else ctx.stroke(); };
    const wave = (yy, x1 = 0.05, x2 = 0.95) => path(() => {
      ctx.moveTo(X(x1), Y(yy));
      const n = 3, step = (x2 - x1) / n;
      for (let i = 0; i < n; i++) ctx.quadraticCurveTo(X(x1 + step * (i + 0.5)), Y(yy + (i % 2 === 0 ? -0.12 : 0.12)), X(x1 + step * (i + 1)), Y(yy));
    });
    const drop = (cx, top, bottom, half) => path(() => {
      ctx.moveTo(X(cx), Y(top));
      ctx.bezierCurveTo(X(cx + half * 1.3), Y(top + (bottom - top) * 0.45), X(cx + half), Y(bottom), X(cx), Y(bottom));
      ctx.bezierCurveTo(X(cx - half), Y(bottom), X(cx - half * 1.3), Y(top + (bottom - top) * 0.45), X(cx), Y(top));
      ctx.closePath();
    }, true);
    const house = (roofTop, base) => {
      path(() => { ctx.moveTo(X(0.05), Y(0.45)); ctx.lineTo(X(0.5), Y(roofTop)); ctx.lineTo(X(0.95), Y(0.45)); });
      path(() => { ctx.moveTo(X(0.18), Y(0.42)); ctx.lineTo(X(0.18), Y(base)); ctx.lineTo(X(0.82), Y(base)); ctx.lineTo(X(0.82), Y(0.42)); });
    };
    const rect = (l, t, r, bt) => ctx.fillRect(X(l), Y(t), X(r) - X(l), Y(bt) - Y(t));
    switch (glyph) {
      case 'spring': drop(0.42, 0.02, 0.62, 0.22); path(() => { ctx.moveTo(X(0.5), Y(0.78)); ctx.quadraticCurveTo(X(0.75), Y(0.68), X(0.95), Y(0.88)); }); break;
      case 'tap': line(0.1, 0.25, 0.7, 0.25); line(0.7, 0.25, 0.7, 0.45); line(0.3, 0.1, 0.3, 0.25); drop(0.7, 0.58, 0.98, 0.14); break;
      case 'ford': line(0.22, 0.02, 0.22, 0.98); line(0.78, 0.02, 0.78, 0.98); wave(0.38, 0, 1); wave(0.68, 0, 1); break;
      case 'hut': house(0.05, 0.95); line(0.5, 0.95, 0.5, 0.66); break;
      case 'ruin':
        path(() => { ctx.moveTo(X(0.05), Y(0.45)); ctx.lineTo(X(0.4), Y(0.15)); });
        path(() => { ctx.moveTo(X(0.62), Y(0.2)); ctx.lineTo(X(0.95), Y(0.45)); });
        path(() => { ctx.moveTo(X(0.18), Y(0.45)); ctx.lineTo(X(0.18), Y(0.95)); ctx.lineTo(X(0.55), Y(0.95)); });
        line(0.82, 0.62, 0.82, 0.95); break;
      case 'tent': path(() => { ctx.moveTo(X(0.02), Y(0.92)); ctx.lineTo(X(0.5), Y(0.08)); ctx.lineTo(X(0.98), Y(0.92)); ctx.closePath(); }); line(0.5, 0.92, 0.5, 0.55); break;
      case 'fire': path(() => {
        ctx.moveTo(X(0.5), Y(0)); ctx.bezierCurveTo(X(0.95), Y(0.4), X(0.85), Y(0.95), X(0.5), Y(0.95));
        ctx.bezierCurveTo(X(0.15), Y(0.95), X(0.05), Y(0.55), X(0.35), Y(0.35));
        ctx.quadraticCurveTo(X(0.4), Y(0.55), X(0.5), Y(0.55)); ctx.quadraticCurveTo(X(0.6), Y(0.3), X(0.5), Y(0));
      }, true); break;
      case 'stand': rect(0.2, 0.02, 0.8, 0.32); line(0.25, 0.32, 0.12, 0.98); line(0.75, 0.32, 0.88, 0.98); line(0.2, 0.62, 0.8, 0.62); break;
      case 'tower': line(0.5, 0, 0.5, 0.12); rect(0.28, 0.12, 0.72, 0.3); line(0.35, 0.3, 0.18, 0.98); line(0.65, 0.3, 0.82, 0.98);
        line(0.3, 0.6, 0.7, 0.6); line(0.33, 0.45, 0.75, 0.85); line(0.67, 0.45, 0.25, 0.85); break;
      case 'monument': path(() => { ctx.moveTo(X(0.5), Y(0)); ctx.lineTo(X(0.68), Y(0.8)); ctx.lineTo(X(0.32), Y(0.8)); ctx.closePath(); }, true); line(0.15, 0.92, 0.85, 0.92); break;
      case 'eye':
        path(() => { ctx.moveTo(X(0.02), Y(0.5)); ctx.quadraticCurveTo(X(0.5), Y(0.05), X(0.98), Y(0.5)); ctx.quadraticCurveTo(X(0.5), Y(0.95), X(0.02), Y(0.5)); });
        path(() => ctx.arc(X(0.5), Y(0.5), w * 0.15, 0, Math.PI * 2), true); break;
      case 'barrier': {
        line(0.1, 0.2, 0.1, 0.95); rect(0.1, 0.32, 1, 0.55);
        ctx.fillStyle = BARRIER_STRIPE;
        for (let i = 0; i <= 2; i++) rect(0.25 + i * 0.27, 0.32, 0.38 + i * 0.27, 0.55);
        break;
      }
      case 'cave': path(() => {
        ctx.moveTo(X(0), Y(1)); ctx.lineTo(X(0), Y(0.55)); ctx.quadraticCurveTo(X(0.5), Y(-0.1), X(1), Y(0.55)); ctx.lineTo(X(1), Y(1)); ctx.lineTo(X(0.7), Y(1));
        ctx.lineTo(X(0.7), Y(0.65)); ctx.quadraticCurveTo(X(0.5), Y(0.38), X(0.3), Y(0.65)); ctx.lineTo(X(0.3), Y(1)); ctx.closePath();
      }, true); break;
      case 'rock': path(() => { ctx.moveTo(X(0.05), Y(0.95)); ctx.lineTo(X(0.2), Y(0.4)); ctx.lineTo(X(0.55), Y(0.15)); ctx.lineTo(X(0.9), Y(0.45)); ctx.lineTo(X(0.98), Y(0.95)); ctx.closePath(); }, true); break;
      case 'pass': path(() => { ctx.moveTo(X(0), Y(0.95)); ctx.lineTo(X(0.28), Y(0.2)); ctx.lineTo(X(0.5), Y(0.6)); ctx.lineTo(X(0.72), Y(0.2)); ctx.lineTo(X(1), Y(0.95)); }); break;
      default:
        path(() => ctx.arc(X(0.5), Y(0.38), w * 0.3, 0, Math.PI * 2), true);
        path(() => { ctx.moveTo(X(0.28), Y(0.55)); ctx.lineTo(X(0.5), Y(1)); ctx.lineTo(X(0.72), Y(0.55)); ctx.closePath(); }, true);
    }
  }

  function symbol([glyph, shape, color], size) {
    const c = canvas(size);
    const ctx = c.getContext('2d');
    const s = size;
    // Белая кайма (читается на любой карте), затем цветная фигура
    drawShape(ctx, shape, s, 0, WHITE);
    drawShape(ctx, shape, s, s * 0.08, color);
    const box = shape === 'diamond' ? { l: s * 0.24, t: s * 0.26, r: s * 0.76, b: s * 0.74 }
      : shape === 'triangle' ? { l: s * 0.32, t: s * 0.40, r: s * 0.68, b: s * 0.76 }
        : { l: s * 0.22, t: s * 0.22, r: s * 0.78, b: s * 0.78 };
    drawGlyph(ctx, glyph, box);
    return ctx.getImageData(0, 0, s, s);
  }

  /** Знак болота: голубые штрихи в шахматном порядке; тростник — ещё и пучки травы. Фон прозрачный. */
  function bogPattern(density, reed) {
    const s = Math.max(16, Math.round(24 * density));
    const c = canvas(s);
    const ctx = c.getContext('2d');
    ctx.strokeStyle = BOG_LINE; ctx.lineWidth = 1.4 * density; ctx.lineCap = 'round';
    const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    line(s * 0.08, s * 0.25, s * 0.42, s * 0.25);
    line(s * 0.58, s * 0.75, s * 0.92, s * 0.75);
    if (reed) {
      [[s * 0.75, s * 0.25], [s * 0.25, s * 0.75]].forEach(([x, y]) => {
        line(x, y + s * 0.06, x, y - s * 0.14);
        line(x, y + s * 0.06, x - s * 0.08, y - s * 0.08);
        line(x, y + s * 0.06, x + s * 0.08, y - s * 0.08);
      });
    }
    return ctx.getImageData(0, 0, s, s);
  }

  /** Все значки «Топо»: {id: ImageData}, отрисованы в pixelRatio (для резкости на HiDPI). */
  function topoImages(pixelRatio) {
    const pr = Math.max(1, Math.min(3, pixelRatio || 1));
    const out = {};
    Object.entries(OUTDOOR).forEach(([cls, kind]) => { out[`topo-${cls}`] = symbol(kind, Math.round(26 * pr)); });
    out['topo-bog-pattern'] = bogPattern(pr, false);
    out['topo-reed-pattern'] = bogPattern(pr, true);
    return out;
  }

  root.TrophyNavSymbols = { OUTDOOR, topoImages };
})(typeof window !== 'undefined' ? window : globalThis);
