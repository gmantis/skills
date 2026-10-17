/* interactive-explainer runtime: graph.js (IE.graph). Boxes and signed arrows: causal networks, structures (no
   weights) and state machines drawn as graphs. Guide: shapes/graph.md. Needs core.js in the page; the maths part
   (IE.graph.net) also loads in Node:  globalThis.IE = {}; require('<skill>/runtime/graph.js');
   Model: linear signed influence x = ext + W·x, solved by rounds of influence (x_{k+1} = ext + W·x_k), so the
   value of every box splits exactly into one share per input, loops get a gain, and runaway loops are detected. */
(function(){
'use strict';
const ROOT = typeof window !== 'undefined' ? window : globalThis;
const IE = ROOT.IE || (ROOT.IE = {});

/* ---------------------------------------------------------------- the model
   def = { nodes: [{ id, label, kind: 'input'|'output'|undefined, desc, pos: [layer, order], level, needs: 'all'|'any' }],
           edges: [{ id, from, to, w: 'paramKey' | number | (p => number) | undefined (= 1), label, desc }], out }
   Parameters p: input levels p['in' + id] (default node.level ?? 1), switches p['off_' + nodeId] and p['cut_' + edgeId]. */
function net(def){
  const nodes = def.nodes, edges = def.edges, ids = nodes.map(n => n.id);
  const idx = Object.fromEntries(ids.map((id, i) => [id, i])), edge = Object.fromEntries(edges.map(e => [e.id, e]));
  if (new Set(ids).size !== ids.length) throw new Error('IE.graph.net: duplicate node id');
  for (const e of edges) if (!(e.from in idx) || !(e.to in idx)) throw new Error(`IE.graph.net: edge ${e.id} joins unknown node ${e.from} -> ${e.to}`);
  const inputs = nodes.filter(n => n.kind === 'input').map(n => n.id);
  const out = def.out || (nodes.find(n => n.kind === 'output') || nodes[nodes.length - 1]).id;
  const isIn = id => nodes[idx[id]].kind === 'input';

  const weight = (e, p = {}) => {
    if (p['cut_' + e.id] || p['off_' + e.from] || p['off_' + e.to]) return 0;
    const w = e.w; return w == null ? 1 : typeof w === 'string' ? +p[w] : typeof w === 'function' ? w(p) : w;
  };
  const ext = (p = {}) => nodes.map(n => n.kind === 'input' && !p['off_' + n.id] ? +(p['in' + n.id] ?? n.level ?? 1) : 0);
  // Rounds of influence from x0 (e.g. the previous steady state) until the change is below tol, or it runs away
  // (|x| > blow), or maxIt rounds pass (a loop gain within a hair of ±1: reported as not settling). o.trace:false skips the trace.
  const settle = (p = {}, x0 = null, o = {}) => {
    const maxIt = o.maxIt || 5000, tol = o.tol || 1e-9, blow = o.blow || 1e6, keep = o.trace !== false, e0 = ext(p);
    const W = edges.map(e => [idx[e.from], idx[e.to], weight(e, p)]).filter(([, b, w]) => w && !isIn(ids[b]));
    let x = x0 ? x0.slice() : e0.slice(); const trace = [x.slice()];
    for (let k = 0; k < maxIt; k++){
      const y = e0.slice(); for (const [a, b, w] of W) y[b] += w * x[a];
      let d = 0, big = 0; for (let i = 0; i < y.length; i++){ d = Math.max(d, Math.abs(y[i] - x[i])); big = Math.max(big, Math.abs(y[i])); }
      x = y; if (keep) trace.push(x.slice());
      if (!(big <= blow)) return { x, trace, converged: false, runaway: true, rounds: k + 1 };
      if (d < tol) return { x, trace, converged: true, rounds: k + 1 };
    }
    return { x, trace, converged: false, runaway: false, rounds: maxIt };
  };
  // Exact fixed point (I - W) x = ext by Gaussian elimination; null when singular. It exists even for runaway loops,
  // where the rounds never reach it, so compare with settle(): equal when settle converged.
  const solve = (p = {}) => {
    const n = ids.length, A = ids.map((_, i) => ids.map((_, j) => i === j ? 1 : 0)), b = ext(p);
    for (const e of edges){ const w = weight(e, p); if (w && !isIn(e.to)) A[idx[e.to]][idx[e.from]] -= w; }
    for (let c = 0; c < n; c++){
      let r = c; for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[r][c])) r = i;
      if (Math.abs(A[r][c]) < 1e-12) return null;
      [A[c], A[r]] = [A[r], A[c]]; [b[c], b[r]] = [b[r], b[c]];
      for (let i = 0; i < n; i++){ if (i === c) continue; const f = A[i][c] / A[c][c]; if (!f) continue; for (let j = c; j < n; j++) A[i][j] -= f * A[c][j]; b[i] -= f * b[c]; }
    }
    return b.map((v, i) => v / A[i][i]);
  };
  // Exact split: the model is linear, so every box = the sum over inputs of "only this input on".
  const decompose = (p = {}) => {
    const by = {};
    for (const id of inputs){ const q = { ...p }; for (const o of inputs) if (o !== id) q['off_' + o] = true; const s = settle(q, null, { trace: false }); by[id] = s.converged ? s.x : null; }
    const ok = inputs.every(id => by[id]);
    return { by, ok, share: (input, node = out) => ok ? by[input][idx[node]] : NaN, sum: (node = out) => ok ? inputs.reduce((a, id) => a + by[id][idx[node]], 0) : NaN };
  };
  // Simple cycles (each found once, from its lowest-index node).
  const cycles = (() => { const outc = [];
    ids.forEach((s, si) => { const dfs = (v, path, seen) => { for (const e of edges.filter(e => e.from === v)){
      const ti = idx[e.to]; if (ti < si) continue;
      if (e.to === s) outc.push([...path, e.id]);
      else if (!seen.has(e.to)){ seen.add(e.to); dfs(e.to, [...path, e.id], seen); seen.delete(e.to); } } };
      dfs(s, [], new Set([s])); });
    return outc; })();
  // Loop gain = product of weights. > 0 reinforcing (R1, R2...), < 0 balancing (B1...), 0 = cut. |gain| >= 1 runs away
  // for a lone loop; with several loops trust settle().converged.
  const loops = (p = {}) => { let nR = 0, nB = 0;
    return cycles.map(c => { const gain = c.reduce((a, id) => a * weight(edge[id], p), 1), type = gain > 0 ? 'R' : gain < 0 ? 'B' : '0';
      return { edges: c, nodes: c.map(id => edge[id].from), gain, type, name: type === 'R' ? 'R' + (++nR) : type === 'B' ? 'B' + (++nB) : 'cut' }; }); };
  const flux = (p, x) => Object.fromEntries(edges.map(e => [e.id, weight(e, p) * x[idx[e.from]]]));
  // Every parameter the model reads: a cheap key to skip re-solving when only view state changed.
  const keys = [...new Set([...edges.filter(e => typeof e.w === 'string').map(e => e.w), ...inputs.map(id => 'in' + id), ...ids.map(id => 'off_' + id), ...edges.map(e => 'cut_' + e.id), ...(def.keys || [])])];
  const key = p => keys.map(k => p[k]).join('|');
  const switches = () => ({ ...Object.fromEntries(ids.map(id => ['off_' + id, false])), ...Object.fromEntries(edges.map(e => ['cut_' + e.id, false])) });
  // Structure what-if: which boxes stop working. A box fails when it is off, or when all (needs:'all', default) or any
  // (needs:'any') of its suppliers failed or their arrows are cut. Boxes without suppliers fail only when off.
  const broken = (p = {}) => { const bad = new Set(ids.filter(id => p['off_' + id]));
    for (let changed = true; changed;){ changed = false;
      for (const n of nodes){ if (bad.has(n.id)) continue; const ins = edges.filter(e => e.to === n.id && e.from !== n.id); if (!ins.length) continue;
        const dead = ins.map(e => !!p['cut_' + e.id] || bad.has(e.from)); if ((n.needs || def.needs) === 'any' ? dead.some(Boolean) : dead.every(Boolean)){ bad.add(n.id); changed = true; } } }
    return bad; };
  // One parameter across a range: [[v, settled value of node | NaN when it runs away]].
  const sweep = (p, k, xs, node = out) => xs.map(v => { const s = settle({ ...p, [k]: v }, null, { trace: false }); return [v, s.converged ? s.x[idx[node]] : NaN]; });
  // Everything a page redraws from, in one call. prevX: the old steady state, so the trace replays the change.
  const run = (p, prevX = null) => {
    const sol = settle(p, prevX), dec = decompose(p), lp = loops(p);
    let rounds;
    if (sol.converged){ const sc = Math.max(1e-9, ...sol.x.map(Math.abs)); let i = sol.trace.findIndex(x => x.every((v, j) => Math.abs(v - sol.x[j]) < 1e-3 * sc)); if (i < 0) i = sol.trace.length - 1; rounds = Math.min(60, Math.max(6, i + 2)); }
    else rounds = Math.min(sol.trace.length - 1, 40);
    return { sol, dec, loops: lp, rounds, converged: sol.converged, x: sol.x, before: sol.trace[0], at: k => sol.trace[Math.max(0, Math.min(sol.trace.length - 1, Math.floor(k + 1e-9)))] };
  };
  // Layered layout: back edges (found by DFS from the inputs) are the feedback arrows; a forward edge that skips
  // layers gets a waypoint in each skipped layer so it routes between boxes, not through them.
  const layout = () => {
    const self = new Set(edges.filter(e => e.from === e.to).map(e => e.id)), back = new Set(), state = {};
    const order = [...inputs, ...ids.filter(id => !inputs.includes(id))];
    const dfs = v => { state[v] = 1; for (const e of edges.filter(e => e.from === v && !self.has(e.id))){ if (state[e.to] === 1) back.add(e.id); else if (!state[e.to]) dfs(e.to); } state[v] = 2; };
    order.forEach(v => { if (!state[v]) dfs(v); });
    const fwd = edges.filter(e => !back.has(e.id) && !self.has(e.id)), layer = {};
    nodes.forEach(n => { if (n.pos) layer[n.id] = n.pos[0]; });
    const L = v => layer[v] ?? (layer[v] = Math.max(0, ...fwd.filter(e => e.to === v).map(e => L(e.from) + 1)));
    nodes.forEach(n => L(n.id));
    const nL = Math.max(...ids.map(id => layer[id])) + 1, rows = [...Array(nL)].map(() => []);
    nodes.forEach(n => rows[layer[n.id]].push(n.id));
    const via = {}, segs = [];
    for (const e of fwd){ const chain = [e.from];
      for (let l = layer[e.from] + 1; l < layer[e.to]; l++){ const d = `~${e.id}~${l}`; layer[d] = l; rows[l].push(d); chain.push(d); }
      chain.push(e.to); via[e.id] = chain.slice(1, -1); for (let i = 1; i < chain.length; i++) segs.push([chain[i - 1], chain[i]]); }
    for (let sweep = 0; sweep < 4; sweep++) rows.forEach((r, li) => { if (!li) return;   // barycentre ordering
      const at = id => { const ps = segs.filter(s => s[1] === id).map(s => rows[layer[s[0]]].indexOf(s[0])); return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : rows[li].indexOf(id); };
      const k = Object.fromEntries(r.map(id => [id, at(id)])); r.sort((a, b) => k[a] - k[b]); });
    nodes.forEach(n => { if (n.pos && n.pos[1] != null){ const r = rows[n.pos[0]]; r.splice(r.indexOf(n.id), 1); r.splice(Math.min(n.pos[1], r.length), 0, n.id); } });
    return { layer, rows, back, via, self };
  };
  const label = id => (nodes[idx[id]] || {}).label || id;
  return { nodes, edges, ids, idx, edge, inputs, out, isIn, label, weight, ext, settle, solve, decompose, cycles, loops, flux, keys, key, switches, broken, sweep, run, layout };
}

