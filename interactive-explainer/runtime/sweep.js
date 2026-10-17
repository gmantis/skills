/* interactive-explainer runtime: sweep.js (IE.sweep). Parameter sweep: the outcome as a curve over one parameter, with
   the current value marked (click to set), ghost curves for the same sweep with one cause off, named thresholds with
   leader lines, a shaded region where the outcome is unbounded (never plotted, said in words), a "your numbers"
   marker, and small multiples of whole runs at 4-6 fixed values. SVG, built on IE.lineChart, so labels are themed
   and lintable. Needs core.js. Guide: shapes/sweep.md. */
(function(){
'use strict';
const IE = window.IE;
const fin = v => typeof v === 'number' && isFinite(v);

/* ---------------------------------------------------------------- SVG label placement
   Like IE.placeLabel for canvas: tries candidate anchors [x, y, align] (y = vertical centre of the block), keeps the
   block inside o.bounds {l,t,r,b}, off every box in `placed`, and (first pass) off every polyline in o.avoid
   (arrays of [x, y] pixels). Draws a backing rect + one <text class="lbl"> with a <tspan> per line. Returns the box. */
const place = (parent, placed, lines, cands, o = {}) => {
  const px = o.px || 11.5, lh = px + 4, ws = lines.map((s, i) => IE.textWidth(s, px, i === 0 && o.boldFirst ? 'bold' : (o.weight || ''))),
    w = Math.max(...ws) + 8, h = lines.length * lh + 3, B = o.bounds;
  const boxOf = ([x, y, al]) => { const l = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x; return { l, t: y - h / 2, r: l + w, b: y + h / 2 }; };
  const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const onData = b => { let n = 0; for (const pts of o.avoid || []) for (const [x, y] of pts) if (x > b.l - 2 && x < b.r + 2 && y > b.t - 2 && y < b.b + 2) n++; return n; };
  const ok = b => b.l >= B.l && b.r <= B.r && b.t >= B.t && b.b <= B.b && !placed.some(q => hit(q, b));
  let box = null, best = Infinity;   // first candidate clear of the data; else the one that covers the fewest data points
  for (const c of cands){ const b = boxOf(c); if (!ok(b)) continue; const n = onData(b); if (n === 0){ box = b; break; } if (n < best){ best = n; box = b; } }
  if (!box){ box = boxOf(cands[0]); const dx = Math.max(B.l - box.l, Math.min(0, B.r - box.r)), dy = Math.max(B.t - box.t, Math.min(0, B.b - box.b));
    box = { l: box.l + dx, r: box.r + dx, t: box.t + dy, b: box.b + dy }; }
  IE.svg('rect', { x: box.l, y: box.t, width: w, height: h, rx: 3, class: 'ie-sw-back' }, parent);
  const t = IE.svg('text', { class: 'lbl ie-sw-lab ' + (o.cls || ''), x: box.l + 4, y: box.t + 1.5 + lh / 2 + px * 0.36, style: `font-size:${px}px` + (o.color ? `;fill:${IE.cssColor(o.color)}` : '') }, parent);
  lines.forEach((s, i) => IE.svg('tspan', { x: box.l + 4, dy: i ? lh : null, style: i === 0 && o.boldFirst ? 'font-weight:650' : (o.weight ? `font-weight:${o.weight}` : null), text: s }, t));
  placed.push(box); return box;
};

/* ---------------------------------------------------------------- the sweep chart
   spec = {
     title, summary, height,                 as IE.lineChart
     x: { min, max, fmt, ticks, label }, y: { min, max, fmt, ticks, label, log },
     series: [{ id, label, color, points: [[x, y]], ghost, dash, width }],   main curve(s) + ghosts; y = Infinity breaks the line
     limit: { from, to, text: ['queue grows', 'without limit'], short: '∞' }, the outcome is unbounded on [from, to]: shaded, never plotted
     thresholds: [{ x, y, title: 'knee ≈ 72%', text: ['each +10 points', 'adds > 2 min'], color }],   named points, label + leader line
     you: { x, y, label: 'you: 85%', color: 's5' },                          the reader's own value (dotted line, dot, tag)
     current: { x, y, label, color: 'total' },                               the selection; y non-finite or off-scale → arrow at the top
     hlines: [{ y, label }], onPick: x => …, legend: true|false
   }
   sw.set(patch): patching only `current` (and/or `you`) redraws the overlay and the cursor, so it is cheap per frame. */
IE.sweep = (host, spec) => {
  let S = { ...spec };
  const lineSpec = () => ({ title: S.title, summary: S.summary, height: S.height || 340, x: S.x, y: S.y, hlines: S.hlines, legend: S.legend,
    series: S.series.map(s => ({ endLabel: false, legend: !s.ghost && !s.dash, ...s })), cursor: S.current ? S.current.x : null });
  const ch = IE.lineChart(host, { ...lineSpec(), onPick: S.onPick });
  const ov = IE.svg('g', { class: 'ie-sw-ov' }, ch.el);
  const sw = { el: ch.el, chart: ch, get spec(){ return S; } };

  const draw = () => {
    const geo = ch.el._geo; ov.replaceChildren(); if (!geo) return;
    const { X, Y, pad, pw, ph } = geo, F = { l: pad.l + 2, t: pad.t + 2, r: pad.l + pw - 2, b: pad.t + ph - 2 };
    const ylo = S.y.min, yhi = S.y.max, inY = v => fin(v) && v >= ylo && v <= yhi * 1.0001;
    const placed = [...ch.el.querySelectorAll(':scope > g > text.note')].map(t => { try { const b = t.getBBox(); return { l: b.x - 2, t: b.y - 2, r: b.x + b.width + 2, b: b.y + b.height + 2 }; } catch (_) { return null; } }).filter(Boolean);
    const avoid = S.series.map(s => s.points.filter(([, y]) => inY(y)).map(([x, y]) => [X(x), Y(y)]));
    const vline = (x, cls, style) => { IE.svg('line', { class: cls, x1: x, x2: x, y1: pad.t, y2: pad.t + ph, style }, ov); const o = []; for (let y = pad.t; y <= pad.t + ph; y += 5) o.push([x, y]); avoid.push(o); };
    const labels = [];   // drawn after every mark, so no mark runs over a label

    // unbounded region: shaded, bounded by a dashed line, said in words
    if (S.limit){ const a = X(Math.max(S.limit.from, S.x.min)), b = X(Math.min(S.limit.to ?? S.x.max, S.x.max));
      if (b > a + 1){ IE.svg('rect', { class: 'ie-sw-limit', x: a, y: pad.t, width: b - a, height: ph }, ov); vline(a, 'ie-sw-limline');
        const txt = S.limit.text || ['unbounded'], wmax = Math.max(...txt.map(s => IE.textWidth(s, 11.5))) + 10, one = txt.join(' '), w1 = IE.textWidth(one, 11.5) + 10;
        labels.push(() => {
          if (b - a >= wmax) return place(ov, placed, txt, [[(a + b) / 2, pad.t + ph * 0.55, 'center'], [(a + b) / 2, pad.t + ph * 0.3, 'center'], [(a + b) / 2, pad.t + ph * 0.8, 'center']], { bounds: { l: a, r: b, t: F.t, b: F.b }, cls: 'ie-sw-limtxt' });
          if (b - a >= 18 && w1 <= ph - 10){   // narrow band (phones): the words run up the band
            const cx = (a + b) / 2, cy = pad.t + ph / 2;
            IE.svg('text', { class: 'lbl ie-sw-lab ie-sw-limtxt', x: cx, y: cy + 4, 'text-anchor': 'middle', transform: `rotate(-90 ${cx} ${cy})`, style: 'font-size:11.5px', text: one }, ov);
            placed.push({ l: cx - 9, r: cx + 9, t: cy - w1 / 2, b: cy + w1 / 2 }); return; }
          place(ov, placed, [S.limit.short || one], [[a - 6, pad.t + ph * 0.55, 'right'], [a - 6, pad.t + ph * 0.3, 'right'], [a - 6, pad.t + ph * 0.8, 'right']], { bounds: F, avoid, cls: 'ie-sw-limtxt' });
        });
      } }
    // the reader's own value
    if (S.you && fin(S.you.x) && S.you.x >= S.x.min && S.you.x <= S.x.max){ const yx = X(S.you.x), col = IE.cssColor(S.you.color || 's5');
      vline(yx, 'ie-sw-you', `stroke:${col}`);
      if (inY(S.you.y)) IE.svg('circle', { cx: yx, cy: Y(S.you.y), r: 4, style: `fill:${col}`, class: 'ie-sw-dot' }, ov);
      if (S.you.label) labels.push(() => place(ov, placed, [S.you.label], [[yx, F.t + 10, 'center'], [yx + 6, F.t + 10, 'left'], [yx - 6, F.t + 10, 'right'], ...[30, 50, 75, 100].flatMap(dy => [[yx + 6, F.t + dy, 'left'], [yx - 6, F.t + dy, 'right']])], { bounds: F, avoid, color: S.you.color || 's5' })); }
    // named thresholds: hollow ring on the curve, label in empty space with a leader line
    for (const th of S.thresholds || []){ if (!fin(th.x) || !inY(th.y)) continue; const kx = X(th.x), ky = Y(th.y);
      IE.svg('circle', { cx: kx, cy: ky, r: 4.5, class: 'ie-sw-ring', style: th.color ? `stroke:${IE.cssColor(th.color)}` : null }, ov);
      labels.push(() => { const kc = [];
        for (const dy of [60, 90, 120, 150, 40]) kc.push([kx - 18, ky - dy, 'right'], [kx + 18, ky - dy, 'left']);
        for (const f of [0.4, 0.28, 0.55, 0.18, 0.7]) kc.push([F.l + 6, pad.t + ph * f, 'left']);
        const lines = [th.title, ...(th.text || [])], b = place(ov, placed, lines, kc, { bounds: F, avoid, boldFirst: true, color: th.color });
        const ex = IE.clamp(kx, b.l, b.r), ey = IE.clamp(ky, b.t, b.b), d = Math.hypot(kx - ex, ky - ey);
        if (d > 8) IE.svg('line', { class: 'ie-sw-leader', x1: ex, y1: ey, x2: kx - (kx - ex) / d * 6, y2: ky - (ky - ey) / d * 6 }, ov); }); }
    // the current value (the selection): dot on the curve, or an arrow at the top when off-scale or unbounded
    if (S.current && fin(S.current.x)){ const c = S.current, cx = X(c.x), col = IE.cssColor(c.color || 'total'), off = !inY(c.y), cy = off ? F.t + 6 : Y(c.y);
      avoid.push(Array.from({ length: Math.ceil(ph / 5) + 1 }, (_, i) => [cx, pad.t + i * 5]));
      if (off) IE.svg('path', { d: `M${cx},${pad.t + 1}L${cx - 6},${pad.t + 12}L${cx + 6},${pad.t + 12}Z`, style: `fill:${col}` }, ov);
      else IE.svg('circle', { cx, cy, r: 5.5, style: `fill:${col}`, class: 'ie-sw-dot' }, ov);
      if (c.label) labels.unshift(() => { const cs = off ? [[cx + 10, F.t + 12, 'left'], [cx - 10, F.t + 12, 'right']] : [];
        for (const dy of [-16, 18, -36, 38, -58, 60]) cs.push([cx - 10, cy + dy, 'right'], [cx + 10, cy + dy, 'left']);
        for (const f of [0.12, 0.3, 0.5, 0.75]) cs.push([cx - 10, pad.t + ph * f, 'right'], [cx + 10, pad.t + ph * f, 'left'], [cx, pad.t + ph * f, 'center']);
        place(ov, placed, [c.label], cs, { bounds: F, avoid, weight: 650, cls: 'ie-sw-cur' }); }); }
    labels.forEach(f => f());
  };
  sw.set = patch => {
    S = { ...S, ...patch };
    const cheap = Object.keys(patch).every(k => k === 'current' || k === 'you');
    ch.set(cheap ? { cursor: S.current ? S.current.x : null } : lineSpec());
    draw(); return sw;
  };
  new ResizeObserver(() => requestAnimationFrame(draw)).observe(host);   // after lineChart rebuilds on resize
  IE.theme.onChange(() => requestAnimationFrame(draw));
  draw();
  return sw;
};
IE.sweep.place = place;

/* ---------------------------------------------------------------- small multiples
   The same small chart at 4-6 parameter values on SHARED axes; the panel nearest the selection is outlined; click
   (or Enter) a panel to move the selection there. Columns are at least 300 px wide (auto-fill grid).
   spec = { x: { min, max, fmt }, y: { min, max, fmt }, height: 96, selected: x, onPick: x => …,
            panels: [{ x, caption: 'html', summary: 'text for screen readers',
                       series: [{ points: [[x, y]], color, area, dash, width }] }] }
   sm.set(patch): patching only `selected` just moves the outline. */
IE.sweep.multiples = (host, spec) => {
  let S = { height: 96, ...spec }, lastW = 0;
  host.classList.add('ie-sm-grid');
  const sm = { el: host, get spec(){ return S; } };
  const build = () => {
    host.replaceChildren();
    S.panels.forEach((p, i) => {
      const d = document.createElement('div'); d.className = 'ie-sm'; d.dataset.pick = 'x:' + p.x; d.tabIndex = 0; d.setAttribute('role', 'button');
      d.setAttribute('aria-label', (p.summary || p.caption.replace(/<[^>]+>/g, '')) + '. Select this value.');
      d.innerHTML = `<p class="cap lbl">${p.caption}</p>`; host.appendChild(d);
      const W = Math.max(200, d.clientWidth - 12), H = S.height, pad = { l: 34, r: 8, t: 6, b: 18 }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
      const X = x => pad.l + (x - S.x.min) / (S.x.max - S.x.min) * pw, Y = v => pad.t + ph - (v - S.y.min) / (S.y.max - S.y.min) * ph;   // clipped, not clamped: slopes stay true
      const sv = IE.svg('svg', { class: 'ie-chart ie-sm-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': p.summary || p.caption.replace(/<[^>]+>/g, '') }, d);
      IE.svg('rect', { x: pad.l, y: pad.t, width: pw, height: ph, class: 'ie-sm-frame' }, sv);
      const fy = S.y.fmt || String, fx = S.x.fmt || String;
      IE.svg('text', { class: 'tick', x: pad.l - 4, y: pad.t + 8, 'text-anchor': 'end', text: fy(S.y.max) }, sv);
      IE.svg('text', { class: 'tick', x: pad.l - 4, y: pad.t + ph, 'text-anchor': 'end', text: fy(S.y.min) }, sv);
      IE.svg('text', { class: 'tick', x: pad.l, y: H - 4, text: fx(S.x.min) }, sv);
      IE.svg('text', { class: 'tick', x: pad.l + pw, y: H - 4, 'text-anchor': 'end', text: fx(S.x.max) }, sv);
      const cp = 'c' + Math.random().toString(36).slice(2, 8), clip = IE.svg('clipPath', { id: cp }, sv); IE.svg('rect', { x: pad.l, y: pad.t - 1, width: pw, height: ph + 2 }, clip);
      const g = IE.svg('g', { 'clip-path': `url(#${cp})` }, sv);
      for (const s of p.series || []){ const pts = s.points.filter(q => fin(q[0]) && fin(q[1])).map(([x, y]) => [X(x), Y(y)]); if (!pts.length) continue; const col = IE.cssColor(s.color || 's1');
        if (s.area) IE.svg('path', { d: IE.pathD(pts) + `L${pts[pts.length - 1][0]},${pad.t + ph}L${pts[0][0]},${pad.t + ph}Z`, style: `fill:${col}`, opacity: 0.22 }, g);
        IE.svg('path', { d: IE.pathD(pts), fill: 'none', style: `stroke:${col}`, 'stroke-width': s.width || 1.3, 'stroke-dasharray': s.dash || null, 'stroke-linejoin': 'round' }, g); }
      const pick = () => S.onPick && S.onPick(p.x);
      d.addEventListener('click', pick);
      d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pick(); } });
    });
    lastW = host.clientWidth; mark();
  };
  const mark = () => { if (S.selected == null) return; const i = IE.sweep.nearest(S.panels.map(p => p.x), S.selected);
    [...host.children].forEach((d, k) => d.classList.toggle('on', k === i)); };
  sm.set = patch => { S = { ...S, ...patch }; if (Object.keys(patch).every(k => k === 'selected')) mark(); else build(); return sm; };
  new ResizeObserver(() => { if (Math.abs(host.clientWidth - lastW) > 2) build(); }).observe(host);
  IE.theme.onChange(build);
  build();
  return sm;
};

