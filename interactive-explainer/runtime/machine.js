/* interactive-explainer runtime: machine.js (IE.machine). An isometric "anatomy" figure for mechanisms that ARE a
   physical object (a token bucket, a pin-tumbler lock, a gearbox): solid parts (box, cylinder, prism) with three-tone
   face shading by facing, painted back to front, one lit accent part, parts that move by translation each frame, and
   words kept OUT of the drawing: a framed card carries "Fig n", the title, a hint and the live readout, and picking a
   part opens its detail card. Colours come from CSS variables, so both themes work. Needs core.js.
   Guide: shapes/machine.md. Pages also include the machine.css block (style tag, data-ie "machine"). */
(function(){
'use strict';
const IE = window.IE;
if (!IE) throw new Error('machine.js needs core.js first');

// ---------------------------------------------------------------- projection and shading
// Isometric: x runs to the lower right, y to the lower left, z up. The viewer looks along -(1,1,1), so larger
// x + y + z is nearer. Faces whose outward normal has n·(1,1,1) > 0 are visible.
const C30 = Math.cos(Math.PI / 6);
const iso = p => [(p[0] - p[1]) * C30, (p[0] + p[1]) * 0.5 - p[2]];
const visible = n => n[0] + n[1] + n[2] > 1e-6;
// tone in [-1, 1]: +1 top (lightest), 0 faces turned to +y (left on screen, mid), -1 faces turned to +x (right, darkest)
const tone = n => { const w = Math.max(0, n[2]), hs = Math.abs(n[0]) + Math.abs(n[1]), h = hs < 1e-9 ? 0 : (n[1] - n[0]) / hs; return w + (1 - w) * (-(1 - h) / 2); };
const LIGHT = 32, DARK = 30;   // % of white on top faces, % of black on the darkest side
const shade = T => T >= 0 ? `color-mix(in oklab, var(--m), white ${Math.round(T * LIGHT)}%)` : `color-mix(in oklab, var(--m), black ${Math.round(-T * DARK)}%)`;
const MATS = ['base', 'steel', 'dark', 'glass', 'paper', 'rubber', 'brass', 'accent', 'token', 'good', 'bad', 'ink'];
const matVar = m => !m ? null : MATS.includes(m) ? `var(--mm-${m})` : IE.cssColor(m);   // material name, core slot ('s3') or css colour

// ---------------------------------------------------------------- solids (lists of faces in model coordinates)
const box = (o, s) => { const [x, y, z] = o, [w, d, h] = s, X = x + w, Y = y + d, Z = z + h;
  return [
    { p: [[x, y, Z], [X, y, Z], [X, Y, Z], [x, Y, Z]], n: [0, 0, 1] },
    { p: [[X, y, z], [X, Y, z], [X, Y, Z], [X, y, Z]], n: [1, 0, 0] },
    { p: [[x, Y, z], [X, Y, z], [X, Y, Z], [x, Y, Z]], n: [0, 1, 0] },
    { p: [[x, y, z], [x, Y, z], [x, Y, Z], [x, y, Z]], n: [-1, 0, 0] },
    { p: [[x, y, z], [X, y, z], [X, y, Z], [x, y, Z]], n: [0, -1, 0] },
    { p: [[x, y, z], [X, y, z], [X, Y, z], [x, Y, z]], n: [0, 0, -1] } ]; };
// convex polygon pts [[u, v]] in the plane across `axis`, extruded from a0 to a0 + len along it
const AX = { z: (u, v, a) => [u, v, a], x: (u, v, a) => [a, u, v], y: (u, v, a) => [u, a, v] };
const AN = { z: [0, 0, 1], x: [1, 0, 0], y: [0, 1, 0] };
const prism = (pts, a0, len, axis = 'z') => {
  const map = AX[axis], an = AN[axis];
  let area = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; });
  if (area < 0) pts = [...pts].reverse();
  const faces = [{ p: pts.map(([u, v]) => map(u, v, a0 + len)), n: an }, { p: [...pts].reverse().map(([u, v]) => map(u, v, a0)), n: an.map(c => -c) }];
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length], du = q[0] - p[0], dv = q[1] - p[1], L = Math.hypot(du, dv) || 1;
    faces.push({ p: [map(p[0], p[1], a0), map(q[0], q[1], a0), map(q[0], q[1], a0 + len), map(p[0], p[1], a0 + len)], n: map(dv / L, -du / L, 0), smooth: true }); });
  return faces;
};
const circle = (cu, cv, r, n) => Array.from({ length: n }, (_, i) => [cu + r * Math.cos(2 * Math.PI * i / n), cv + r * Math.sin(2 * Math.PI * i / n)]);
const aabbOf = faces => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of faces) for (const p of f.p) for (let k = 0; k < 3; k++){ if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; } return [lo, hi]; };

