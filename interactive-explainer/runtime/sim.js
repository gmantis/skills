/* interactive-explainer runtime: sim.js (IE.sim) — spatial / agent-based simulation stepped over time. Inlined by
   scripts/build.js; edit here, never in a built page. Guide: shapes/sim.md.
   The engine, RNG, repeats and fit helpers are pure and work in Node (set globalThis.IE = {} first), so the page's
   model can be validated headless; IE.sim.view / chart / transport need the DOM and core.js.
   Selection = simulation time (numeric sel, one tick per ← →); the app's play button advances it. */
(function(root){
'use strict';
const IE = root.IE || (root.IE = {});
const S = IE.sim = {};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* IE.sim.rng(seed) -> r(): uniform [0,1), the same stream as IE.seeded (mulberry32), but with its state in r.s so a
   snapshot can store and restore it. r.normal(), r.int(n), r.poisson(mean), r.range(a, b). */
S.rng = (seed = 1) => {
  const r = () => { r.s = (r.s + 0x6D2B79F5) | 0; let t = Math.imul(r.s ^ r.s >>> 15, 1 | r.s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  r.s = seed | 0;
  r.normal = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  r.int = n => Math.floor(r() * n);
  r.range = (a, b) => a + (b - a) * r();
  r.poisson = m => { if (m <= 0) return 0; if (m > 30) return Math.max(0, Math.round(m + Math.sqrt(m) * r.normal()));
    const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
  return r;
};

/* IE.sim.engine(model, { dt, horizon, every: 1, snapEvery: 50, seed: 1 }) -> engine
   model = { init(P, rng) -> state, step(state, P, rng, t, dt) (mutates), measure(state, P, t) -> { key: number },
             clone?(state) (default structuredClone; typed arrays are cheap) }
   engine.run(P, seed)        main run: records measures every `every` ticks and keeps snapshots for scrubbing
   engine.at(t)               state at time t (restores the nearest snapshot <= t and steps forward; cheap when t grows)
   engine.series(key, f?)     [[t, v]] of the main run (f maps t, e.g. s -> min); engine.value(key, t) last record <= t
   engine.headless(P, seed)   one run, records only (for validation)
   engine.repeats(P, n, { seed0, q })   n seeded runs -> { t, n, mean, sd, lo, hi } per key (lo/hi = q and 1-q quantiles)
   engine.spread(P, n, done, o)         the same in slices of `o.chunk` runs per task (UI stays live); cancels the previous one
   Deterministic: the same P and seed give the same run, bit for bit, in the browser and in Node. */
S.engine = (model, o = {}) => {
  const dt = o.dt ?? model.dt ?? 1, horizon = o.horizon ?? model.horizon ?? 100, every = o.every || 1, snapEvery = o.snapEvery || 50;
  const clone = model.clone || (st => structuredClone(st)), nT = Math.max(1, Math.round(horizon / dt));
  const E = { dt, horizon, ticks: nT, every, P: null, seed: o.seed ?? 1, rec: null, snaps: [], cur: null };
  const runOne = (P, seed, snaps) => {
    const rng = S.rng(seed), st = model.init(P, rng), rec = { t: [], v: {} };
    const record = k => { const m = model.measure(st, P, k * dt); rec.t.push(k * dt); for (const key in m) (rec.v[key] || (rec.v[key] = [])).push(m[key]); };
    record(0); if (snaps) snaps.push({ k: 0, st: clone(st), s: rng.s });
    for (let k = 1; k <= nT; k++){
      model.step(st, P, rng, (k - 1) * dt, dt);
      if (k % every === 0 || k === nT) record(k);
      if (snaps && k % snapEvery === 0) snaps.push({ k, st: clone(st), s: rng.s });
    }
    return { rec, st };
  };
  E.tick = t => clamp(Math.floor(t / dt + 1e-9), 0, nT);
  E.run = (P, seed = E.seed) => { E.P = P; E.seed = seed; E.snaps = []; E.rec = runOne(P, seed, E.snaps).rec; E.cur = null; return E; };
  E.at = t => {
    if (!E.rec) throw new Error('IE.sim engine: call run(P) first');
    const k = E.tick(t); let c = E.cur;
    if (!c || c.k > k || k - c.k > snapEvery){ let sn = E.snaps[0]; for (const x of E.snaps){ if (x.k <= k) sn = x; else break; }
      c = { k: sn.k, st: clone(sn.st), rng: S.rng(0) }; c.rng.s = sn.s; }
    while (c.k < k){ model.step(c.st, E.P, c.rng, c.k * dt, dt); c.k++; }
    E.cur = c; return c.st;
  };
  E.series = (key, f = t => t, rec = E.rec) => rec.t.map((t, i) => [f(t), rec.v[key][i]]);
  E.value = (key, t, rec = E.rec) => { const i = clamp(Math.floor(t / (dt * every) + 1e-9), 0, rec.t.length - 1); return rec.v[key][i]; };
  E.headless = (P, seed = 1) => runOne(P, seed, null).rec;
  const summarise = (runs, q) => {
    const out = { t: runs[0].t, n: runs.length, mean: {}, sd: {}, lo: {}, hi: {} }, keys = Object.keys(runs[0].v);
    for (const key of keys){ const m = [], s = [], lo = [], hi = [];
      for (let i = 0; i < out.t.length; i++){ const v = runs.map(r => r.v[key][i]).sort((a, b) => a - b), mu = v.reduce((a, b) => a + b, 0) / v.length;
        m.push(mu); s.push(Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, v.length - 1)));
        const qi = p => { const x = p * (v.length - 1), j = Math.floor(x); return v[j] + (v[Math.min(v.length - 1, j + 1)] - v[j]) * (x - j); };
        lo.push(qi(q)); hi.push(qi(1 - q)); }
      out.mean[key] = m; out.sd[key] = s; out.lo[key] = lo; out.hi[key] = hi; }
    return out;
  };
  E.repeats = (P, n = 10, opt = {}) => { const s0 = opt.seed0 ?? 1000, runs = [];
    for (let i = 0; i < n; i++) runs.push(runOne(P, s0 + i, null).rec);
    return summarise(runs, opt.q ?? 0.1); };
  let job = 0;
  E.spread = (P, n, done, opt = {}) => { const id = ++job, s0 = opt.seed0 ?? 1000, chunk = opt.chunk || 2, runs = [];
    const go = () => { if (id !== job) return; for (let j = 0; j < chunk && runs.length < n; j++) runs.push(runOne(P, s0 + runs.length, null).rec);
      if (runs.length < n) setTimeout(go, 0); else done(summarise(runs, opt.q ?? 0.1)); };
    setTimeout(go, opt.delay ?? 0); return () => { if (id === job) job++; }; };
  return E;
};

/* IE.sim.fitExp(points [[t, y]], { from, to }) -> { k, c0, half } least squares on ln y (y > 0): y ≈ c0·e^(−k t) */
S.fitExp = (pts, o = {}) => { const p = pts.filter(([t, y]) => y > 0 && t >= (o.from ?? -Infinity) && t <= (o.to ?? Infinity));
  const n = p.length; if (n < 2) return { k: NaN, c0: NaN, half: NaN };
  let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const [t, y] of p){ const ly = Math.log(y); sx += t; sy += ly; sxx += t * t; sxy += t * ly; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n; return { k: -b, c0: Math.exp(a), half: Math.LN2 / -b }; };

// ---------------------------------------------------------------- views (DOM)
/* IE.sim.view(host, spec) -> view: a canvas for dense marks (particles, grid cells) under an SVG overlay for walls,
   zones and labels (lintable, themed). World coordinates: origin top-left, x right, y down, in world units (m).
   spec: { world: { w, h }, title, summary, maxHeight: 440, pad: 12, walls: true,
           zones: [{ id, x, y, w, h, label, kind: 'sink'|'source'|'zone', color, pick }],
           draw(ctx, tf, frame) }   tf = { X(x), Y(y), k (px per unit), W, H }
   view.draw(frame) repaints the canvas (call it in render); view.set(patch) changes zones/world and rebuilds the overlay;
   view.zone(id) -> its svg <g> (toggle classes, e.g. 'off'). Clickable zones get data-pick and keyboard access. */
S.view = (host, spec) => {
  const stage = document.createElement('div'); stage.className = 'ie-sim-stage'; host.appendChild(stage);
  const cv = document.createElement('canvas'); stage.appendChild(cv);
  const ov = IE.svg('svg', { class: 'ie-sim-over', role: 'img' }, stage), title = IE.svg('title', {}, ov);
  let SP = {}, tf = null, lastW = 0, frame = null; const zg = new Map();
  const v = { canvas: cv, svg: ov, get tf(){ return tf; } };
  const layout = () => {
    const W = Math.max(280, Math.floor(stage.clientWidth || host.clientWidth || 600)), pad = SP.pad ?? 12, { w, h } = SP.world;
    const k = Math.min((W - 2 * pad) / w, ((SP.maxHeight || 440) - 2 * pad) / h), H = Math.round(h * k + 2 * pad), ox = (W - w * k) / 2, oy = pad;
    cv.dataset.h = H; tf = { W, H, k, ox, oy, X: x => ox + x * k, Y: y => oy + y * k, inv: (px, py) => [(px - ox) / k, (py - oy) / k] };
    for (const [a, b] of [['viewBox', `0 0 ${W} ${H}`], ['width', W], ['height', H]]) ov.setAttribute(a, b);
    lastW = W;
  };
  const overlay = () => {
    ov.querySelectorAll(':scope > g, :scope > path').forEach(e => e.remove()); zg.clear();
    const t = (SP.title || 'Simulation') + (SP.summary ? '. ' + SP.summary : ''); title.textContent = t; ov.setAttribute('aria-label', t);
    const { X, Y, k } = tf, { w, h } = SP.world;
    if (SP.walls !== false) IE.svg('path', { class: 'wall', d: `M${X(0)},${Y(0)}H${X(w)}V${Y(h)}H${X(0)}Z` }, ov);
    const placed = [], g0 = IE.svg('g', {}, ov), gl = IE.svg('g', { class: 'labels' }, ov);
    for (const z of SP.zones || []){
      const pick = z.pick != null ? { 'data-pick': z.pick, tabindex: 0, role: 'button', 'aria-label': z.aria || z.label || z.id } : {};
      const g = IE.svg('g', { class: `zone ${z.kind || 'zone'}${z.off ? ' off' : ''}`, 'data-zone': z.id, ...pick }, g0); zg.set(z.id, g);
      const col = IE.cssColor(z.color || (z.kind === 'sink' ? 's3' : z.kind === 'source' ? 's2' : 'muted'));
      IE.svg('rect', { x: X(z.x), y: Y(z.y), width: z.w * k, height: z.h * k, rx: 3, style: `stroke:${col};fill:${col}` }, g);
      if (!z.label) continue;
      // label: inside the room next to the zone, first spot that fits and is free
      const tw = IE.textWidth(z.label, 11.5, '600') + 4, cx = X(z.x + z.w / 2), cy = Y(z.y + z.h / 2), x0 = X(z.x), x1 = X(z.x + z.w), y0 = Y(z.y), y1 = Y(z.y + z.h);
      const cands = [[x1 + 6, cy + 4, 'start'], [x0 - 6, cy + 4, 'end'], [cx, y1 + 15, 'middle'], [cx, y0 - 6, 'middle'], [cx, cy + 4, 'middle']];
      const box = ([x, y, a]) => { const l = a === 'middle' ? x - tw / 2 : a === 'end' ? x - tw : x; return { l, r: l + tw, t: y - 12, b: y + 4, x, y, a }; };
      const ok = b => b.l >= X(0) + 2 && b.r <= X(w) - 2 && b.t >= Y(0) + 2 && b.b <= Y(h) - 2 && !placed.some(q => b.l < q.r && q.l < b.r && b.t < q.b && q.t < b.b);
      let bx = cands.map(box).find(ok); if (!bx){ bx = box(cands[0]); const s = bx.r > tf.W - 2 ? tf.W - 2 - bx.r : bx.l < 2 ? 2 - bx.l : 0; bx = { ...bx, l: bx.l + s, r: bx.r + s, x: bx.x + s }; }
      placed.push(bx);
      IE.svg('text', { class: 'lbl zl' + (z.off ? ' off' : ''), x: bx.x.toFixed(1), y: bx.y.toFixed(1), 'text-anchor': bx.a, 'data-zone': z.id, text: z.label }, gl);
    }
  };
  v.set = (patch = {}) => { SP = { ...SP, ...patch }; layout(); overlay(); if (frame) v.draw(frame); return v; };
  v.draw = f => { frame = f; if (!tf || Math.max(280, Math.floor(stage.clientWidth)) !== lastW){ layout(); overlay(); }
    const { ctx } = IE.setupCanvas(cv); if (SP.draw) SP.draw(ctx, tf, f); return v; };
  v.zone = id => zg.get(id);
  v.label = (id, text) => { const e = ov.querySelector(`text[data-zone="${id}"]`); if (e && e.textContent !== text) e.textContent = text; };
  ov.addEventListener('click', e => { const t = e.target.closest('[data-pick]'); if (t && SP.onPick) SP.onPick(t.getAttribute('data-pick')); });
  ov.addEventListener('keydown', e => { const t = e.target.closest('[data-pick]'); if (t && SP.onPick && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); SP.onPick(t.getAttribute('data-pick')); } });
  new ResizeObserver(() => { if (stage.clientWidth && Math.max(280, Math.floor(stage.clientWidth)) !== lastW && frame) v.draw(frame); }).observe(stage);
  if (IE.theme) IE.theme.onChange(() => frame && v.draw(frame));
  return v.set(spec);
};
/* canvas helpers for view.draw: dots (particles/agents) and grid cells (fields, epidemics) */
S.dots = (ctx, tf, xs, ys, n, o = {}) => { const r = o.r || 2.4, al = o.alive; ctx.fillStyle = o.color || IE.color('s2'); ctx.globalAlpha = o.alpha ?? 0.9;
  ctx.beginPath(); for (let i = 0; i < n; i++){ if (al && !al[i]) continue; const x = tf.X(xs[i]), y = tf.Y(ys[i]);
    if (o.square) ctx.rect(x - r, y - r, 2 * r, 2 * r); else { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 2 * Math.PI); } }
  ctx.fill(); ctx.globalAlpha = 1; };
S.grid = (ctx, tf, vals, nx, ny, o = {}) => { const { w, h } = o.world, cw = w / nx * tf.k, ch = h / ny * tf.k, mx = o.max || Math.max(...vals, 1e-9);
  ctx.fillStyle = o.color || IE.color('seq3');
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++){ const a = clamp(vals[j * nx + i] / mx, 0, 1); if (a <= 0.01) continue;
    ctx.globalAlpha = a * (o.alpha ?? 0.55); ctx.fillRect(tf.X(0) + i * cw, tf.Y(0) + j * ch, cw + 0.5, ch + 0.5); }
  ctx.globalAlpha = 1; };