/* ---------------------------------------------------------------- pure helpers (also fine inside a Node-tested model) */
// Sample f over [lo, hi] (n + 1 points). Non-finite values are kept: the chart breaks the line there.
IE.sweep.curve = (f, lo, hi, n = 400) => Array.from({ length: n + 1 }, (_, i) => { const x = lo + (hi - lo) * i / n; return [x, f(x)]; });
// First x in [lo, hi] (scanning by step) where pred(x) is true, or null.
IE.sweep.firstWhere = (pred, lo, hi, step = (hi - lo) / 1000) => { for (let x = lo; x <= hi + step * 1e-9; x += step) if (pred(x)) return x; return null; };
// Where a monotone f crosses `level` in [lo, hi] (bisection), or null when it does not.
IE.sweep.crossing = (f, level, lo, hi, it = 60) => { let a = lo, b = hi, fa = f(a) - level, fb = f(b) - level;
  if (!isFinite(fb)) fb = Infinity; if (fa === 0) return a; if (Math.sign(fa) === Math.sign(fb)) return null;
  for (let i = 0; i < it; i++){ const m = (a + b) / 2, fm = f(m) - level, s = isFinite(fm) ? fm : Infinity; if (Math.sign(s) === Math.sign(fa)){ a = m; fa = s; } else b = m; } return (a + b) / 2; };
// The first x where f stops being finite (the edge of the unbounded region), by bisection; null if f(hi) is finite.
IE.sweep.limit = (f, lo, hi, it = 60) => { if (isFinite(f(hi))) return null; if (!isFinite(f(lo))) return lo; let a = lo, b = hi;
  for (let i = 0; i < it; i++){ const m = (a + b) / 2; if (isFinite(f(m))) a = m; else b = m; } return b; };
// Index of the value nearest to x.
IE.sweep.nearest = (xs, x) => xs.reduce((b, v, i) => Math.abs(v - x) < Math.abs(xs[b] - x) ? i : b, 0);
})();
