/* interactive-explainer runtime: sankey.js (IE.sankey). "Where does it go": flows between stages with conserved totals
   (money, energy, records through a pipeline, people through a funnel). Columns by longest path, link widths ∝ value,
   barycentre sweeps against crossings, losses drawn down to their own sink nodes, node labels with value and share,
   pick/hover highlights the share of every upstream and downstream flow that passes through the picked node or link,
   and "follow units" animates dots along those routes. Guide: shapes/sankey.md.
   The pure helpers (graph, balance, follow, fates, removeNode, order, step) also load in Node:
   require('<skill>/runtime/sankey.js') returns IE.sankey, so the page's model can be validated outside the browser.
   Model = { nodes, links } or { nodes, paths }:
     nodes [{ id, label, short?, kind?: 'loss', color?, note?, source? }]
     links [{ source, target, value } | { source, target, values: { measureA, measureB } }]   (totals per link only)
     paths [{ nodes: [id, id, ...], value | values }]   (routes with amounts; links are derived from them)
   With links only, tracing assumes proportional mixing (a node splits whatever enters it in the same ratios). When a
   split depends on where units came from (one source fails validation more often), give paths: tracing is then exact. */
(function(root){
'use strict';
const IE = root.IE || (root.IE = {});
const series = i => 's' + ((i % 8) + 1);
const sum = a => a.reduce((s, v) => s + v, 0);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const measuresOf = links => { const l = links.find(x => x.values); return l ? Object.keys(l.values) : [null]; };
const vOf = (l, m) => m == null || !l.values ? (+l.value || 0) : (+l.values[m] || 0);
const pctOf = (v, of) => !of ? '–' : (IE.fmt ? IE.fmt.pct(v / of, v / of < 0.1 && v / of > 0 ? 1 : 0) : (100 * v / of).toFixed(1) + '%');

/* graph(model, { measure, total, align: 'justify' | 'left', keepEmpty }) -> G
   G = { nodes (with in, out, loss, value, col, role: source|stage|sink|loss, color, ins, outs), links (key 'a>b', value, s, t, loss),
         by: {id: node}, topo, maxCol, total, measure, paths? }. Zero links are dropped, parallel links merged, cycles rejected.
   Sinks that are not losses move to the last column ('justify'); losses sit one column after their source. */
function graph(model, o = {}){
  const nodes = model.nodes, paths = model.paths || null;
  const links = paths ? pathLinks(paths) : model.links || [];
  const m = o.measure !== undefined ? o.measure : measuresOf(paths || links)[0];
  const N = nodes.map((n, i) => ({ ...n, src: i, ins: [], outs: [], in: 0, out: 0, loss: 0 }));
  const by = {}; for (const n of N){ if (by[n.id]) throw new Error(`sankey: duplicate node id "${n.id}"`); by[n.id] = n; }
  const L = [], seen = {};
  for (const l of links){
    const s = by[l.source], t = by[l.target];
    if (!s || !t) throw new Error(`sankey: link ${l.source} → ${l.target} names an unknown node`);
    if (s === t) throw new Error(`sankey: link ${l.source} → ${l.target} loops onto itself`);
    const v = vOf(l, m); if (!(v > 0)) continue;
    const key = s.id + '>' + t.id;
    if (seen[key]){ seen[key].value += v; continue; }
    L.push(seen[key] = { ...l, key, value: v, s, t, loss: t.kind === 'loss' });
  }
  for (const k of L){ k.s.outs.push(k); k.t.ins.push(k); if (k.loss) k.s.loss += k.value; else k.s.out += k.value; k.t.in += k.value; }
  const live = N.filter(n => n.ins.length || n.outs.length || o.keepEmpty);
  const deg = new Map(live.map(n => [n, n.ins.length])), q = live.filter(n => !n.ins.length), topo = [];
  while (q.length){ const n = q.shift(); topo.push(n); for (const l of n.outs){ deg.set(l.t, deg.get(l.t) - 1); if (!deg.get(l.t)) q.push(l.t); } }
  if (topo.length < live.length) throw new Error('sankey: the flows contain a cycle through ' + live.filter(n => !topo.includes(n)).map(n => n.id).join(', '));
  for (const n of topo) n.col = n.ins.length ? Math.max(...n.ins.map(l => l.s.col + 1)) : 0;
  const maxCol = Math.max(0, ...topo.map(n => n.col));
  if (o.align !== 'left') for (const n of topo) if (!n.outs.length && n.kind !== 'loss' && n.ins.length) n.col = maxCol;
  let si = 0;
  live.forEach((n, i) => { n.i = i; n.value = Math.max(n.in, n.out + n.loss);
    n.role = !n.ins.length ? 'source' : n.kind === 'loss' ? 'loss' : !n.outs.length ? 'sink' : 'stage';
    if (!n.color) n.color = n.role === 'source' ? series(si++) : n.role === 'loss' ? 'bad' : n.role === 'sink' ? 'good' : 'ink2'; });
  const total = o.total ?? sum(live.filter(n => n.role === 'source').map(n => n.value));
  const G = { _sk: true, nodes: live, links: L, by: Object.fromEntries(live.map(n => [n.id, n])), topo, maxCol, total, measure: m, paths: null };
  if (paths) G.paths = paths.map(p => ({ src: p, value: vOf(p, m), nodes: p.nodes.map(id => by[id]),
    links: p.nodes.slice(1).map((id, j) => seen[p.nodes[j] + '>' + id]) })).filter(p => p.value > 0);
  return G;
}
// links derived from paths: every consecutive pair of a route, summed per measure
function pathLinks(paths){
  const ms = measuresOf(paths), out = {}, list = [];
  for (const p of paths){ if (!Array.isArray(p.nodes) || p.nodes.length < 2) throw new Error('sankey: a path needs at least two nodes: ' + JSON.stringify(p.nodes));
    for (let j = 1; j < p.nodes.length; j++){ const k = p.nodes[j - 1] + '>' + p.nodes[j];
      if (!out[k]){ out[k] = { source: p.nodes[j - 1], target: p.nodes[j], ...(ms[0] == null ? { value: 0 } : { values: Object.fromEntries(ms.map(x => [x, 0])) }) }; list.push(out[k]); }
      if (ms[0] == null) out[k].value += vOf(p, null); else for (const x of ms) out[k].values[x] += vOf(p, x); } }
  return list;
}
const G_ = (g, o) => g && g._sk ? g : graph(g, o || {});

/* balance(G) -> { rows: [{ id, label, role, in, out, loss, diff }], totalIn, delivered, lost, maxDiff, ok }
   Conservation: every stage has in = out + losses, and everything that enters ends in a sink or a loss. */
function balance(g, tol = 1e-9){
  const G = G_(g), rows = G.nodes.map(n => ({ id: n.id, label: n.label, role: n.role, in: n.in, out: n.out, loss: n.loss, diff: n.role === 'stage' ? n.in - n.out - n.loss : 0 }));
  const totalIn = sum(G.nodes.filter(n => n.role === 'source').map(n => n.value)), delivered = sum(G.nodes.filter(n => n.role === 'sink').map(n => n.in)), lost = sum(G.nodes.filter(n => n.role === 'loss').map(n => n.in));
  const maxDiff = Math.max(Math.abs(totalIn - delivered - lost), ...rows.map(r => Math.abs(r.diff)));
  return { rows, totalIn, delivered, lost, maxDiff, ok: maxDiff <= tol * Math.max(1, totalIn) };
}

/* follow(G, key) with key 'n:<id>' or 'l:<source>><target>' -> { node | link, amount, up: Map(link -> amount), down: Map(link -> amount),
   nodes: Set, fate: { endId: fraction }, origin: { sourceId: fraction } }. Assumes proportional mixing: a node splits
   whatever enters it in the same ratios, so "the part of each flow that passes through the pick" is exact. */
function follow(g, key){
  const G = G_(g); if (!key) return null;
  const T = key.startsWith('n:') ? G.by[key.slice(2)] : null, V = !T && key.startsWith('l:') ? G.links.find(l => l.key === key.slice(2)) : null;
  if (!T && !V) return null;
  if (G.paths){   // exact: sum the routes that pass through the pick
    const up = new Map(), down = new Map(), nodes = new Set(), fate = {}, origin = {}; let amount = 0;
    for (const p of G.paths){ const k = T ? p.nodes.indexOf(T) : p.links.indexOf(V); if (k < 0) continue; amount += p.value;
      p.links.forEach((l, j) => { const mp = j < k || (V && j === k) ? up : down; mp.set(l, (mp.get(l) || 0) + p.value); });
      p.nodes.forEach(n => nodes.add(n)); const a = p.nodes[0].id, z = p.nodes[p.nodes.length - 1].id;
      origin[a] = (origin[a] || 0) + p.value; fate[z] = (fate[z] || 0) + p.value; }
    for (const o of [fate, origin]) for (const k in o) o[k] /= amount || 1;
    return { key, node: T, link: V, amount, up, down, nodes, fate, origin, exact: true };
  }
  const of = n => n.out + n.loss, pos = new Map(G.topo.map((n, i) => [n, i]));
  const r = new Map(), up = new Map(), down = new Map(), q = new Map(), start = T || V.s;
  r.set(start, T ? 1 : V.value / (of(V.s) || 1));
  for (let k = pos.get(start) - 1; k >= 0; k--){ const n = G.topo[k], o = of(n); if (!o) continue; let f = 0;
    for (const l of n.outs) if (r.has(l.t)) f += l.value / o * r.get(l.t); if (f > 0) r.set(n, f); }
  for (const [n, f] of r) for (const l of n.ins) up.set(l, l.value * f);
  if (V) up.set(V, V.value);
  const amount = T ? T.value : V.value, first = T || V.t;
  q.set(first, T ? of(T) : V.value);
  for (let k = pos.get(first); k < G.topo.length; k++){ const n = G.topo[k], a = q.get(n), o = of(n); if (!a || !o) continue;
    for (const l of n.outs){ const v = a * l.value / o; down.set(l, (down.get(l) || 0) + v); q.set(l.t, (q.get(l.t) || 0) + v); } }
  const fate = {}, origin = {};
  if (T && (T.role === 'sink' || T.role === 'loss')) fate[T.id] = 1;
  else for (const [n, a] of q) if ((n.role === 'sink' || n.role === 'loss') && a > 0) fate[n.id] = a / amount;
  if (T && T.role === 'source') origin[T.id] = 1;
  else for (const [n, f] of r) if (n.role === 'source') origin[n.id] = n.value * f / amount;
  const nodes = new Set([...r.keys(), ...q.keys()]); if (V){ nodes.add(V.s); nodes.add(V.t); }
  return { key, node: T, link: V, amount, up, down, nodes, fate, origin, exact: false };
}
// fates(G) -> { sources: [id], ends: [id], m: { sourceId: { endId: fraction } } }: where each source's units end up
function fates(g){
  const G = G_(g), sources = G.nodes.filter(n => n.role === 'source').map(n => n.id), ends = G.nodes.filter(n => n.role === 'sink' || n.role === 'loss').map(n => n.id), m = {};
  for (const s of sources){ const f = follow(G, 'n:' + s).fate; m[s] = Object.fromEntries(ends.map(e => [e, f[e] || 0])); }
  return { sources, ends, m };
}

/* removeNode(model, id, { mode: 'reroute' | 'drop', label, short }) -> new { nodes, links } (pure; every measure).
   'reroute': what entered the node goes straight on to its non-loss targets in its split ratios (its losses no longer
   happen). 'drop': what entered goes to a new loss sink 'dropped:<id>'. Downstream flows are then re-propagated with
   each node's split ratios, so conservation still holds everywhere. A node with only loss outputs is always dropped. */
function removeNode(model, id, o = {}){
  if (model.paths) return removeOnPaths(model, id, o);
  const { nodes, links } = model, node = nodes.find(n => n.id === id); if (!node) return model;
  const kind = Object.fromEntries(nodes.map(n => [n.id, n.kind])), ms = measuresOf(links);
  const hadIn = new Set(links.filter(l => sum(ms.map(m => vOf(l, m))) > 0).map(l => l.target));
  const setV = (l, f) => l.values ? { ...l, values: Object.fromEntries(Object.keys(l.values).map(k => [k, f(k)])) } : { ...l, value: f(null) };
  const ins = links.filter(l => l.target === id), outs = links.filter(l => l.source === id), keep = outs.filter(l => kind[l.target] !== 'loss');
  let L = links.filter(l => l.source !== id && l.target !== id).map(l => setV(l, m => vOf(l, m)));
  let N = nodes.filter(n => n.id !== id);
  if (o.mode === 'drop' || !keep.length){
    const did = 'dropped:' + id;
    N.push({ id: did, label: o.label || `Dropped (no ${node.label})`, short: o.short || 'Dropped', kind: 'loss', note: o.note });
    for (const l of ins) L.push(setV({ ...l, target: did }, m => vOf(l, m)));
  } else {
    for (const a of ins) for (const k of keep) L.push(setV({ source: a.source, target: k.target, ...(a.values ? { values: a.values } : { value: a.value }) },
      m => { const tot = sum(keep.map(x => vOf(x, m))); return tot ? vOf(a, m) * vOf(k, m) / tot : 0; }));
  }
  const merged = {}; L = L.filter(l => { const k = l.source + '>' + l.target; if (!merged[k]){ merged[k] = l; return true; }
    const p = merged[k]; if (p.values) for (const m of Object.keys(p.values)) p.values[m] += vOf(l, m); else p.value += l.value; return false; });
  // re-propagate in topological order: each node keeps its split ratios, scaled to what now flows in
  const ids = N.map(n => n.id), inL = id => L.filter(l => l.target === id), outL = id => L.filter(l => l.source === id);
  const deg = Object.fromEntries(ids.map(i => [i, inL(i).length])), qq = ids.filter(i => !deg[i]), topo = [];
  while (qq.length){ const i = qq.shift(); topo.push(i); for (const l of outL(i)){ if (!--deg[l.target]) qq.push(l.target); } }
  for (const m of ms) for (const i of topo){
    const li = inL(i), lo = outL(i); if (!lo.length || (!li.length && !hadIn.has(i))) continue;
    const a = sum(li.map(l => vOf(l, m))), tot = sum(lo.map(l => vOf(l, m)));
    for (const l of lo){ const v = tot ? a * vOf(l, m) / tot : 0; if (l.values) l.values[m] = v; else l.value = v; } }
  return { ...model, nodes: N, links: L };
}
/* paths form: 'drop' cuts each route through the node at the node, ending in 'dropped:<id>'; 'reroute' skips the node,
   and the routes that ended there (or went on into one of its losses) continue like the routes that went on, in their
   proportions (downstream is assumed not to depend on where a unit came from). Routes that start at the node vanish. */
function removeOnPaths(model, id, o){
  const node = model.nodes.find(n => n.id === id); if (!node) return model;
  const kind = Object.fromEntries(model.nodes.map(n => [n.id, n.kind])), ms = measuresOf(model.paths);
  const val = (p, m) => vOf(p, m), mk = (nodes, f) => ({ nodes, ...(ms[0] == null ? { value: f(null) } : { values: Object.fromEntries(ms.map(m => [m, f(m)])) }) });
  const thru = [], out = [];
  for (const p of model.paths){ const k = p.nodes.indexOf(id); if (k < 0) out.push(mk([...p.nodes], m => val(p, m))); else if (k > 0) thru.push({ p, k }); }
  const cont = thru.filter(({ p, k }) => k < p.nodes.length - 1 && kind[p.nodes[k + 1]] !== 'loss'), ends = thru.filter(x => !cont.includes(x));
  let N = model.nodes.filter(n => n.id !== id);
  if (o.mode === 'drop' || !cont.length){
    const did = 'dropped:' + id;
    N.push({ id: did, label: o.label || `Dropped (no ${node.label})`, short: o.short || 'Dropped', kind: 'loss', note: o.note });
    for (const { p, k } of thru) out.push(mk([...p.nodes.slice(0, k), did], m => val(p, m)));
  } else {
    for (const { p, k } of cont) out.push(mk([...p.nodes.slice(0, k), ...p.nodes.slice(k + 1)], m => val(p, m)));
    for (const { p, k } of ends) for (const c of cont) out.push(mk([...p.nodes.slice(0, k), ...c.p.nodes.slice(c.k + 1)],
      m => { const tot = sum(cont.map(x => val(x.p, m))); return tot ? val(p, m) * val(c.p, m) / tot : 0; }));
  }
  const seen = {}, paths = out.filter(p => { const k = p.nodes.join('>'); if (!seen[k]){ seen[k] = p; return true; }
    const q = seen[k]; if (q.values) for (const m of ms) q.values[m] += p.values[m]; else q.value += p.value; return false; });
  return { ...model, nodes: N, paths };
}
// order(G): node keys by column, top to bottom (after layout) or input order; step(G, key, dir): the next one, cyclic
const order = g => { const G = G_(g); return [...G.nodes].sort((a, b) => a.col - b.col || (a.y0 ?? a.src) - (b.y0 ?? b.src)).map(n => 'n:' + n.id); };
const step = (g, key, dir) => { const o = order(g), i = o.indexOf(key); if (!o.length) return null; return i < 0 ? o[dir > 0 ? 0 : o.length - 1] : o[(i + dir + o.length) % o.length]; };

/* layout(G, { width, height, nodeW = 12, gap = 16, padT, padB, padL, padR, iterations = 8 }) sets n.x0 x1 y0 y1 h and
   l.w sy ty (top of the link band at source and target), returns { ky, dx, cols }. Barycentre sweeps left→right and
   right→left order and relax each column; losses stay last in their column. */
function layout(g, o){
  const G = G_(g), W = o.width, H = o.height, nodeW = o.nodeW ?? 12, gap = o.gap ?? 16, padT = o.padT ?? 8, padB = o.padB ?? 8, padL = o.padL ?? 1, padR = o.padR ?? 1;
  const nc = G.maxCol + 1, cols = Array.from({ length: nc }, () => []);
  G.nodes.forEach(n => cols[n.col].push(n));
  const dx = nc > 1 ? (W - padL - padR - nodeW) / (nc - 1) : 0;
  G.nodes.forEach(n => { n.x0 = padL + n.col * dx; n.x1 = n.x0 + nodeW; });
  const ky = Math.max(1e-12, Math.min(...cols.filter(c => c.length).map(c => (H - padT - padB - (c.length - 1) * gap) / Math.max(1e-12, sum(c.map(n => n.value))))));
  G.nodes.forEach(n => { n.h = Math.max(2, n.value * ky); });
  G.links.forEach(l => { l.w = l.value * ky; });
  const mid = n => n.y0 + n.h / 2, isL = n => n.kind === 'loss' ? 1 : 0;
  const resolve = c => { c.sort((a, b) => isL(a) - isL(b) || a.y0 - b.y0);
    let y = padT; for (const n of c){ if (n.y0 < y) n.y0 = y; y = n.y0 + n.h + gap; }
    let yb = H - padB; for (let i = c.length - 1; i >= 0; i--){ const n = c[i]; if (n.y0 + n.h > yb) n.y0 = yb - n.h; yb = n.y0 - gap; }
    y = padT; for (const n of c){ if (n.y0 < y) n.y0 = y; y = n.y0 + n.h + gap; } };
  for (const c of cols){ c.sort((a, b) => isL(a) - isL(b) || a.src - b.src); const tot = sum(c.map(n => n.h)) + gap * (c.length - 1);
    let y = padT + Math.max(0, (H - padT - padB - tot) / 2); for (const n of c){ n.y0 = y; y += n.h + gap; } }
  const toward = (n, ls, end) => { const w = sum(ls.map(l => l.value)); if (!w) return; n.y0 += (sum(ls.map(l => mid(l[end]) * l.value)) / w - mid(n)) * toward.a; };
  for (let it = 0; it < (o.iterations ?? 8); it++){ toward.a = Math.pow(0.85, it);
    for (let k = 1; k < nc; k++){ for (const n of cols[k]) toward(n, n.ins, 's'); resolve(cols[k]); }
    for (let k = nc - 2; k >= 0; k--){ for (const n of cols[k]) toward(n, n.outs.filter(l => !l.loss), 't'); resolve(cols[k]); } }
  for (const n of G.nodes){ n.y1 = n.y0 + n.h;
    n.outs.sort((p, q) => mid(p.t) - mid(q.t) || p.t.col - q.t.col); let y = n.y0; for (const l of n.outs){ l.sy = y; y += l.w; }
    n.ins.sort((p, q) => mid(p.s) - mid(q.s)); y = n.y0; for (const l of n.ins){ l.ty = y; y += l.w; } }
  return { ky, dx, cols, W, H, nodeW };
}
const bandPath = (l, w, a = l.sy, b = l.ty) => { const x0 = l.s.x1, x1 = l.t.x0, xm = (x0 + x1) / 2;
  return `M${x0},${a}C${xm},${a} ${xm},${b} ${x1},${b}L${x1},${b + w}C${xm},${b + w} ${xm},${a + w} ${x0},${a + w}Z`; };
function fit(s, maxW, px = 12, w = ''){
  s = String(s ?? ''); if (IE.textWidth(s, px, w) <= maxW) return s;
  let lo = 0, hi = s.length; while (lo < hi){ const mid = (lo + hi + 1) >> 1; if (IE.textWidth(s.slice(0, mid).trimEnd() + '…', px, w) <= maxW) lo = mid; else hi = mid - 1; }
  return lo < 3 ? '' : s.slice(0, lo).trimEnd() + '…';
}

/* ============================================================== the view
   sk = IE.sankey(host, spec); sk.set(patch)
   spec: { nodes, links | paths, measure, fmt: v => text, unit: 'records', total, title, summary, height, minWidth: 560, nodeW, gap,
           align, selected: 'n:<id>' | 'l:<a>><b>' | null, particles: false | true | count, onPick(key | null) }
   Patching only `selected` / `particles` updates the highlight and dots in place; anything else rebuilds. Narrower hosts
   than minWidth scroll sideways inside the panel (labels need room between columns). */
function view(host, spec){
  host.classList.add('ie-sk');
  const wrap = document.createElement('div'); wrap.className = 'sk-scroll scroll'; host.appendChild(wrap);
  const root = IE.svg('svg', { class: 'ie-chart sk', role: 'group' }, wrap);   // group, not img: it holds focusable nodes and flows
  const title = IE.svg('title', {}, root), gL = IE.svg('g', { class: 'sk-links' }, root), gO = IE.svg('g', { class: 'sk-over' }, root),
    gN = IE.svg('g', { class: 'sk-nodes' }, root), gD = IE.svg('g', { class: 'sk-dots' }, root), gT = IE.svg('g', { class: 'sk-labels' }, root);
  let S = null, G = null, LY = null, lastW = -1, hover = null, selF = null, nodeEls = new Map(), linkEls = new Map();
  const sk = { el: root };
  const fmtV = v => (S.fmt || IE.fmt.int)(v), unit = () => S.unit ? ' ' + S.unit : '';
  const share = v => pctOf(v, G.total);

  const build = () => {
    G = graph({ nodes: S.nodes, links: S.links, paths: S.paths }, { measure: S.measure, total: S.total, align: S.align });
    const hostW = wrap.clientWidth || host.clientWidth || 800, W = Math.max(S.minWidth ?? 560, hostW); lastW = hostW;
    const valTxt = n => `${fmtV(n.value)} · ${share(n.value)}`;
    const lastCol = G.nodes.filter(n => n.col === G.maxCol);
    const padR = Math.min(W * 0.24, 14 + Math.max(40, ...lastCol.map(n => Math.max(IE.textWidth(n.label, 12, '600'), IE.textWidth(valTxt(n), 11)))));
    const H = S.height || IE.clamp(Math.round(W * 0.42), 280, 520);
    LY = layout(G, { width: W, height: H, padR, nodeW: S.nodeW, gap: S.gap, padT: 10, padB: 10 });
    root.setAttribute('viewBox', `0 0 ${W} ${H}`); root.setAttribute('width', W); root.setAttribute('height', H);
    const srcs = G.nodes.filter(n => n.role === 'source'), ends = G.nodes.filter(n => n.role === 'sink' || n.role === 'loss').sort((a, b) => b.value - a.value);
    title.textContent = `${S.title || 'Flows'}: ${fmtV(G.total)}${unit()} enter from ${srcs.map(n => n.label).join(', ')}; they end in ${ends.map(n => `${n.label} ${share(n.value)}`).join(', ')}` + (S.summary ? '. ' + S.summary : '');
    root.setAttribute('aria-label', title.textContent);
    for (const g of [gL, gO, gN, gD, gT]) g.replaceChildren(); nodeEls = new Map(); linkEls = new Map();
    IE.svg('rect', { class: 'sk-bg', x: 0, y: 0, width: W, height: H, fill: 'transparent' }, gL);
    for (const l of G.links){
      const p = IE.svg('path', { class: 'sk-link' + (l.loss ? ' loss' : ''), d: bandPath(l, Math.max(0.6, l.w)), style: `--c:${IE.cssColor(l.loss ? 'bad' : l.s.color)}`,
        'data-pick': 'l:' + l.key, tabindex: 0, role: 'button', 'aria-label': `${l.s.label} to ${l.t.label}: ${fmtV(l.value)}${unit()}, ${pctOf(l.value, l.s.out + l.s.loss)} of ${l.s.label}` }, gL);
      IE.svg('title', { text: `${l.s.label} → ${l.t.label}: ${fmtV(l.value)}${unit()} (${pctOf(l.value, l.s.out + l.s.loss)} of ${l.s.label}, ${share(l.value)} of all)` }, p);
      linkEls.set(l.key, p);
    }
    for (const n of G.nodes){
      const g = IE.svg('g', { class: `sk-node ${n.role}`, 'data-pick': 'n:' + n.id, tabindex: 0, role: 'button', style: `--c:${IE.cssColor(n.color)}`,
        'aria-label': `${n.label}: ${fmtV(n.value)}${unit()}, ${share(n.value)} of the total` }, gN);
      IE.svg('rect', { x: n.x0, y: n.y0, width: n.x1 - n.x0, height: n.h, rx: 2 }, g);
      IE.svg('rect', { class: 'hit', x: n.x0 - 4, y: n.y0 - 2, width: n.x1 - n.x0 + 8, height: n.h + 4 }, g);
      IE.svg('title', { text: `${n.label}: ${fmtV(n.value)}${unit()} (${share(n.value)})` }, g);
      nodeEls.set(n.id, g);
    }
    // labels right of each node, de-overlapped per column (two lines, else one, else the smallest go to the card)
    for (const c of LY.cols){ if (!c.length) continue;
      const col = c[0].col, maxW = col === G.maxCol ? padR - 8 : LY.dx - LY.nodeW - 14;
      let items = c.map(n => ({ n, y: n.y0 + n.h / 2 })), two = items.length * 30 <= H - 8;
      if (!two && items.length * 16 > H - 8){ const keep = new Set([...items].sort((a, b) => b.n.value - a.n.value).slice(0, Math.floor((H - 8) / 16)).map(i => i.n)); items = items.filter(i => keep.has(i.n)); }
      IE.spread(items, two ? 30 : 16, two ? 16 : 10, H - (two ? 20 : 6));
      for (const it of items){ const n = it.n, name = fit(n.label, maxW, 12, '600') || fit(n.short, maxW, 12, '600'); if (!name) continue;
        const x = n.x1 + 6, g = IE.svg('g', { class: 'sk-lbl ' + n.role, 'data-node': n.id }, gT);
        IE.svg('text', { class: 'lbl sk-name', x, y: two ? it.ly - 2 : it.ly + 4, text: name }, g);
        const vt = fit(valTxt(n), maxW, 11); if (two && vt) IE.svg('text', { class: 'lbl sk-val', x, y: it.ly + 12, text: vt }, g); }
    }
    resetDots();
  };

  // ---- highlight: the part of every flow that passes through the hovered or picked node/link
  const overlay = () => {
    if (!G) return;
    const key = hover || S.selected, F = key ? follow(G, key) : null;
    selF = S.selected ? (key === S.selected ? F : follow(G, S.selected)) : null;
    root.classList.toggle('has-sel', !!F);
    for (const [id, g] of nodeEls){ g.classList.toggle('hl', !!(F && F.nodes.has(G.by[id]))); g.classList.toggle('on', S.selected === 'n:' + id); }
    for (const [k, p] of linkEls) p.classList.toggle('on', S.selected === 'l:' + k);
    gT.querySelectorAll('.sk-lbl').forEach(g => g.classList.toggle('fade', !!(F && !F.nodes.has(G.by[g.dataset.node]))));
    gO.replaceChildren(); if (!F) return;
    // one highlight colour: the source's own when the pick belongs to a single source, else neutral ink; losses stay red
    const one = Object.keys(F.origin).length === 1 ? G.by[Object.keys(F.origin)[0]] : null, hue = one ? one.color : 'ink';
    for (const [l, a] of [...F.up, ...F.down]){ if (!(a > G.total * 1e-9)) continue;
      IE.svg('path', { class: 'sk-ov' + (l.loss ? ' loss' : one ? '' : ' mixed'), d: bandPath(l, Math.max(0.8, a * LY.ky)), style: `--c:${IE.cssColor(l.loss ? 'bad' : hue)}` }, gO); }
  };

  // ---- follow units: dots travel along the routes, chosen by the split ratios (restricted to the pick's routes)
  let dots = [], raf = 0, lastT = 0;
  const want = () => S.particles && !IE.reducedMotion && G && G.links.length;
  const pickW = pairs => { const tot = sum(pairs.map(p => p[1])); if (!(tot > 0)) return null; let x = Math.random() * tot; for (const [k, w] of pairs){ if ((x -= w) <= 0) return k; } return pairs[pairs.length - 1][0]; };
  const route = () => { const F = selF;
    if (G.paths){ const ps = G.paths.filter(p => !F || (F.node ? p.nodes.includes(F.node) : p.links.includes(F.link))); const p = pickW(ps.map(q => [q, q.value])); return p ? p.links : []; }
    let n = F ? G.by[pickW(Object.entries(F.origin))] : pickW(G.nodes.filter(m => m.role === 'source').map(m => [m, m.value]));
    const r = [];
    while (n && n.outs.length && r.length < 64){ const l = pickW(n.outs.map(x => [x, F ? (F.up.get(x) || F.down.get(x) || 0) : x.value])); if (!l) break; r.push(l); n = l.t; }
    return r; };
  const respawn = d => { d.r = route(); d.k = 0; d.s = 0; d.off = 0.15 + 0.7 * Math.random(); d.wait = Math.random() * 1.6; };
  function resetDots(){ gD.replaceChildren(); dots = [];
    if (!want()){ cancelAnimationFrame(raf); raf = 0; return; }
    const n = S.particles === true ? 36 : +S.particles || 36;
    for (let i = 0; i < n; i++){ const d = { el: IE.svg('circle', { class: 'sk-dot', r: 2.6, cx: -20, cy: -20 }, gD) }; respawn(d); dots.push(d); }
    if (!raf){ lastT = 0; raf = requestAnimationFrame(tick); } }
  function tick(now){
    raf = 0; if (!want()){ gD.replaceChildren(); dots = []; return; }
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0; lastT = now;
    for (const d of dots){
      if (d.wait > 0){ d.wait -= dt; d.el.setAttribute('cx', -20); continue; }
      if (!d.r.length){ respawn(d); continue; }
      let l = d.r[d.k]; d.s += dt * 120 / Math.max(30, l.t.x0 - l.s.x1);
      if (d.s >= 1){ d.s = 0; d.k++; if (d.k >= d.r.length){ respawn(d); d.el.setAttribute('cx', -20); continue; } l = d.r[d.k]; }
      const bw = selF ? (selF.up.get(l) || selF.down.get(l) || l.value) * LY.ky : l.w, a = l.sy + d.off * bw, b = l.ty + d.off * bw;
      const s = d.s, u = 1 - s, x0 = l.s.x1, x1 = l.t.x0, xm = (x0 + x1) / 2;
      d.el.setAttribute('cx', (u * u * u * x0 + 3 * u * u * s * xm + 3 * u * s * s * xm + s * s * s * x1).toFixed(1));
      d.el.setAttribute('cy', ((u * u * u + 3 * u * u * s) * a + (3 * u * s * s + s * s * s) * b).toFixed(1));
    }
    raf = requestAnimationFrame(tick);
  }

  // ---- interaction
  const act = el => S.onPick && S.onPick(el ? el.dataset.pick : null);
  root.addEventListener('click', ev => { const el = ev.target.closest('[data-pick]'); act(el); });
  root.addEventListener('keydown', ev => { if (ev.key !== 'Enter' && ev.key !== ' ') return; const el = ev.target.closest('[data-pick]'); if (el){ ev.preventDefault(); act(el); } });
  root.addEventListener('pointerover', ev => { if (ev.pointerType === 'touch') return; const el = ev.target.closest('[data-pick]'), k = el ? el.dataset.pick : null; if (k !== hover){ hover = k; overlay(); } });
  root.addEventListener('pointerleave', () => { if (hover){ hover = null; overlay(); } });

  sk.set = patch => {
    const first = !S; S = { ...(S || {}), ...patch };
    const structural = first || Object.keys(patch).some(k => k !== 'selected' && k !== 'particles') || (wrap.clientWidth || host.clientWidth) !== lastW;
    if (structural){ hover = null; build(); }
    if (S.selected && !follow(G, S.selected)) S.selected = null;   // the pick vanished (node removed by a what-if)
    overlay();
    if ('selected' in patch || 'particles' in patch){ if (want()) resetDots(); else { cancelAnimationFrame(raf); raf = 0; gD.replaceChildren(); dots = []; } }
    return sk;
  };
  Object.defineProperty(sk, 'G', { get: () => G });
  sk.follow = key => follow(G, key);
  new ResizeObserver(() => { if (S && (wrap.clientWidth || host.clientWidth) !== lastW){ build(); overlay(); } }).observe(host);
  sk.set(spec);
  return sk;
}

/* card(G, key, { fmt, unit, empty }) -> HTML for the picked node or link: value and share, the balance line for a stage,
   where its units end up (fate) and where they came from (origin), each as a share; node.note / node.source are shown. */
function card(g, key, o = {}){
  const G = G_(g), F = key ? follow(G, key) : null, fv = o.fmt || IE.fmt.int, u = o.unit ? ' ' + o.unit : '';
  if (!F) return o.empty || '<p class="sub">Click a stage or a flow to see where its units come from and where they end up.</p>';
  const list = obj => `<ul class="sk-list">${Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([id, f]) => `<li><i style="--c:${IE.cssColor(G.by[id].color)}"></i>${esc(G.by[id].label)} <b>${pctOf(f, 1)}</b></li>`).join('')}</ul>`;
  const cite = x => x.source && IE.cite ? IE.cite(x.source) : '';
  if (F.node){ const n = F.node, role = { source: 'source', stage: 'stage', sink: 'output', loss: 'loss' }[n.role];
    return `<p class="sk-head"><b>${esc(n.label)}</b>${cite(n)} <span class="badge">${role}</span></p>` +
      `<p><b>${fv(n.value)}${u}</b> · ${pctOf(n.value, G.total)} of everything that enters</p>` +
      (n.role === 'stage' ? `<p class="sub">In ${fv(n.in)} = out ${fv(n.out)} + losses ${fv(n.loss)} ${Math.abs(n.in - n.out - n.loss) <= 1e-9 * Math.max(1, n.in) ? '<span class="ok" aria-label="balances">✓</span>' : '<span class="fail">✗ does not balance</span>'}</p>` : '') +
      (n.note ? `<p>${esc(n.note)}</p>` : '') +
      (n.role === 'source' || n.role === 'stage' ? `<p class="sub">Where its units end up:</p>${list(F.fate)}` : '') +
      (n.role !== 'source' ? `<p class="sub">Where they came from:</p>${list(F.origin)}` : '');
  }
  const l = F.link;
  return `<p class="sk-head"><b>${esc(l.s.label)} → ${esc(l.t.label)}</b>${l.loss ? ' <span class="badge">loss</span>' : ''}</p>` +
    `<p><b>${fv(l.value)}${u}</b> · ${pctOf(l.value, l.s.out + l.s.loss)} of ${esc(l.s.label)}'s outflow · ${pctOf(l.value, G.total)} of the total</p>` +
    (l.note ? `<p>${esc(l.note)}</p>` : '') + (l.loss ? '' : `<p class="sub">Where these units end up:</p>${list(F.fate)}`) + `<p class="sub">Where they came from:</p>${list(F.origin)}`;
}

const SK = view;
Object.assign(SK, { graph, balance, follow, fates, removeNode, layout, order, step, card, measuresOf });
IE.sankey = SK;
if (typeof module === 'object' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