/* IE.sim.chart(host, spec) -> IE.lineChart with spread bands: spec.spread = [{ lo: [[x, y]], hi: [[x, y]], color }]
   (e.g. the 10–90% range of N seeded runs). Everything else is IE.lineChart's spec; chart.set(patch) as usual. */
S.chart = (host, spec) => {
  let spreads = [], rest = [], ylog = !!(spec.y && spec.y.log), ymin = spec.y ? spec.y.min : 0;
  const bandSeries = () => spreads.map((b, i) => { const f = p => [p[0], ylog ? Math.max(ymin, p[1]) : p[1]];
    return { id: '__spread' + i, color: b.color || 's1', points: [...b.hi.map(f), ...b.lo.map(f).reverse()], ghost: true, endLabel: false }; });
  const merge = p => { const q = { ...p }; if (p.y){ ylog = !!p.y.log; ymin = p.y.min; }
    if ('spread' in p) spreads = p.spread || []; if ('series' in p) rest = p.series || [];
    if ('spread' in p || 'series' in p || 'y' in p) q.series = [...bandSeries(), ...rest]; delete q.spread; return q; };
  const ch = IE.lineChart(host, merge(spec)), set0 = ch.set;
  const fix = () => spreads.forEach((b, i) => { const p = ch.el.querySelector(`path[data-series="__spread${i}"]`); if (!p) return;
    p.setAttribute('fill', IE.cssColor(b.color || 's1')); p.setAttribute('fill-opacity', '0.22'); p.setAttribute('stroke', 'none'); p.removeAttribute('stroke-dasharray'); p.setAttribute('opacity', '1'); });
  ch.set = p => { set0(merge(p || {})); fix(); return ch; };
  fix(); return ch;
};