// ---------------------------------------------------------------- motion helpers (pure; honour reduced motion)
const ease = {
  linear: t => IE.clamp(t, 0, 1),
  inOut: t => { t = IE.clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  out: t => 1 - Math.pow(1 - IE.clamp(t, 0, 1), 3),
  in: t => Math.pow(IE.clamp(t, 0, 1), 3),
};
// 0 -> 1 -> 0 pulse over time since an event: eased rise, hold, eased fall (a pure function of time, so it scrubs)
const bump = (dt, rise = 0.15, hold = 0.2, fall = 0.25) => dt < 0 ? 0 : dt < rise ? ease.inOut(dt / rise) : dt < rise + hold ? 1 : ease.inOut(1 - (dt - rise - hold) / fall);
// A displayed value that eases to its target in a bounded time (ease-in-out tween, 0.25-0.7 s by distance), so a jump
// of the selection plays the mechanism forward or back calmly; jumps longer than o.maxJump cut straight to the target.
// update(target, snap) -> current value; snaps when snap is true (e.g. while playing) or the reader prefers reduced
// motion. .moving: draw another frame.
const follow = (v0, o = {}) => {
  const f = { v: v0, target: v0, from: v0, t0: 0, dur: 0,
    update(target, snap){ const now = performance.now();
      if (snap || IE.reducedMotion || !isFinite(f.v)){ f.v = f.target = f.from = target; f.dur = 0; return f.v; }
      if (target !== f.target){ f.from = f.v; f.target = target; f.t0 = now; const d = Math.abs(target - f.from);
        f.dur = d < (o.eps ?? 1e-6) || d > (o.maxJump ?? Infinity) ? 0 : IE.clamp((o.base ?? 0.25) + (o.perUnit ?? 0.04) * d, 0, o.max ?? 0.7) * 1000; }   // a cut, not a fast-forward, past maxJump
      const k = f.dur ? Math.min(1, (now - f.t0) / f.dur) : 1;
      f.v = k >= 1 ? f.target : f.from + (f.target - f.from) * ease.inOut(k); return f.v; },
    get moving(){ return f.v !== f.target; } };
  return f;
};
// critically damped spring step for a value with velocity: returns [x, v]
const spring = (x, v, target, dt, k = 170) => { if (IE.reducedMotion) return [target, 0]; const c = 2 * Math.sqrt(k), a = k * (target - x) - c * v; v += a * dt; return [x + v * dt, v]; };

// ---------------------------------------------------------------- the framed card (words stay out of the drawing)
/* IE.machine.frame(host, { fig: 'Fig 1', title, hint, card: true }) -> { el, body, card, readout(html), hint(html) }
   "Fig n" top left, title top right, the drawing in body, hint bottom left, live readout bottom right, then the
   detail card. Usable on its own around any figure (svg or canvas). */
const frame = (host, o = {}) => {
  if (typeof host === 'string') host = IE.$(host);
  const el = document.createElement('figure'); el.className = 'ie-mach';
  el.innerHTML = `<div class="mh"><span class="mfig lbl">${o.fig || 'Fig 1'}</span><span class="mttl lbl">${o.title || ''}</span></div>` +
    `<div class="msvg"></div><div class="mf"><span class="mhint lbl">${o.hint || 'Click a part to see what it does.'}</span><span class="mro lbl" aria-live="polite"></span></div>` +
    (o.card === false ? '' : `<div class="ie-mcard" aria-live="polite"></div>`);
  host.appendChild(el);
  const ro = el.querySelector('.mro'), hi = el.querySelector('.mhint');
  return { el, body: el.querySelector('.msvg'), card: el.querySelector('.ie-mcard'),
    readout: html => { if (ro.innerHTML !== html) ro.innerHTML = html; }, hint: html => { hi.innerHTML = html; } };
};

// ---------------------------------------------------------------- the figure
/* IE.machine(host, { fig: 'Fig 1', title, hint, label, maxHeight, extent: [[x,y,z]…], onPick: id => …, card: true })
   -> M = { part(id, o), build(), update(), readout(html), pick(id|null), refreshCard(), svg, parts, picked, state }
   part o: { name, info: html | state => html, pick: true | 'groupId' | false, lit, layer, bias, mat }
   part methods: box(o3, size3, mat), cyl([x,y,z], r, h, mat, {axis, n}), prism(pts2, a0, len, mat, {axis}),
                 move([dx,dy,dz]), show(bool), material(mat), clear() (then add solids again; redrawn on update) */
const machine = (host, cfg = {}) => {
  const F = frame(host, cfg), fig = F.el;
  const svg = IE.svg('svg', { role: 'group', 'aria-label': cfg.label || cfg.title || 'Figure', preserveAspectRatio: 'xMidYMid meet' }, F.body);
  IE.svg('title', { text: cfg.label || cfg.title || 'Figure' }, svg);
  if (cfg.maxHeight) svg.style.maxHeight = cfg.maxHeight + 'px';
  const root = IE.svg('g', { class: 'parts' }, svg);
  const parts = new Map(), order = [];
  const M = { svg, fig, parts, picked: null, state: null };

  class Part {
    constructor(id, o){ Object.assign(this, { id, name: o.name || id, info: o.info || '', pick: o.pick === undefined ? !!o.name : o.pick, lit: !!o.lit,
      layer: o.layer ?? 1, bias: o.bias ?? 0, solids: [], t: [0, 0, 0], vis: true, dirty: true });
      this.g = IE.svg('g', { class: 'part' + (this.lit ? ' lit' : '') }, root);
      if (o.mat) this.material(o.mat);
      const pid = this.pick === true ? id : this.pick;
      if (pid){ this.pid = pid; this.g.dataset.pick = pid; this.g.setAttribute('role', 'button');
        this.g.setAttribute('aria-label', o.name || pid);
        this.g.setAttribute('tabindex', [...parts.values()].some(p => p.pid === pid) ? '-1' : '0');   // one tab stop per pickable part
        this.g.addEventListener('click', e => { e.stopPropagation(); M.pick(pid); });
        this.g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); M.pick(pid); } }); }
    }
    add(faces, mat, opt = {}){ this.solids.push({ faces, mat, smooth: opt.smooth, cls: opt.cls, inside: opt.inside }); this.dirty = true; return this; }
    box(o, s, mat, opt){ return this.add(box(o, s), mat, opt); }
    cyl(c, r, h, mat, opt = {}){ const ax = opt.axis || 'z', n = opt.n || (r < 0.2 ? 12 : 24);
      const [u, v, a] = ax === 'z' ? [c[0], c[1], c[2]] : ax === 'x' ? [c[1], c[2], c[0]] : [c[0], c[2], c[1]];
      return this.add(prism(circle(u, v, r, n), a, h, ax), mat, { ...opt, smooth: true }); }
    prism(pts, a0, len, mat, opt = {}){ return this.add(prism(pts, a0, len, opt.axis || 'z'), mat, opt); }
    clear(){ this.solids = []; this.dirty = true; return this; }
    move(t){ if (t[0] !== this.t[0] || t[1] !== this.t[1] || t[2] !== this.t[2]){ this.t = [...t]; this.moved = true; } return this; }
    show(v){ v = !!v; if (v !== this.vis){ this.vis = v; this.g.style.display = v ? '' : 'none'; this.moved = true; } return this; }
    material(m){ if (m !== this.mat){ this.mat = m; this.g.style.setProperty('--m', matVar(m)); } return this; }
    draw(){   // faces -> paths, once per geometry change
      this.g.replaceChildren(); const all = [];
      for (const s of this.solids){
        const sg = IE.svg('g', s.cls ? { class: s.cls } : {}, this.g); if (s.mat) sg.style.setProperty('--m', matVar(s.mat));
        for (const f of s.faces){ if (s.inside ? visible(f.n) : !visible(f.n)) continue;   // inside: the far wall seen through glass
          const n = s.inside ? f.n.map(c => -c) : f.n, fill = shade(tone(n)), d = 'M' + f.p.map(p => iso(p).map(v => v.toFixed(3)).join(',')).join('L') + 'Z';
          IE.svg('path', { d, class: 'f' + (s.smooth && f.smooth ? ' sm' : ''), style: `fill:${fill}` + (s.smooth && f.smooth ? `;stroke:${fill}` : '') }, sg); }
        all.push(...s.faces);
      }
      this.aabb = all.length ? aabbOf(all) : [[0, 0, 0], [0, 0, 0]]; this.dirty = false; this.moved = true;
    }
  }
  M.part = (id, o = {}) => { const p = new Part(id, o); parts.set(id, p); order.push(p); return p; };

  // ---- depth order: a part whose box lies entirely on the far side of another along x, y or z cannot hide it,
  //      so it is painted first (exact for disjoint boxes); overlapping boxes fall back to bias, then x + y + z.
  const sortParts = () => {
    const L = order.filter(p => p.vis && p.solids.length);
    L.forEach(p => { const t = p.t; p.wb = [p.aabb[0].map((v, k) => v + t[k]), p.aabb[1].map((v, k) => v + t[k])];
      p.key = (p.wb[0][0] + p.wb[1][0] + p.wb[0][1] + p.wb[1][1] + p.wb[0][2] + p.wb[1][2]) / 2;
      const cs = []; for (const x of [p.wb[0][0], p.wb[1][0]]) for (const y of [p.wb[0][1], p.wb[1][1]]) for (const z of [p.wb[0][2], p.wb[1][2]]) cs.push(iso([x, y, z]));
      p.sb = [Math.min(...cs.map(c => c[0])), Math.min(...cs.map(c => c[1])), Math.max(...cs.map(c => c[0])), Math.max(...cs.map(c => c[1]))]; });
    const n = L.length, indeg = new Array(n).fill(0), adj = L.map(() => []), e = 1e-6;
    const rel = (A, B) => { if (A.layer !== B.layer) return A.layer < B.layer ? -1 : 1; const a = A.wb, b = B.wb;
      for (let k = 0; k < 3; k++){ if (a[1][k] <= b[0][k] + e) return -1; if (b[1][k] <= a[0][k] + e) return 1; }
      return Math.sign((A.bias - B.bias) || (A.key - B.key)); };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++){ const A = L[i], B = L[j];
      if (A.sb[2] <= B.sb[0] || B.sb[2] <= A.sb[0] || A.sb[3] <= B.sb[1] || B.sb[3] <= A.sb[1]) continue;
      const r = rel(A, B); if (r < 0){ adj[i].push(j); indeg[j]++; } else if (r > 0){ adj[j].push(i); indeg[i]++; } }
    const out = [], done = new Array(n).fill(false), cmp = (a, b) => (L[a].layer - L[b].layer) || (L[a].key + L[a].bias) - (L[b].key + L[b].bias);
    for (let c = 0; c < n; c++){
      let best = -1; for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0 && (best < 0 || cmp(i, best) < 0)) best = i;
      if (best < 0) for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || cmp(i, best) < 0)) best = i;   // a cycle: break it by key
      done[best] = true; out.push(L[best]); for (const j of adj[best]) indeg[j]--;
    }
    return out;
  };
  let painted = [];
  M.update = () => {
    let any = false;
    for (const p of order){ if (p.dirty) p.draw(); if (p.moved){ any = true; p.moved = false; const [sx, sy] = iso(p.t); p.g.setAttribute('transform', `translate(${sx.toFixed(3)},${sy.toFixed(3)})`); } }
    if (any || !painted.length){ const s = sortParts(); if (s.length !== painted.length || s.some((p, i) => p !== painted[i])){ s.forEach(p => root.appendChild(p.g)); painted = s; } }
    if (M.picked) M.refreshCard(true);
    return M;
  };
  // fit the viewBox once to every part (at its current place) plus cfg.extent points, so motion never rescales
  M.build = () => {
    order.forEach(p => { if (p.dirty) p.draw(); });
    const pts = [...(cfg.extent || [])].map(iso);
    order.forEach(p => { const b = p.aabb, t = p.t; for (const x of [b[0][0], b[1][0]]) for (const y of [b[0][1], b[1][1]]) for (const z of [b[0][2], b[1][2]]) pts.push(iso([x + t[0], y + t[1], z + t[2]])); });
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pad = cfg.pad ?? 0.4;
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
    svg.setAttribute('viewBox', `${x0.toFixed(2)} ${y0.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
    M.update(); M.refreshCard(); return M;
  };
  M.readout = html => { F.readout(html); return M; };
  // ---- pick -> detail card
  const card = F.card;
  M.refreshCard = (infoOnly) => {
    if (!card) return;
    const same = M.picked ? [...parts.values()].filter(q => q.pid === M.picked) : [], p = same.find(q => q.info) || same[0];   // the first part of the group that has a text
    if (!p){ if (infoOnly) return; const seen = new Set();
      card.innerHTML = `<span class="mlist">Parts: ${[...parts.values()].filter(q => q.pid && !seen.has(q.pid) && seen.add(q.pid)).map(q => `<button type="button" class="mchip" data-part="${IE.esc(q.pid)}">${IE.esc(q.name)}</button>`).join(' ')}</span>`; return; }
    const info = typeof p.info === 'function' ? p.info(M.state) : p.info;
    const html = `<button type="button" class="mclose" aria-label="Close the part card">×</button><b>${IE.esc(p.name)}</b> <span class="minfo">${info}</span>`;
    if (infoOnly){ const el = card.querySelector('.minfo'); if (el && el.innerHTML !== info) el.innerHTML = info; return; }
    card.innerHTML = html;
  };
  if (card) card.addEventListener('click', e => { const c = e.target.closest('.mchip'); if (c) M.pick(c.dataset.part); else if (e.target.closest('.mclose')) M.pick(null); });
  M.pick = id => { M.picked = id || null;   // picking the same part again keeps its card; × or a click on empty space closes it
    parts.forEach(p => p.g.classList.toggle('picked', !!p.pid && p.pid === M.picked));
    M.refreshCard(); cfg.onPick && cfg.onPick(M.picked); return M; };
  svg.addEventListener('click', () => { if (M.picked) M.pick(null); });
  return M;
};
machine.frame = frame; machine.iso = iso; machine.tone = tone; machine.ease = ease; machine.bump = bump; machine.follow = follow; machine.spring = spring;
machine.solids = { box, prism, circle };
IE.machine = machine;
})();