const fmtV = v => v == null || !Number.isFinite(v) ? 'runs away' : IE.fmt ? IE.fmt.num(Math.abs(v) < 0.005 ? 0 : v, 2) : v.toFixed(2);

/* Live numbers for prose: x_<node> (settled value), f_<edge> (influence along the arrow), c_<input> (its share of the
   output), c_<input>_<node>, loop<n> / gain<n> / type<n>, out. Values say 'runs away' when the loops do not settle. */
function dyn(N, R, p, fmt = fmtV){
  const v = {}, ok = R.converged, F = N.flux(p, R.x);
  N.nodes.forEach((n, i) => { v['x_' + n.id] = p['off_' + n.id] ? 'switched off' : ok ? fmt(R.x[i]) : 'runs away'; });
  N.edges.forEach(e => { v['f_' + e.id] = ok ? fmt(F[e.id]) : 'runs away'; v['w_' + e.id] = fmt(N.weight(e, p)); });
  N.inputs.forEach(id => { v['c_' + id] = R.dec.ok ? fmt(R.dec.share(id)) : 'runs away';
    N.ids.forEach(t => { v[`c_${id}_${t}`] = R.dec.ok ? fmt(R.dec.share(id, t)) : 'runs away'; }); });
  R.loops.forEach((l, i) => { v['loop' + (i + 1)] = l.name; v['gain' + (i + 1)] = fmt(l.gain); v['type' + (i + 1)] = l.type === 'B' ? 'balancing' : l.type === 'R' ? 'reinforcing' : 'cut'; });
  v.out = v['x_' + N.out];
  return v;
}