/* IE.sim.transport(app, { rates: [['30×', 30], ...], value }) — puts Step ▸ / Reset next to the app's ▶ Play button and a
   speed switch (simulated time units per real second; sets app.cfg.sel.play.rate). Under reduced motion nothing plays
   by itself: the reader presses Play or steps one tick at a time, and each frame is a still state (no trails). */
S.transport = (app, o = {}) => {
  const play = document.getElementById('play'); if (!play) return null;
  const row = document.createElement('div'); row.className = 'ie-sim-transport'; play.replaceWith(row); row.appendChild(play);
  row.insertAdjacentHTML('beforeend', `<button class="btn" type="button" data-sim="step" aria-label="Step one tick (→)">Step ▸</button><button class="btn" type="button" data-sim="reset" aria-label="Back to the start">⟲ Reset</button>`);
  const rates = o.rates || [];
  if (rates.length){ row.insertAdjacentHTML('beforeend', `<div class="seg" role="group" aria-label="Playback speed">${rates.map(([l, r]) => `<button type="button" data-rate="${r}" aria-pressed="false">${l}</button>`).join('')}</div>`); }
  const setRate = r => { if (!app.cfg.sel.play || app.cfg.sel.play === true) app.cfg.sel.play = {}; app.cfg.sel.play.rate = r; row.querySelectorAll('[data-rate]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.rate === r ? 'true' : 'false')); };
  row.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sim === 'step') app.stepSel(1); else if (b.dataset.sim === 'reset'){ app.pause(); app.setSel(app.cfg.sel.min); }
    else if (b.dataset.rate) setRate(+b.dataset.rate); });
  if (rates.length) setRate(o.value ?? rates[0][1]);
  return row;
};
/* mm:ss for seconds (or h:mm:ss) */
S.clock = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

if (typeof module === 'object' && module.exports) module.exports = S;
})(typeof window !== 'undefined' ? window : globalThis);
