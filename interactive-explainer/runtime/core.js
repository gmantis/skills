/* interactive-explainer runtime: core.js (IE). Inlined by scripts/build.js; edit here, never in a built page.
   API reference: runtime/API.md. A page supplies a pure model and IE.app({...}); the runtime builds the tour, the
   what-if switches, the parameter sliders, the shared selection (slider, play, ←/→ keys), the URL state, the theme
   toggle, and redraws through cfg.render(S) only when something changed. */
(function(){
'use strict';
const IE = window.IE = { version: '2.0.0' };

// ---------------------------------------------------------------- small helpers
const $ = IE.$ = id => document.getElementById(id);
IE.qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
IE.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
IE.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
IE.lerp = (a, b, t) => a + (b - a) * t;
IE.range = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * (n === 1 ? 0 : i / (n - 1)));
IE.sum = a => a.reduce((s, v) => s + v, 0);
IE.seeded = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };   // mulberry32
IE.niceStep = (span, target = 5) => { const raw = Math.abs(span) / target || 1, p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw - 1e-12) return m * p; return 10 * p; };
IE.ticks = (lo, hi, n = 5) => { const st = IE.niceStep(hi - lo, n), out = []; for (let v = Math.ceil(lo / st - 1e-9) * st; v <= hi + st * 1e-9; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v); return out; };
IE.niceMax = v => { if (v <= 0) return 1; const st = IE.niceStep(v, 5); return Math.ceil(v / st) * st; };

const NF = {};
const nf = (d, o = {}) => { const k = d + JSON.stringify(o); return NF[k] || (NF[k] = new Intl.NumberFormat(undefined, { minimumFractionDigits: d, maximumFractionDigits: d, ...o })); };
IE.fmt = {
  num: (v, d = 1) => !isFinite(v) ? (isNaN(v) ? '–' : v > 0 ? '∞' : '−∞') : nf(d).format(v).replace('-', '−'),
  int: v => IE.fmt.num(Math.round(v), 0),
  sgn: (v, d = 1) => (v < 0 ? '−' : '+') + nf(d).format(Math.abs(v)),
  pct: (v, d = 0) => !isFinite(v) ? '–' : nf(d).format(v * 100).replace('-', '−') + '%',
  si: (v, d = 1) => { const a = Math.abs(v); for (const [m, s] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']]) if (a >= m) return IE.fmt.num(v / m, d) + s; return IE.fmt.num(v, a < 10 && v % 1 ? d : 0); },
  money: (v, cur = 'USD', d = 0) => new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: d, minimumFractionDigits: d }).format(v),
  dur: s => !isFinite(s) ? 'never' : s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : s < 172800 ? IE.fmt.num(s / 3600, 1) + ' h' : IE.fmt.num(s / 86400, 1) + ' days',
};

// ---------------------------------------------------------------- theme, colours, motion
let colorCache = {};
IE.color = name => { if (colorCache[name]) return colorCache[name];
  const v = getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim(); return (colorCache[name] = v || name); };
IE.series = i => 's' + ((i % 8) + 1);                 // slot name; IE.color(IE.series(i)) for canvas, `var(--${IE.series(i)})` for svg/css
IE.cssColor = c => !c ? 'var(--ink)' : /^(#|rgb|hsl|var\()/.test(c) ? c : `var(--${c})`;   // 's2' | 'ink' | '#hex' -> css
const themeCbs = [];
IE.theme = {
  get(){ return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); },
  set(t){ document.documentElement.dataset.theme = t; try { localStorage.setItem('ie-theme', t); } catch (_) {} colorCache = {}; themeCbs.forEach(f => f(t)); IE.theme.sync(); },
  toggle(){ IE.theme.set(IE.theme.get() === 'dark' ? 'light' : 'dark'); },
  onChange(f){ themeCbs.push(f); },
  sync(){ const b = document.querySelector('.theme-toggle'); if (b){ const d = IE.theme.get() === 'dark'; b.textContent = d ? '☀ Light' : '☾ Dark'; b.setAttribute('aria-label', d ? 'Switch to light theme' : 'Switch to dark theme'); } },
  init(){
    let t = null; try { t = new URLSearchParams(location.search).get('theme') || localStorage.getItem('ie-theme'); } catch (_) {}
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { colorCache = {}; themeCbs.forEach(f => f(IE.theme.get())); IE.theme.sync(); });
    const head = document.querySelector('header.ie-head');
    if (head && !head.querySelector('.theme-toggle')){ const b = document.createElement('button'); b.className = 'theme-toggle'; b.type = 'button'; b.onclick = IE.theme.toggle; head.appendChild(b); }
    IE.theme.sync();
  },
};
const rm = matchMedia('(prefers-reduced-motion: reduce)');
Object.defineProperty(IE, 'reducedMotion', { get: () => rm.matches });

// ---------------------------------------------------------------- live numbers in prose
IE.D = k => `<span class="dyn" data-dyn="${k}"></span>`;
IE.DW = k => `<span class="dyn wrap" data-dyn="${k}"></span>`;
window.D = IE.D; window.DW = IE.DW;
IE.fillDyn = vals => { for (const el of document.querySelectorAll('[data-dyn]')){ const v = vals[el.dataset.dyn]; if (v !== undefined && el.textContent !== String(v)) el.textContent = v; } };