/* Detail card HTML for a pick ('n:<id>' | 'e:<id>'). Live numbers via D() (fill them with dyn()). Buttons are
   data-set switches, so the app's click handler applies them. o: { weights: true, fmt } */
function detail(N, pick, p, o = {}){
  const D = IE.D, esc = IE.esc, weights = o.weights !== false;
  if (!pick) return '<p>Click any box or arrow in the map to see what it does and switch it off.</p>';
  const [kind, id] = String(pick).split(':');
  if (kind === 'n' && N.idx[id] != null){
    const n = N.nodes[N.idx[id]], ins = N.edges.filter(e => e.to === id && e.from !== id), outs = N.edges.filter(e => e.from === id && e.to !== id), off = 'off_' + id;
    let h = `<p><b>${esc(n.label)}</b>${weights ? ` = ${D('x_' + id)}` : ''}</p>${n.desc ? `<p>${n.desc}</p>` : ''}`;
    if (ins.length && n.kind !== 'input') h += `<p>${weights ? 'Pushed by' : 'Gets from'}: ${ins.map(e => esc(N.label(e.from)) + (weights ? ` ${D('f_' + e.id)}` : '')).join(', ')}</p>`;
    if (outs.length) h += `<p>${weights ? 'Pushes' : 'Feeds'}: ${outs.map(e => esc(N.label(e.to))).join(', ')}</p>`;
    if (!weights){ const now = N.broken(p), w = N.broken({ ...p, [off]: true }), lost = [...w].filter(x => x !== id && !now.has(x));
      h += `<p>Without it: ${lost.length ? lost.map(x => '<b>' + esc(N.label(x)) + '</b>').join(', ') + ' stop working' : 'nothing else stops working'}.</p>`; }
    return h + `<button type="button" data-set="${off}=${p[off] ? 'false' : 'true'}">${p[off] ? 'Switch it back on' : 'Switch it off'}</button>`;
  }
  if (kind === 'e' && N.edge[id]){
    const e = N.edge[id], cut = 'cut_' + id, lp = N.cycles.map((c, i) => c.includes(id) ? i : -1).filter(i => i >= 0);
    let h = `<p><b>${esc(N.label(e.from))} → ${esc(N.label(e.to))}</b>${e.label ? ` (${esc(e.label)})` : ''}${weights ? `: weight ${D('w_' + id)}, influence now ${D('f_' + id)}` : ''}</p>${e.desc ? `<p>${e.desc}</p>` : ''}`;
    if (lp.length && weights) h += `<p>Part of loop ${lp.map(i => D('loop' + (i + 1))).join(', ')}.</p>`;
    return h + `<button type="button" data-set="${cut}=${p[cut] ? 'false' : 'true'}">${p[cut] ? 'Restore this link' : 'Cut this link'}</button>`;
  }
  return '';
}

/* ---------------------------------------------------------------- the diagram (SVG)
   IE.graph.view(host, N, o) -> V.  o: { title, weights: true (signed badges, width by influence, flow animation),
   values: true (number in each box), loops: true (R/B labels), fmt, onPick: id => ..., nodeW: 140, nodeH: 50,
   minNodeW: 90 (narrower than this: top-to-bottom layout) }.
   V.set({ p, x, focus: [ids] | null, pick: 'n:id' | 'e:id', hot: [ids], broken: Set, loops }) updates attributes only;
   the geometry is rebuilt when the width changes. V.el is the <svg>, V.geo the positions. */
let uid = 0;
function view(host, N, o = {}){
  const LAY = N.layout(), weights = o.weights !== false, values = o.values !== false && weights, showLoops = o.loops !== false && weights;
  const fmt = o.fmt || fmtV, id0 = 'ieg' + (++uid);
  const root = IE.svg('svg', { class: 'ie-graph' + (weights ? '' : ' plain'), role: 'group', 'aria-roledescription': 'diagram' }); host.appendChild(root);
  const V = { el: root, geo: null, state: {} };
  let G = null;
  const build = () => {
    const W = Math.max(280, host.clientWidth || 600), pad = 14, NH = o.nodeH || 50, nL = LAY.rows.length;
    const maxPer = Math.max(...LAY.rows.map(r => r.length)), nBack = LAY.back.size, selfGap = LAY.self.size ? 26 : 0;
    let vert = false, NW = Math.min(o.nodeW || 140, (W - 2 * pad) / nL - 40);
    const backW = nBack ? 34 + 22 * nBack : 0;
    if (NW < (o.minNodeW || 90)){ vert = true; NW = Math.min(o.nodeW || 150, (W - 2 * pad - backW) / maxPer - 14); }
    const pos = {}; let rowsBottom;
    if (!vert){ const colW = (W - 2 * pad) / nL, rowH = NH + 30 + selfGap;
      LAY.rows.forEach((r, li) => r.forEach((id, k) => { pos[id] = { x: pad + colW * (li + 0.5), y: pad + selfGap + (maxPer - r.length) * rowH / 2 + rowH * (k + 0.5) }; }));
      rowsBottom = pad + selfGap + maxPer * rowH; }
    else { const colW = (W - 2 * pad - backW) / maxPer, rowH = NH + 46 + selfGap;
      LAY.rows.forEach((r, li) => r.forEach((id, k) => { pos[id] = { x: pad + (maxPer - r.length) * colW / 2 + colW * (k + 0.5), y: pad + selfGap + NH / 2 + rowH * li }; }));
      rowsBottom = pad + selfGap + NH + (nL - 1) * rowH; }
    root.replaceChildren();
    const title = IE.svg('title', { text: o.title || 'Diagram of boxes and arrows' }, root);
    const defs = IE.svg('defs', {}, root);
    for (const k of ['pos', 'neg', 'zero', 'plain']){ const m = IE.svg('marker', { id: `${id0}-${k}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 9, markerHeight: 9, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, defs);
      IE.svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'mk ' + k }, m); }
    const gE = IE.svg('g', {}, root), gN = IE.svg('g', {}, root), gL = IE.svg('g', {}, root), edges = {}, nodes = {};
    const boxes = N.ids.map(id => ({ l: pos[id].x - NW / 2 - 8, r: pos[id].x + NW / 2 + 8, t: pos[id].y - NH / 2 - 8, b: pos[id].y + NH / 2 + 8 }));
    const inBox = (x, y) => boxes.some(b => x > b.l && x < b.r && y > b.t && y < b.b), placed = [];
    // (u, v) = (along the layers, across them): lets one routine draw feedback arrows in both orientations
    const uv = q => vert ? [q.y, q.x] : [q.x, q.y], xy = ([u, v]) => vert ? [v, u] : [u, v], lh = vert ? NH / 2 : NW / 2, ch = vert ? NW / 2 : NH / 2;
    const lastIn = id => { const r = LAY.rows[LAY.layer[id]].filter(v => N.idx[v] != null); return r[r.length - 1] === id; };
    const laneAt = Math.max(...N.ids.map(id => uv(pos[id])[1])) + ch + (vert ? 18 : 24);
    const free = (x, y, hw, hh) => !inBox(x, y) && placed.every(q => Math.abs(q[0] - x) > q[2] + hw + 3 || Math.abs(q[1] - y) > q[3] + hh + 3);
    let bi = 0, bottom = rowsBottom;
    for (const e of N.edges){
      const a = pos[e.from], b = pos[e.to], isBack = LAY.back.has(e.id), isSelf = LAY.self.has(e.id); let d, cands = [];
      if (isSelf){ const x0 = a.x + NW / 2 - 22, y0 = a.y - NH / 2, x1 = a.x + NW / 2, y1 = a.y - NH / 2 + 12;
        d = `M${x0},${y0} C${x0},${y0 - 30} ${x1 + 26},${y1} ${x1},${y1}`; cands = [[x1 + 4, y0 - 16]]; }
      else if (!isBack){
        const w = LAY.via[e.id].map(v => [pos[v].x, pos[v].y]);
        const pts = vert ? [[a.x, a.y + NH / 2], ...w, [b.x, b.y - NH / 2 - 1]] : [[a.x + NW / 2, a.y], ...w, [b.x - NW / 2 - 1, b.y]];
        d = `M${pts[0][0]},${pts[0][1]}`;
        for (let i = 1; i < pts.length; i++){ const p = pts[i - 1], q = pts[i];
          if (vert){ const dy = (q[1] - p[1]) * 0.45; d += ` C${p[0]},${p[1] + dy} ${q[0]},${q[1] - dy} ${q[0]},${q[1]}`; }
          else { const dx = (q[0] - p[0]) * 0.45; d += ` C${p[0] + dx},${p[1]} ${q[0] - dx},${q[1]} ${q[0]},${q[1]}`; } }
        cands = w.length ? [w[Math.floor((w.length - 1) / 2)], ...w] : []; }
      else {   // feedback: orthogonal route in its own lane beyond every box (below them, or right of them top-to-bottom)
        const k = bi++, r = 12 + 8 * k, vb = laneAt + (vert ? 22 : 34) * k, A = uv(a), B = uv(b);
        const fan = (id, end) => { const l = [...LAY.back].filter(x => N.edge[x][end] === id); return (l.indexOf(e.id) - (l.length - 1) / 2) * 12; };   // several feedback arrows at one box
        const fa = fan(e.from, 'from'), fb = fan(e.to, 'to');
        const exit = lastIn(e.from) ? [[A[0] + fa, A[1] + ch], [A[0] + fa, vb]] : [[A[0] + lh, A[1] + fa], [A[0] + lh + r, A[1] + fa], [A[0] + lh + r, vb]];
        const entry = lastIn(e.to) ? [[B[0] + fb, vb], [B[0] + fb, B[1] + ch + 1]] : [[B[0] - lh - r, vb], [B[0] - lh - r, B[1] + fb], [B[0] - lh - 1, B[1] + fb]];
        const pts = [...exit, ...entry].map(xy); d = rounded(pts, 10);
        const u0 = exit[exit.length - 1][0], u1 = entry[0][0], um = (u0 + u1) / 2;
        cands = [0, -30, 30, -60, 60, -90, 90].map(du => um + du).filter(u => (u - u0) * (u - u1) <= 0).map(u => xy([u, vb]));
        bottom = Math.max(bottom, pts.reduce((q, p) => Math.max(q, p[1]), 0) + 4); }
      const g = IE.svg('g', { class: 'eg', 'data-pick': 'e:' + e.id, tabindex: 0, role: 'button' }, gE);
      const path = IE.svg('path', { d, class: 'edge' }, g), hit = IE.svg('path', { d, class: 'ehit' }, g), tt = IE.svg('title', {}, g);
      const len = path.getTotalLength ? path.getTotalLength() : 0, at = f => { const q = path.getPointAtLength(len * f); return [q.x, q.y]; };
      if (len) for (const f of [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78]) cands.push(at(f));
      const tw = weights ? 18 : e.label ? IE.textWidth(e.label, 11) + 8 : 0, hw = tw / 2, hh = weights ? 9 : 9;
      const mid = cands.find(c => free(c[0], c[1], hw, hh)) || cands[0] || [a.x, a.y]; if (tw) placed.push([mid[0], mid[1], hw, hh]);
      let badge = null, elab = null;
      if (weights){ badge = IE.svg('g', { class: 'badge' }, g); IE.svg('circle', { cx: mid[0], cy: mid[1], r: 9 }, badge); badge.t = IE.svg('text', { x: mid[0], y: mid[1], class: 'badge lbl' }, badge); }
      else if (e.label){ elab = IE.svg('g', { class: 'elabel' }, g);
        IE.svg('rect', { x: mid[0] - tw / 2, y: mid[1] - 9, width: tw, height: 18, rx: 4 }, elab); IE.svg('text', { x: mid[0], y: mid[1] + 4, class: 'elabel lbl', 'text-anchor': 'middle', text: e.label }, elab); }
      bottom = Math.max(bottom, mid[1] + 14);
      edges[e.id] = { g, path, hit, tt, badge, mid, isBack };
    }
    for (const n of N.nodes){
      const p = pos[n.id], g = IE.svg('g', { class: 'node ' + (n.kind || ''), 'data-pick': 'n:' + n.id, tabindex: 0, role: 'button' }, gN);
      IE.svg('rect', { class: 'box', x: p.x - NW / 2, y: p.y - NH / 2, width: NW, height: NH, rx: 8 }, g);
      const bar = values ? IE.svg('rect', { class: 'lvl', x: p.x - NW / 2 + 6, y: p.y + NH / 2 - 7, height: 3, rx: 1.5, width: 0 }, g) : null;
      const lines = wrap(n.label, NW - 12, values ? 2 : 3), lh = 14, top = p.y - ((lines.length - 1) * lh) / 2 - (values ? 7 : 0) + 4;
      lines.forEach((s, i) => IE.svg('text', { x: p.x, y: top + i * lh, 'text-anchor': 'middle', class: 'name lbl', text: s }, g));
      const val = values ? IE.svg('text', { x: p.x, y: top + (lines.length - 1) * lh + 15, 'text-anchor': 'middle', class: 'val lbl' }, g) : null;
      IE.svg('title', { text: n.label }, g);
      nodes[n.id] = { g, bar, val, p };
    }
    // loop labels: under the badge of the loop's feedback arrow (horizontal), beside it (top-to-bottom, where the
    // feedback arrow runs vertically on the right); 'R1 reinforcing' / 'B1 balancing', just 'B1' when narrow
    const loopLbl = showLoops ? N.cycles.map((c, i) => { const be = c.find(id => LAY.back.has(id)) || c[0], m = edges[be].mid;
      const k = N.cycles.slice(0, i).filter(cc => (cc.find(id => LAY.back.has(id)) || cc[0]) === be).length;
      if (!vert){ const y = m[1] + 22 + 14 * k; bottom = Math.max(bottom, y + 6); return IE.svg('text', { x: IE.clamp(m[0], 50, W - 50), y, class: 'loop lbl', 'text-anchor': 'middle' }, gL); }
      const rightOk = m[0] + 14 + 24 < W - 2;
      return IE.svg('text', { x: rightOk ? m[0] + 13 : m[0] - 13, y: m[1] + 4 + 14 * k, class: 'loop lbl', 'text-anchor': rightOk ? 'start' : 'end' }, gL); }) : [];
    const H = Math.ceil(bottom + pad);
    root.setAttribute('viewBox', `0 0 ${W} ${H}`); root.setAttribute('width', W); root.setAttribute('height', H);
    G = { W, H, NW, NH, vert, pos, edges, nodes, loopLbl, title }; V.geo = G;
  };
  const rounded = (pts, rad) => { let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++){ const [p, q, n] = [pts[i - 1], pts[i], pts[i + 1]], l1 = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, l2 = Math.hypot(n[0] - q[0], n[1] - q[1]) || 1, rr = Math.min(rad, l1 / 2, l2 / 2);
      d += ` L${q[0] - (q[0] - p[0]) / l1 * rr},${q[1] - (q[1] - p[1]) / l1 * rr} Q${q[0]},${q[1]} ${q[0] + (n[0] - q[0]) / l2 * rr},${q[1] + (n[1] - q[1]) / l2 * rr}`; }
    const z = pts[pts.length - 1]; return d + ` L${z[0]},${z[1]}`; };
  const wrap = (s, w, max) => { const words = String(s).split(/\s+/), out = []; let cur = '';
    for (const wd of words){ const t = cur ? cur + ' ' + wd : wd; if (!cur || IE.textWidth(t, 12, 'bold') <= w) cur = t; else { out.push(cur); cur = wd; } }
    if (cur) out.push(cur); if (out.length > max){ out.length = max; out[max - 1] += '…'; } return out; };
  const tog = (el, c, on) => { if (el && el.classList.contains(c) !== !!on) el.classList.toggle(c, !!on); };
  const attr = (el, k, v) => { if (el && el.getAttribute(k) !== String(v)) el.setAttribute(k, v); };
  V.set = (s = {}) => {
    Object.assign(V.state, s); const S = V.state, p = S.p || {};
    if (!G || Math.abs(G.W - Math.max(280, host.clientWidth || 600)) > 2) build();
    const x = (S.x || N.ids.map(() => 0)).map(v => Number.isFinite(v) ? v : 0), F = N.flux(p, x);
    const fmax = Math.max(1e-9, ...Object.values(F).map(Math.abs)), vmax = Math.max(1e-9, ...x.map(Math.abs));
    const on = id => !S.focus || S.focus.includes(id), hot = new Set(S.hot || []), br = S.broken || new Set();
    for (const e of N.edges){ const h = G.edges[e.id], w = N.weight(e, p), f = F[e.id], k = !weights ? (w && !br.has(e.from) ? 'plain' : 'zero') : w > 0 ? 'pos' : w < 0 ? 'neg' : 'zero';
      attr(h.path, 'class', `edge ${k}${weights && Math.abs(f) > 1e-6 ? ' flow' : ''}${hot.has(e.id) ? ' hot' : ''}`);
      attr(h.path, 'stroke-width', weights ? (1.5 + 4.5 * Math.abs(f) / fmax).toFixed(1) : hot.has(e.id) ? 3 : 1.6);
      attr(h.path, 'marker-end', `url(#${id0}-${k})`);
      if (weights){ const dur = Math.max(0.35, Math.min(3, 0.6 * fmax / Math.max(Math.abs(f), 1e-6))).toFixed(1) + 's'; if (h.path.style.animationDuration !== dur) h.path.style.animationDuration = dur;
        attr(h.badge, 'class', 'badge ' + k); if (h.badge.t.textContent !== (w > 0 ? '+' : w < 0 ? '−' : '×')) h.badge.t.textContent = w > 0 ? '+' : w < 0 ? '−' : '×'; }
      const desc = `${N.label(e.from)} → ${N.label(e.to)}${e.label ? ' (' + e.label + ')' : ''}` + (weights ? `: weight ${fmt(w)}, influence now ${fmt(f)}` : w ? '' : ': cut');
      if (h.tt.textContent !== desc){ h.tt.textContent = desc; h.g.setAttribute('aria-label', desc); }
      tog(h.g, 'dim', !on(e.id)); tog(h.g, 'sel', S.pick === 'e:' + e.id); }
    N.nodes.forEach((n, i) => { const h = G.nodes[n.id], off = !!p['off_' + n.id];
      if (h.val){ const t = off ? 'switched off' : S.runaway ? 'runs away' : fmt(x[i]); if (h.val.textContent !== t) h.val.textContent = t; }
      if (h.bar){ attr(h.bar, 'width', Math.max(0, (G.NW - 12) * Math.abs(x[i]) / vmax).toFixed(1)); attr(h.bar, 'class', 'lvl ' + (x[i] < 0 ? 'neg' : 'pos')); }
      tog(h.g, 'off', off); tog(h.g, 'broken', br.has(n.id) && !off); tog(h.g, 'sel', S.pick === 'n:' + n.id); tog(h.g, 'hot', hot.has(n.id)); tog(h.g, 'dim', !on(n.id));
      const al = `${n.label}${values ? ': ' + (off ? 'switched off' : S.runaway ? 'runs away' : fmt(x[i])) : off ? ': switched off' : br.has(n.id) ? ': not working' : ''}`; attr(h.g, 'aria-label', al); });
    (S.loops || []).forEach((l, i) => { const t = G.loopLbl[i]; if (!t) return;
      const s = l.type === '0' ? (G.vert ? 'cut' : 'loop cut') : G.vert ? l.name : `${l.name} ${l.type === 'B' ? 'balancing' : 'reinforcing'}`;
      if (t.textContent !== s) t.textContent = s; attr(t, 'class', 'loop lbl ' + l.type); tog(t, 'dim', !l.edges.every(on)); });
    const sum = (o.title || 'Diagram') + (S.summary ? '. ' + S.summary : '');
    if (G.title.textContent !== sum){ G.title.textContent = sum; root.setAttribute('aria-label', sum); }
    return V;
  };
  const pickOf = ev => { const t = ev.target.closest && ev.target.closest('[data-pick]'); return t && root.contains(t) ? t.dataset.pick : null; };
  root.addEventListener('click', ev => { const k = pickOf(ev); if (k && o.onPick) o.onPick(k); });
  root.addEventListener('keydown', ev => { if (ev.key !== 'Enter' && ev.key !== ' ') return; const k = pickOf(ev); if (k && o.onPick){ ev.preventDefault(); o.onPick(k); } });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (G && Math.abs(G.W - Math.max(280, host.clientWidth || 600)) > 2) V.set({}); }).observe(host);
  return V;
}

/* The app's numeric selection is "round of influence" (0..R.rounds). IE.app's sel has a fixed max, so this updates it
   and the slider, and makes ▶ restart from round 0 when it is pressed at the end. replay: start at 0 and play
   (skipped with reduced motion), else jump to the settled end. */
function rounds(app, n, replay){
  const sc = app.cfg.sel; sc.max = n; const sl = typeof document !== 'undefined' && document.getElementById('sel'); if (sl) sl.max = n;
  if (sl && !app._ieReplay){ app._ieReplay = true; const pb = document.getElementById('play');
    if (pb) pb.addEventListener('click', () => { if (app.playing && app.sel >= sc.max - 1e-9) app.setSel(sc.min); }); }
  if (replay && !IE.reducedMotion){ app.setSel(0); app.play(); } else app.setSel(n);
}

IE.graph = { net, view, dyn, detail, rounds, fmt: fmtV };
if (typeof module === 'object' && module.exports) module.exports = IE.graph;
})();