// ---------------------------------------------------------------- canvas helpers
// Keep the logical height in data-h: reading it back from cv.height after scaling by dpr grows the canvas on HiDPI.
IE.setupCanvas = cv => {
  const dpr = window.devicePixelRatio || 1, W = Math.max(280, Math.floor(cv.clientWidth)), H = +cv.dataset.h || 300;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)){ cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  cv.style.height = H + 'px';
  if (!cv.hasAttribute('role')) cv.setAttribute('role', 'img');
  if (!cv.hasAttribute('aria-label')){ const h = cv.closest('section, .panel')?.querySelector('h3'); if (h) cv.setAttribute('aria-label', h.textContent); }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  return { ctx, W, H, dpr };
};
window.setupCanvas = IE.setupCanvas;
IE.font = (px = 12, weight = '') => `${weight ? weight + ' ' : ''}${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
// Text with a backing box, clamped inside the canvas so labels never get cut off. o: align, color, font, bg:false, alpha
IE.txt = (ctx, s, x, y, o = {}) => {
  ctx.font = o.font || IE.font(12); ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(s).width, CW = ctx.canvas.clientWidth || 9999;
  let bx = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  const nbx = Math.max(4, Math.min(CW - w - 4, bx)); x += nbx - bx; bx = nbx;
  if (o.bg !== false){ ctx.fillStyle = IE.color('backing'); ctx.fillRect(bx - 3, y - 8, w + 6, 16); }
  ctx.fillStyle = o.color || IE.color('ink'); ctx.globalAlpha = o.alpha ?? 1; ctx.fillText(s, x, y); ctx.globalAlpha = 1;
  return w;
};
IE.disc = (ctx, x, y, r, fill, stroke, lw = 1.5) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); if (fill){ ctx.fillStyle = fill; ctx.fill(); } if (stroke){ ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } };
// Canvas label placement: tries candidate anchors, avoids already-placed labels, then (strict pass) data points.
// placed: [] shared per frame; lines: string[]; cands: [[x, y, align]]; o: { bounds:{l,t,r,b}, avoid:[[ [x,y],... ]], color, colors, boldFirst, font }
IE.placeLabel = (ctx, placed, lines, cands, o = {}) => {
  ctx.font = o.font || IE.font(12);
  const w = Math.max(...lines.map(s => ctx.measureText(s).width)) + 6, h = lines.length * 15, B = o.bounds || { l: 0, t: 0, r: ctx.canvas.clientWidth, b: ctx.canvas.clientHeight };
  const boxOf = ([x, y, al]) => { const l = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x; return { l: l - 3, t: y - 8, r: l - 3 + w, b: y - 8 + h, x: l, y }; };
  const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const onData = b => (o.avoid || []).some(pts => pts.some(([x, y]) => x > b.l - 2 && x < b.r + 2 && y > b.t - 2 && y < b.b + 2));
  const ok = (b, strict) => b.l >= B.l && b.r <= B.r && b.t >= B.t && b.b <= B.b && !placed.some(q => hit(q, b)) && (!strict || !onData(b));
  let box = null;
  for (const strict of [true, false]){ for (const c of cands){ const b = boxOf(c); if (ok(b, strict)){ box = b; break; } } if (box) break; }
  if (!box){ box = boxOf(cands[0]); box.l = Math.max(B.l, Math.min(B.r - w, box.l)); box.r = box.l + w; box.x = box.l + 3; }
  ctx.fillStyle = IE.color('backing'); ctx.fillRect(box.l, box.t, w, h);
  lines.forEach((s, i) => IE.txt(ctx, s, box.x, box.y + i * 15, { bg: false, color: (o.colors && o.colors[i]) || o.color, font: i === 0 && o.boldFirst ? IE.font(12, 'bold') : o.font }));
  placed.push(box); return box;
};
// Canvas chart frame: grid, ticks, zero line; returns scales and a line() painter. Pair with IE.onPickX for click-to-pick.
// o: { x0, x1, y0, y1, fmtX, fmtY, ticksX, ticksY, pad }
IE.chartFrame = (cv, o) => {
  const { ctx, W, H } = IE.setupCanvas(cv), pad = { l: 50, r: 12, t: 12, b: 24, ...(o.pad || {}) }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const X = x => pad.l + (x - o.x0) / (o.x1 - o.x0) * pw, Y = v => pad.t + ph - (v - o.y0) / (o.y1 - o.y0) * ph;
  ctx.strokeStyle = IE.color('grid'); ctx.lineWidth = 1;
  for (const v of o.ticksY || IE.ticks(o.y0, o.y1, 5)){ ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(pad.l + pw, Y(v)); ctx.stroke(); IE.txt(ctx, (o.fmtY || String)(v), pad.l - 6, Y(v), { align: 'right', bg: false, color: IE.color('muted'), font: IE.font(11) }); }
  for (const v of o.ticksX || IE.ticks(o.x0, o.x1, 6)) IE.txt(ctx, (o.fmtX || String)(v), X(v), pad.t + ph + 13, { align: 'center', bg: false, color: IE.color('muted'), font: IE.font(11) });
  if (o.y0 < 0 && o.y1 > 0){ ctx.strokeStyle = IE.color('axis'); ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(pad.l + pw, Y(0)); ctx.stroke(); }
  const line = (pts, color, w = 2, dash = []) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash); ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.stroke(); ctx.setLineDash([]); };
  cv._geo = { pad, pw, x0: o.x0, x1: o.x1 };
  return { ctx, W, H, X, Y, line, pad, pw, ph };
};
IE.onPickX = (el, cb) => {   // pointer down/drag on a chart -> data x (canvas via chartFrame, svg via lineChart)
  const pick = e => { const g = el._geo; if (!g) return; const r = el.getBoundingClientRect();
    cb(IE.clamp(g.x0 + ((e.clientX - r.left) - g.pad.l) / g.pw * (g.x1 - g.x0), Math.min(g.x0, g.x1), Math.max(g.x0, g.x1))); };
  el.addEventListener('pointerdown', e => { el.setPointerCapture?.(e.pointerId); pick(e); });
  el.addEventListener('pointermove', e => { if (e.buttons) pick(e); });
};

// ---------------------------------------------------------------- SVG helpers and charts
const NS = 'http://www.w3.org/2000/svg';
IE.svg = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag);
  for (const k in attrs){ const v = attrs[k]; if (v == null || v === false) continue; if (k === 'text') e.textContent = v; else e.setAttribute(k, v); }
  if (parent) parent.appendChild(e); return e; };
const pathD = pts => { let d = '', pen = false; for (const p of pts){ if (!p || !isFinite(p[0]) || !isFinite(p[1])){ pen = false; continue; } d += (pen ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); pen = true; } return d; };
IE.pathD = pathD;
// Spread labels vertically so none are closer than gap (keeps order). items: [{y}] -> sets .ly
IE.spread = (items, gap = 14, lo = -Infinity, hi = Infinity) => {
  const s = [...items].sort((a, b) => a.y - b.y); s.forEach((it, i) => { it.ly = Math.max(it.y, i ? s[i - 1].ly + gap : lo); });
  for (let i = s.length - 1; i >= 0; i--){ if (s[i].ly > hi - (s.length - 1 - i) * gap) s[i].ly = hi - (s.length - 1 - i) * gap; if (i < s.length - 1 && s[i].ly > s[i + 1].ly - gap) s[i].ly = s[i + 1].ly - gap; }
  return items;
};
// Measure text width without layout (approximate for 12px system-ui).
let mctx = null; IE.textWidth = (s, px = 12, weight = '') => { mctx = mctx || document.createElement('canvas').getContext('2d'); mctx.font = IE.font(px, weight); return mctx.measureText(s).width; };

/* Line chart in SVG. spec:
   { title, height, x:{min,max,fmt,ticks,label}, y:{min,max,fmt,ticks,label,log},
     series:[{id,label,color,points:[[x,y]],width,dash,ghost,area,endLabel}], cursor, cursorLabel,
     marks:[{x,y,label,color}], bands:[{x0,x1,label}], hlines:[{y,label}], notes:[{x,y,text,anchor}], onPick:x=>..., summary }
   chart.set(spec) redraws; when only cursor/marks change it updates the overlay layer only. */
IE.lineChart = (host, spec) => {
  const leg = document.createElement('div'); leg.className = 'legend'; host.appendChild(leg);
  const root = IE.svg('svg', { class: 'ie-chart pickable', role: 'img' }); host.appendChild(root);
  const title = IE.svg('title', {}, root), base = IE.svg('g', {}, root), over = IE.svg('g', {}, root);
  let S = null, geo = null, lastKey = '';
  const ch = { el: root, spec: null };
  const build = () => {
    const W = Math.max(280, host.clientWidth || 600), H = S.height || 300, endW = S.series.some(s => s.endLabel !== false && !s.ghost && s.label) ? Math.min(150, 12 + Math.max(...S.series.filter(s => !s.ghost && s.label).map(s => IE.textWidth(s.label + '  ' + (s.endText || ''), 12, 'bold')))) : 10;
    const pad = { l: 52, r: endW, t: 14, b: S.x.label ? 40 : 26 }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const ly = S.y.log, ty = v => ly ? Math.log10(v) : v, y0 = ty(S.y.min), y1 = ty(S.y.max);
    const X = x => pad.l + (x - S.x.min) / (S.x.max - S.x.min) * pw, Y = v => pad.t + ph - (ty(v) - y0) / (y1 - y0) * ph;
    geo = { pad, pw, ph, X, Y, x0: S.x.min, x1: S.x.max, W, H }; root._geo = geo;
    root.setAttribute('viewBox', `0 0 ${W} ${H}`); root.setAttribute('width', W); root.setAttribute('height', H);
    title.textContent = (S.title || 'Chart') + (S.summary ? '. ' + S.summary : '');
    root.setAttribute('aria-label', title.textContent);
    base.replaceChildren();
    // legend (HTML, above the chart) when dashed comparison curves need naming; spec.legend:false hides it
    const named = S.series.filter(s => s.label && (s.ghost || s.dash || s.legend));
    leg.innerHTML = S.legend === false || !named.length ? '' : S.series.filter(s => s.label).map(s => `<span><i class="${s.ghost || s.dash ? 'dash' : ''}" style="background:${IE.cssColor(s.color)};color:${IE.cssColor(s.color)}"></i>${IE.esc(s.label)}</span>`).join('');
    IE.svg('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' }, base);
    for (const b of S.bands || []){ IE.svg('rect', { class: 'band', x: X(b.x0), y: pad.t, width: Math.max(0, X(b.x1) - X(b.x0)), height: ph }, base);
      if (b.label) IE.svg('text', { class: 'note lbl', x: X(b.x0) + 4, y: pad.t + 12, text: b.label }, base); }
    const yt = S.y.ticks || (ly ? logTicks(S.y.min, S.y.max) : IE.ticks(S.y.min, S.y.max, Math.max(3, Math.round(ph / 55))));
    for (const v of yt){ IE.svg('line', { class: 'grid', x1: pad.l, x2: pad.l + pw, y1: Y(v), y2: Y(v) }, base);
      IE.svg('text', { class: 'tick', x: pad.l - 6, y: Y(v) + 4, 'text-anchor': 'end', text: (S.y.fmt || String)(v) }, base); }
    const xt = S.x.ticks || IE.ticks(S.x.min, S.x.max, Math.max(3, Math.round(pw / 90)));
    for (const v of xt){ const x = X(v), edge = x - pad.l < 24 ? 'start' : pad.l + pw - x < 24 ? 'end' : 'middle';   // edge ticks lean inward, clear of the y labels
      IE.svg('text', { class: 'tick', x, y: pad.t + ph + 16, 'text-anchor': edge, text: (S.x.fmt || String)(v) }, base); }
    IE.svg('line', { class: 'axis', x1: pad.l, x2: pad.l + pw, y1: pad.t + ph, y2: pad.t + ph }, base);
    if (!ly && S.y.min < 0 && S.y.max > 0) IE.svg('line', { class: 'axis', x1: pad.l, x2: pad.l + pw, y1: Y(0), y2: Y(0) }, base);
    if (S.x.label) IE.svg('text', { class: 'tick', x: pad.l + pw / 2, y: H - 6, 'text-anchor': 'middle', text: S.x.label }, base);
    if (S.y.label) IE.svg('text', { class: 'tick', x: pad.l, y: pad.t - 3, text: S.y.label }, base);
    for (const h of S.hlines || []){ IE.svg('line', { class: 'axis', x1: pad.l, x2: pad.l + pw, y1: Y(h.y), y2: Y(h.y), 'stroke-dasharray': '4 4' }, base);
      if (h.label) IE.svg('text', { class: 'note lbl', x: pad.l + 6, y: Y(h.y) - 5, text: h.label }, base); }
    const clip = 'c' + Math.random().toString(36).slice(2, 8);
    const cp = IE.svg('clipPath', { id: clip }, base); IE.svg('rect', { x: pad.l, y: pad.t - 2, width: pw, height: ph + 4 }, cp);
    const g = IE.svg('g', { 'clip-path': `url(#${clip})` }, base);
    for (const s of S.series){
      const pts = s.points.map(([x, y]) => [X(x), (ly && y <= 0) ? NaN : Y(y)]), col = IE.cssColor(s.color);
      if (s.area){ const fin = pts.filter(p => isFinite(p[1])); if (fin.length) IE.svg('path', { d: pathD(fin) + `L${fin[fin.length - 1][0]},${pad.t + ph}L${fin[0][0]},${pad.t + ph}Z`, fill: col, opacity: 0.12 }, g); }
      IE.svg('path', { d: pathD(pts), fill: 'none', stroke: col, 'stroke-width': s.width || (s.ghost ? 1.6 : 2.2), 'stroke-dasharray': s.dash || (s.ghost ? '5 4' : null), opacity: s.ghost ? 0.7 : 1, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'data-series': s.id }, g);
    }
    // end labels: right gutter, de-overlapped
    const ends = S.series.filter(s => !s.ghost && s.label && s.endLabel !== false).map(s => { const p = [...s.points].reverse().find(p => isFinite(p[1]) && (!ly || p[1] > 0)); return p ? { s, y: Y(p[1]) } : null; }).filter(Boolean);
    IE.spread(ends, 14, pad.t + 6, pad.t + ph);
    for (const e of ends){ const col = IE.cssColor(e.s.color);
      IE.svg('text', { class: 'end lbl', x: pad.l + pw + 6, y: e.ly + 4, fill: col, style: `fill:${col}`, text: e.s.label + (e.s.endText ? '  ' + e.s.endText : '') }, base); }
    for (const n of S.notes || []) IE.svg('text', { class: 'note lbl', x: X(n.x), y: Y(n.y), 'text-anchor': n.anchor || 'start', text: n.text }, base);
  };
  const overlay = () => {
    over.replaceChildren(); if (!geo) return; const { X, Y, pad, ph } = geo;
    if (S.cursor != null && isFinite(S.cursor)){ const cx = X(S.cursor); IE.svg('line', { class: 'cursor', x1: cx, x2: cx, y1: pad.t, y2: pad.t + ph }, over);
      if (S.cursorLabel){ const w = IE.textWidth(S.cursorLabel, 11.5) + 8, x = IE.clamp(cx - w / 2, pad.l, pad.l + geo.pw - w);
        IE.svg('rect', { x, y: pad.t + 1, width: w, height: 17, rx: 4, fill: 'var(--backing)' }, over); IE.svg('text', { class: 'note lbl', x: x + 4, y: pad.t + 13, text: S.cursorLabel }, over); } }
    for (const m of S.marks || []){ if (!isFinite(m.y)) continue; const col = IE.cssColor(m.color || 'ink');
      IE.svg('circle', { cx: X(m.x), cy: Y(m.y), r: m.r || 4.5, fill: col, stroke: 'var(--panel2)', 'stroke-width': 1.5 }, over);
      if (m.label) IE.svg('text', { class: 'note lbl', x: X(m.x) + 7, y: Y(m.y) - 7, text: m.label }, over); }
  };
  ch.set = patch => {
    S = { ...(S || {}), ...patch }; ch.spec = S;
    const key = [host.clientWidth, S.height, IE.theme.get()].join('|');
    const structural = !patch || Object.keys(patch).some(k => !['cursor', 'cursorLabel', 'marks'].includes(k));
    if (structural || key !== lastKey){ lastKey = key; build(); }
    overlay(); return ch;
  };
  if (spec.onPick) IE.onPickX(root, spec.onPick);
  new ResizeObserver(() => { if (S && host.clientWidth && String(host.clientWidth) !== lastKey.split('|')[0]) ch.set({}); }).observe(host);
  IE.theme.onChange(() => S && ch.set({}));
  ch.set(spec);
  return ch;
};
const logTicks = (lo, hi) => { const o = []; for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const m of [1, 2, 5]){ const v = m * Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) o.push(v); } return o; };

/* Horizontal bar chart in SVG. spec: { title, rows:[{id,label,value,color,note,ghost}], fmt, max, min, highlight, onPick:id=>..., height(auto) } */
IE.barChart = (host, spec) => {
  const root = IE.svg('svg', { class: 'ie-chart', role: 'img' }); host.appendChild(root); const title = IE.svg('title', {}, root), g = IE.svg('g', {}, root);
  let S = null; const ch = { el: root };
  const build = () => {
    const W = Math.max(280, host.clientWidth || 500), rowH = S.rowH || 30, H = S.rows.length * rowH + 12;
    const labW = Math.min(W * 0.34, 12 + Math.max(...S.rows.map(r => IE.textWidth(r.label, 12)))), valW = 12 + Math.max(...S.rows.map(r => IE.textWidth((S.fmt || String)(r.value) + (r.note ? '  ' + r.note : ''), 12, 'bold')));
    const lo = Math.min(0, S.min ?? Math.min(...S.rows.map(r => r.value))), hi = S.max ?? Math.max(...S.rows.map(r => r.value)), x0 = labW, pw = Math.max(40, W - labW - valW - 8);
    const X = v => x0 + (v - lo) / ((hi - lo) || 1) * pw;
    root.setAttribute('viewBox', `0 0 ${W} ${H}`); root.setAttribute('width', W); root.setAttribute('height', H);
    title.textContent = (S.title || 'Bar chart') + ': ' + S.rows.map(r => `${r.label} ${(S.fmt || String)(r.value)}`).join(', '); root.setAttribute('aria-label', title.textContent);
    g.replaceChildren();
    S.rows.forEach((r, i) => { const y = 6 + i * rowH, gg = IE.svg('g', { class: 'bar' + (S.highlight === r.id ? ' on' : ''), 'data-pick': S.onPick ? r.id : null, tabindex: S.onPick ? 0 : null, role: S.onPick ? 'button' : null, 'aria-label': `${r.label}: ${(S.fmt || String)(r.value)}` }, g);
      IE.svg('text', { class: 'lbl', x: labW - 8, y: y + rowH / 2 + 2, 'text-anchor': 'end', text: r.label }, gg);
      const a = X(Math.min(0, r.value)), b = X(Math.max(0, r.value));
      IE.svg('rect', { x: Math.min(a, b), y: y + 4, width: Math.max(1, Math.abs(b - a)), height: rowH - 10, rx: 3, fill: IE.cssColor(r.color || 's1'), opacity: r.ghost ? 0.35 : 1 }, gg);
      IE.svg('text', { class: 'lbl end', x: X(Math.max(0, r.value)) + 6, y: y + rowH / 2 + 2, text: (S.fmt || String)(r.value) + (r.note ? '  ' + r.note : '') }, gg);
      if (S.onPick){ gg.addEventListener('click', () => S.onPick(r.id)); gg.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); S.onPick(r.id); } }); }
    });
  };
  ch.set = patch => { S = { ...(S || {}), ...patch }; build(); return ch; };
  new ResizeObserver(() => S && build()).observe(host); IE.theme.onChange(() => S && build());
  return ch.set(spec);
};

/* Table: IE.table(host, { columns:[{key,label,num,fmt}], rows:[{...}], highlight: rowIndex|fn, caption }) */
IE.table = (host, spec) => {
  const cols = spec.columns, hl = spec.highlight;
  host.innerHTML = `<div class="tablewrap"><table class="ie-table">${spec.caption ? `<caption class="sr-only">${IE.esc(spec.caption)}</caption>` : ''}<thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''}" scope="col">${c.label}</th>`).join('')}</tr></thead><tbody>${
    spec.rows.map((r, i) => `<tr class="${(typeof hl === 'function' ? hl(r, i) : hl === i) ? 'on' : ''}"${spec.pick ? ` data-pick="${IE.esc(spec.pick(r, i))}"` : ''}>${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.fmt ? c.fmt(r[c.key], r) : IE.esc(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
};

// ---------------------------------------------------------------- sources, citations and the validation table
const SRC = {};
/* IE.sources({ id: { title, url, where:'p. 4, Table 2', quote:'exact words' } }); then IE.cite('id') in prose, and
   <section id="sources"></section> gets a numbered list with each quote, so every claim can be traced to its words. */
IE.sources = map => { Object.assign(SRC, map); const host = $('sources'); if (!host) return;
  const ids = Object.keys(SRC);
  host.innerHTML = (host.dataset.title === '' ? '' : `<h2>${host.dataset.title || 'Sources'}</h2>`) + `<ol class="sources">${ids.map(id => { const s = SRC[id];
    return `<li id="src-${id}">${s.url ? `<a href="${IE.esc(s.url)}">${IE.esc(s.title)}</a>` : IE.esc(s.title)}${s.where ? ` <span class="src">· ${IE.esc(s.where)}</span>` : ''}${s.quote ? `<blockquote>“${IE.esc(s.quote)}”</blockquote>` : ''}</li>`; }).join('')}</ol>`; };
IE.cite = (id, label) => { const n = Object.keys(SRC).indexOf(id) + 1; const s = SRC[id];
  return `<sup class="cite"><a href="#src-${id}" title="${s ? IE.esc((s.where ? s.where + ': ' : '') + (s.quote || s.title)) : id}">[${label || (n || '?')}]</a></sup>`; };
window.cite = IE.cite;
/* Live validation table: rows [{ claim, source:'id'|text, target:'paper value', model: () => 'model value', ok: () => bool|null }]
   Re-evaluated on every redraw by the app. Returns { pass, total }. */
IE.validation = (host, rows) => {
  if (typeof host === 'string') host = $(host);
  const v = { rows, host, render(){
    let pass = 0, total = 0;
    const body = rows.map(r => { let m = '', ok = null; try { m = r.model ? r.model() : ''; ok = r.ok ? r.ok() : null; } catch (e) { m = 'error: ' + e.message; ok = false; }
      if (ok !== null){ total++; if (ok) pass++; }
      return `<tr><td>${r.claim}</td><td class="src">${r.source ? (SRC[r.source] ? IE.cite(r.source) + ' ' + IE.esc(SRC[r.source].where || '') : IE.esc(r.source)) : ''}</td><td class="num">${r.target ?? ''}</td><td class="num">${m}</td><td>${ok === null ? '' : ok ? '<span class="ok" aria-label="matches">✓</span>' : '<span class="fail" aria-label="does not match">✗</span>'}</td></tr>`; }).join('');
    host.innerHTML = `<div class="tablewrap"><table class="ie-table"><thead><tr><th>Claim</th><th>Source</th><th class="num">Source says</th><th class="num">Model gives</th><th><span class="sr-only">Match</span></th></tr></thead><tbody>${body}</tbody></table></div><p class="sub">${pass} of ${total} checks match, recomputed live from the model.</p>`;
    v.pass = pass; v.total = total; return v; } };
  return v.render();
};

// ---------------------------------------------------------------- the app: tour + controls + selection + keys + URL state
/* cfg = {
     real: {...},                        model parameters at their real values (Reset returns here)
     params: [{id,label,min,max,step,fmt,off:'toggleId'}],   sliders in #controls; dimmed while toggle `off` is on
     toggles: [{id,label}],              booleans in P (default false), e.g. "switch cause A off"; checkboxes in #whatif
     options: [{id,label,value}],        view options (ghost curves...), checkboxes in #whatif, kept in P too
     whatIf: [{key,label,set:{...}}],    segmented buttons in #whatif; pressed when P matches `set`
     sel: { label,min,max,step,unit,value,cyclic,fmt,play:{rate} } | { stepBy(dir) } | null,   the shared selection
     steps: [{title, params:{...}, sel, html: () => `...${D('key')}...`, enter(app)}],
     recompute(P), render(S), dyn(S) -> {key: text}, readout(S) -> html, hash: true }
   S passed to render/dyn/readout = { P, sel, step, app }. */
IE.app = cfg => {
  IE.theme.init();
  const toggles = cfg.toggles || [], params = cfg.params || [], options = cfg.options || [], steps = cfg.steps || [];
  const base = () => ({ ...cfg.real, ...Object.fromEntries(toggles.map(t => [t.id, !!t.value])) });
  const P = { ...base(), ...Object.fromEntries(options.map(o => [o.id, o.value ?? false])) };
  const selCfg = cfg.sel || null, numericSel = !!(selCfg && selCfg.min !== undefined);
  let sel = numericSel ? selCfg.value ?? selCfg.min : null, STEP = 0, dirty = true, playing = false, last = null, hashTimer = 0, loading = true;
  const app = { P, cfg, get sel(){ return sel; }, get step(){ return STEP; }, get playing(){ return playing; } };

  // ---- build the standard cards (only into containers that exist)
  const tour = $('tour');
  if (tour) tour.innerHTML = `<div class="stepnav"><button id="prev" type="button" aria-label="Previous topic (Ctrl+←)">‹</button><div class="dots" id="dots"></div><button id="next" type="button" aria-label="Next topic (Ctrl+→)">›</button></div>
    <h2 id="stepTitle"></h2><div id="stepText" aria-live="polite"></div>
    <p class="keys">Keys: <kbd>←</kbd> <kbd>→</kbd> ${IE.esc(selCfg?.keyHint || (numericSel ? 'move ' + (selCfg.label || 'the selection').toLowerCase() : 'move the selection'))} · <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>←</kbd> <kbd>→</kbd> previous / next topic</p>`;
  const wi = $('whatif');
  if (wi && (cfg.whatIf || toggles.length || options.length)){
    if (!wi.querySelector('h4')) wi.insertAdjacentHTML('afterbegin', '<h4>What if?</h4>');
    if (cfg.whatIf) wi.insertAdjacentHTML('beforeend', `<div class="seg" id="whatSeg" role="group" aria-label="What-if scenarios">${cfg.whatIf.map(w => `<button type="button" data-w="${w.key}" aria-pressed="false">${w.label}</button>`).join('')}</div>`);
    for (const t of [...toggles, ...options]) wi.insertAdjacentHTML('beforeend', `<label class="chk"><input type="checkbox" id="${t.id}"><span>${t.label}</span></label>`);
  }
  const ctl = $('controls');
  if (ctl){
    if (numericSel) ctl.insertAdjacentHTML('beforeend', `<div class="ctl"><div class="lab"><label for="sel">${selCfg.label || 'Selection'}</label><output id="sel_o"></output></div><input type="range" id="sel" data-time min="${selCfg.min}" max="${selCfg.max}" step="${selCfg.step || (selCfg.max - selCfg.min) / 1000}"></div>${selCfg.play === false ? '' : '<button class="btn" id="play" type="button">▶ Play</button>'}`);
    if (params.length){ ctl.insertAdjacentHTML('beforeend', `<h4 style="margin-top:12px">Settings</h4><div id="params"></div><button class="btn" id="reset" type="button">Reset to real values</button>`);
      for (const s of params) $('params').insertAdjacentHTML('beforeend', `<div class="ctl"><div class="lab"><label for="${s.id}">${s.label}</label><output id="${s.id}_o"></output></div><input type="range" id="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}"></div>`); }
  }

  // ---- state changes
  const dirtyNow = () => { dirty = true; };
  const syncUI = () => {
    for (const s of params){ const el = $(s.id); if (!el) continue; el.value = P[s.id]; $(s.id + '_o').textContent = (s.fmt || String)(P[s.id]); el.closest('.ctl').classList.toggle('overridden', !!(s.off && P[s.off])); }
    for (const t of [...toggles, ...options]){ const el = $(t.id); if (el) el.checked = !!P[t.id]; }
    IE.qsa('#whatSeg button').forEach(b => { const w = cfg.whatIf.find(x => x.key === b.dataset.w); b.setAttribute('aria-pressed', Object.entries(w.set).every(([k, v]) => P[k] === v) ? 'true' : 'false'); });
  };
  const recompute = () => { cfg.recompute && cfg.recompute(P, app); dirty = true; };
  app.set = (o, opts = {}) => { Object.assign(P, o); syncUI(); if (Object.keys(o).some(k => !options.some(x => x.id === k))) recompute(); else dirty = true; if (!opts.silent) saveHash(); return app; };
  app.setSel = v => { if (!numericSel){ sel = v; dirty = true; saveHash(); return app; }
    sel = selCfg.cyclic ? (((v - selCfg.min) % (selCfg.max - selCfg.min)) + (selCfg.max - selCfg.min)) % (selCfg.max - selCfg.min) + selCfg.min : IE.clamp(v, selCfg.min, selCfg.max); dirty = true; saveHash(); return app; };
  app.redraw = dirtyNow;
  app.pause = () => { if (playing){ playing = false; const b = $('play'); if (b) b.textContent = '▶ Play'; } };
  app.play = () => { playing = true; const b = $('play'); if (b) b.textContent = '❚❚ Pause'; };
  const stepSel = dir => { app.pause(); if (selCfg && selCfg.stepBy) selCfg.stepBy(dir, app); else if (numericSel) app.setSel(sel + dir * (selCfg.unit || selCfg.step || (selCfg.max - selCfg.min) / 100)); dirty = true; };
  app.stepSel = stepSel;
  app.goStep = (i, opts = {}) => {
    STEP = IE.clamp(i, 0, Math.max(0, steps.length - 1)); const st = steps[STEP]; if (!st) return app;
    app.pause();
    const keepOpts = Object.fromEntries(options.map(o => [o.id, P[o.id]]));
    Object.assign(P, base(), keepOpts, st.params || {}); syncUI(); recompute();
    if (st.sel !== undefined){ if (numericSel) app.setSel(typeof st.sel === 'function' ? st.sel(app) : st.sel); else sel = typeof st.sel === 'function' ? st.sel(app) : st.sel; }
    const T = $('stepTitle'); if (T) T.textContent = st.title;
    const X = $('stepText'); if (X) X.innerHTML = typeof st.html === 'function' ? st.html(app) : (st.html || '');
    IE.qsa('#dots button').forEach((d, k) => k === STEP ? d.setAttribute('aria-current', 'step') : d.removeAttribute('aria-current'));
    if ($('prev')) $('prev').disabled = STEP === 0; if ($('next')) $('next').disabled = STEP === steps.length - 1;
    st.enter && st.enter(app);
    dirty = true; if (!opts.silent) saveHash(); return app;
  };

  // ---- URL state: #s=<step>&t=<sel>&<param>=<value differing from the step's own values>
  const enc = v => typeof v === 'boolean' ? (v ? '1' : '0') : typeof v === 'number' ? String(+v.toPrecision(6)) : encodeURIComponent(v);
  function saveHash(){
    if (cfg.hash === false || loading) return; clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      const st = steps[STEP] || {}, ref = { ...base(), ...(st.params || {}) }, q = [`s=${STEP}`];
      if (numericSel && sel != null) q.push('t=' + enc(sel)); else if (sel != null && (typeof sel === 'string' || typeof sel === 'number')) q.push('t=' + enc(sel));
      for (const k of Object.keys(P)){ const isOpt = options.find(o => o.id === k); const r = isOpt ? (isOpt.value ?? false) : ref[k]; if (P[k] !== r && (typeof P[k] !== 'object')) q.push(`${encodeURIComponent(k)}=${enc(P[k])}`); }
      try { history.replaceState(null, '', '#' + q.join('&')); } catch (_) {}
    }, 250);
  }
  const loadHash = () => {
    if (cfg.hash === false || !location.hash || location.hash.length < 3) return false;
    const q = new URLSearchParams(location.hash.slice(1)); if (!q.has('s')) return false;
    app.goStep(+q.get('s') || 0, { silent: true });
    const o = {};
    for (const [k, v] of q){ if (k === 's' || k === 't') continue; if (!(k in P)) continue;
      o[k] = typeof P[k] === 'boolean' ? v === '1' : typeof P[k] === 'number' ? +v : decodeURIComponent(v); }
    if (Object.keys(o).length) app.set(o, { silent: true });
    if (q.has('t')){ const t = q.get('t'); if (numericSel) app.setSel(+t); else sel = isNaN(+t) ? decodeURIComponent(t) : +t; }
    return true;
  };

  // ---- keyboard: ← → selection, Ctrl/⌘ + ← → topic. Leaves typing fields alone; a focused slider keeps plain arrows; Alt is browser back.
  const onKey = e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.altKey || e.defaultPrevented) return;
    const el = e.target, tag = el && el.tagName, mod = e.ctrlKey || e.metaKey;
    if (el && (el.isContentEditable || tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['range', 'checkbox', 'radio'].includes(el.type)))) return;
    if (!mod && tag === 'INPUT' && el.type === 'range') return;
    const dir = e.key === 'ArrowRight' ? 1 : -1; e.preventDefault();
    if (mod) app.goStep(STEP + dir); else stepSel(dir);
  };

  // ---- wiring
  steps.forEach((s, k) => { if (!$('dots')) return; const d = document.createElement('button'); d.type = 'button'; d.textContent = k + 1; d.title = s.title; d.setAttribute('aria-label', `Topic ${k + 1}: ${s.title}`); d.onclick = () => app.goStep(k); $('dots').appendChild(d); });
  if ($('prev')) $('prev').onclick = () => app.goStep(STEP - 1);
  if ($('next')) $('next').onclick = () => app.goStep(STEP + 1);
  document.addEventListener('click', ev => {   // inline "try this" buttons anywhere: data-set="k=v; k2=v2" (sel=… moves the selection)
    const b = ev.target.closest('button[data-set]'); if (!b) return; const o = {};
    b.dataset.set.split(';').forEach(kv => { const [k, v] = kv.split('=').map(x => x.trim()); if (!k) return;
      if (k === 'sel'){ app.setSel(isNaN(+v) ? v : +v); return; }
      o[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v; });
    if (Object.keys(o).length) app.set(o);
  });
  IE.qsa('#whatSeg button').forEach(b => b.onclick = () => app.set({ ...cfg.whatIf.find(w => w.key === b.dataset.w).set }));
  for (const t of [...toggles, ...options]){ const el = $(t.id); if (el) el.onchange = () => app.set({ [t.id]: el.checked }); }
  for (const s of params){ const el = $(s.id); if (el) el.addEventListener('input', () => app.set({ [s.id]: +el.value })); }
  if ($('reset')) $('reset').onclick = () => app.set({ ...cfg.real, ...Object.fromEntries(toggles.map(t => [t.id, !!t.value])) });
  if ($('sel')) $('sel').addEventListener('input', () => { app.pause(); app.setSel(+$('sel').value); });
  if ($('play')) $('play').onclick = () => playing ? app.pause() : app.play();
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', dirtyNow);
  IE.theme.onChange(dirtyNow);

  // globals the checker (scripts/check.js) and quick console pokes rely on
  window.STEPS = steps; window.goStep = i => app.goStep(i); window.setParams = o => app.set(o); window.P = P; window.APP = app;
  Object.defineProperty(window, 'STEP', { get: () => STEP, configurable: true });
  IE.current = app;

  const render = () => {
    const S = { P, sel, step: STEP, app };
    cfg.render && cfg.render(S);
    if (cfg.dyn) IE.fillDyn(cfg.dyn(S));
    if (cfg.readout && $('readout')) $('readout').innerHTML = cfg.readout(S);
    if (numericSel && $('sel')){ if (Math.abs(+$('sel').value - sel) > (selCfg.step || 0) / 2) $('sel').value = sel; if ($('sel_o')) $('sel_o').textContent = (selCfg.fmt || (v => IE.fmt.num(v, 2)))(sel); }
    (app.afterRender || []).forEach(f => f(S));
  };
  app.afterRender = [];
  app.start = () => {
    syncUI(); recompute();
    if (!loadHash()) app.goStep(0, { silent: true });
    loading = false;
    const frame = now => {
      if (playing && numericSel){ if (last !== null){ const rate = (selCfg.play && selCfg.play.rate) || (selCfg.max - selCfg.min) / 20; let v = sel + (now - last) / 1000 * rate;
          if (!selCfg.cyclic && v >= selCfg.max){ v = selCfg.max; app.pause(); } app.setSel(v); } last = now; } else last = null;
      if (dirty){ dirty = false; try { render(); } catch (e) { console.error(e); } }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return app;
  };
  if (cfg.autostart !== false) queueMicrotask(app.start);
  return app;
};
})();
