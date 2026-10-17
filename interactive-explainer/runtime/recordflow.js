/* interactive-explainer runtime: recordflow.js (IE.recordflow). Records through a pipeline of components (ETL job,
   Ab Initio graph, middleware): a pure engine that runs every sample record through a DAG of components (joins of two
   inputs, lookups, reject / deselect / unused ports, fan-out) and keeps, per record, every hop with the record before and
   after, the rules that ran and their results; per component, the counts that must balance; and views: an auto-laid-out
   SVG pipeline (left-to-right, top-to-bottom on narrow screens), record chips, the hop card, the source panel, the diff
   against a reference run, and a hop navigator. The engine is pure and also loads in Node (require this file) so the
   page's model can be validated there. Guide: shapes/recordflow.md. */
(function(root){
'use strict';
const IE = root.IE || (root.IE = {});
const RF = IE.recordflow = (host, spec) => flowView(host, spec);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================================================================ engine (pure)
   graph = { nodes: [node], edges: [edge] }
   node  = { id, name, kind, file,
             role: 'source' | 'sink' | 'lookup' | (omitted: a component),
             read: p => [raw], key: (raw, i) => 'id', fn: (raw, p) => result        (source: parse one raw row)
             fn: (rec, p, item) => result                                          (component, one input)
             inputs: 2, join: (ins, p) => [joinResult], discard: ['unused1']       (multi-input component)
             fn: (rec, p, item) => ({ note })                                      (sink, optional)
             rows: p => [[key, value]], keyName                                    (lookup file, for its card)
             side: 'top' | 'bottom' }                                              (force a side row in the layout)
   edge  = { from, to, port: 'out' | 'reject' | 'deselect' | 'unused0' | …, toPort: 0 | 1, kind: 'lookup', cut: true }
           port 'out' = the main flow; 'reject'/'error' = reject flow; any other port = deselect-like flow.
           cut: drawn as disconnected; records leaving on it are LOST (or DROPped when the node lists the port in discard).
   rec   = { field: { v, t } }  (v null = NULL, t = the DML type text shown in the card)
   result = { after, port = 'out', rules: [{ tag, res, st: 'ok' | 'null' | 'fail' | 'skip' }], err, note, …extra }
   joinResult = { use: [i0, i1] (index into each input, null = none), after, port, rules, err, note } — one per output
           record AND one per unmatched input (port 'unused0' / 'unused1'); inputs no result uses are LOST.
   RF.run(graph, p) → RUN = { p, graph, nodes, edges, order, counts: {id: {in,out,pass,rej,desel,drop,lost}},
           flows: {edgeKey: {…edge, n}}, recs: [{ key, src, raw, hops: [hop], end, endAt, endPort }], byKey }
   hop   = { node, before, after, port, rules, err, note, via (edge key it arrived on), from (sinks), partner (joins),
             fan (joins: outputs this input fed; the path follows the first) } */
const kindOfPort = port => port === 'out' ? 'main' : port === 'reject' || port === 'error' ? 'rej' : 'desel';
RF.norm = graph => { const byId = {}; graph.nodes.forEach(n => byId[n.id] = n);
  const edges = graph.edges.map(e => { const port = e.port || 'out', x = { toPort: 0, ...e, port, kind: e.kind || kindOfPort(port) };
    x.key = x.kind === 'lookup' ? `${x.from}~${x.to}` : `${x.from}.${port}>${x.to}${x.toPort ? ':' + x.toPort : ''}`; return x; });
  return { nodes: graph.nodes, byId, edges }; };
const topo = (nodes, edges) => { const indeg = {}, out = {}; nodes.forEach(n => { indeg[n.id] = 0; out[n.id] = []; });
  edges.forEach(e => { if (e.kind === 'lookup') return; indeg[e.to]++; out[e.from].push(e.to); });
  const order = [], ready = nodes.filter(n => !indeg[n.id]).map(n => n.id);
  while (ready.length){ const id = ready.shift(); order.push(id); for (const t of out[id]) if (--indeg[t] === 0) ready.push(t); }
  if (order.length < nodes.length) throw new Error('recordflow: the graph has a cycle'); return order; };

RF.run = (graph, p = {}) => {
  const { byId, edges } = RF.norm(graph), order = topo(graph.nodes, edges);
  const counts = {}, flows = {}, inbox = {}, recs = [], byKey = {};
  for (const n of graph.nodes){ counts[n.id] = { in: 0, out: 0, pass: 0, rej: 0, desel: 0, drop: 0, lost: 0 }; inbox[n.id] = Array.from({ length: n.inputs || 1 }, () => []); }
  for (const e of edges) flows[e.key] = { ...e, n: 0 };
  const endAs = (fol, end, at, port) => fol.forEach(ri => Object.assign(recs[ri], { end, endAt: at, endPort: port }));
  const emit = (n, port, rec, lin, fol, err) => {   // route one record out of a port; 'sent' | 'lost' | 'drop'
    const outs = edges.filter(e => e.from === n.id && e.port === port && e.kind !== 'lookup' && !e.cut);
    if (!outs.length){ const drop = (n.discard || []).includes(port); endAs(fol, drop ? 'DROP' : 'LOST', n.id, port); return drop ? 'drop' : 'lost'; }
    outs.forEach((e, i) => { flows[e.key].n++; inbox[e.to][e.toPort].push({ rec, lin, fol: i ? [] : fol, from: n.id, fromPort: port, err, via: e.key }); });
    return 'sent';
  };
  const tally = (c, port, s) => { if (s === 'lost') c.lost++; else if (s === 'drop') c.drop++; else if (port === 'out') c.pass++; else if (port === 'reject' || port === 'error') c.rej++; else c.desel++; };
  const hop = (ri, h) => { recs[ri].hops.push(h); return h; };
  const norm = r => ({ rules: [], ...r, port: (r && r.port) || 'out' });
  for (const id of order){
    const n = byId[id], c = counts[id];
    if (n.role === 'lookup') continue;
    if (n.role === 'source'){
      (n.read ? n.read(p) : n.records || []).forEach((raw, i) => {
        const key = String(n.key ? n.key(raw, i) : `${id}#${i + 1}`), ri = recs.length;
        const rec = { key, src: id, raw, i, hops: [], end: null, endAt: null, endPort: null }; recs.push(rec); byKey[key] = rec;
        const r = norm(n.fn ? n.fn(raw, p) : { after: raw }); c.in++;
        hop(ri, { ...r, node: id, before: null });
        const s = emit(n, r.port, r.after, [ri], [ri], r.err); tally(c, r.port, s); if (r.port === 'out' && s === 'sent') c.out++;
      });
    } else if (n.role === 'sink'){
      for (const it of inbox[id].flat()){ c.in++; c.pass++;
        const r = (n.fn && n.fn(it.rec, p, it)) || {};
        it.fol.forEach(ri => { hop(ri, { rules: [], ...r, node: id, before: it.rec, after: it.rec, port: 'written', err: it.err, from: it.from, fromPort: it.fromPort, via: it.via }); endAs([ri], id, it.from, it.fromPort); });
      }
    } else if (n.join){
      const ins = inbox[id], used = ins.map(l => l.map(() => null)), results = n.join(ins.map(l => l.map(it => it.rec)), p) || [];
      ins.forEach(l => { c.in += l.length; });
      results.forEach((r0, k) => {
        const r = norm(r0), its = [];
        (r0.use || []).forEach((ix, j) => { if (ix != null && ins[j] && ins[j][ix]) its.push([j, ix, ins[j][ix]]); });
        const lin = [...new Set(its.flatMap(q => q[2].lin))], fol = [];
        for (const [j, ix, it] of its){
          if (used[j][ix] == null){
            const partner = its.filter(q => q[0] !== j).map(q => ({ port: q[0], rec: q[2].rec }));
            const hs = it.fol.map(ri => hop(ri, { ...r, use: undefined, node: id, before: it.rec, partner, inPort: j, via: it.via, fan: 1 }));
            used[j][ix] = { k, hs }; fol.push(...it.fol);
          } else used[j][ix].hs.forEach(h => h.fan++);
        }
        const s = emit(n, r.port, r.after ?? (its[0] && its[0][2].rec), lin, fol, r.err);
        its.forEach(([j, ix]) => { if (used[j][ix].k === k) tally(c, r.port, s); });
        if (r.port === 'out' && s === 'sent') c.out++;
      });
      ins.forEach((l, j) => l.forEach((it, ix) => { if (used[j][ix] != null) return; c.lost++;
        it.fol.forEach(ri => hop(ri, { node: id, before: it.rec, after: null, port: 'none', rules: [], inPort: j, via: it.via, note: 'No result of this component used the record, so it disappears here.' }));
        endAs(it.fol, 'LOST', id, 'none'); }));
    } else {
      for (const it of inbox[id].flat()){ c.in++;
        const r = norm(n.fn ? n.fn(it.rec, p, it) : { after: it.rec });
        it.fol.forEach(ri => hop(ri, { ...r, node: id, before: it.rec, via: it.via }));
        const down = r.port === 'reject' || r.port === 'error' ? it.rec : (r.after ?? it.rec);   // a reject port carries the record as it came in
        const s = emit(n, r.port, down, it.lin, it.fol, r.err); tally(c, r.port, s); if (r.port === 'out' && s === 'sent') c.out++;
      }
    }
  }
  return { p, graph, nodes: byId, edges, order, counts, flows, recs, byKey };
};

/* conservation and checks */
RF.BALANCE = { id: 'balance', label: 'No record silently dropped: in = out + rejected + deselected', comp: c => c.in === c.pass + c.rej + c.desel + c.drop };
RF.balance = run => run.order.filter(id => run.nodes[id].role !== 'lookup').map(id => { const c = run.counts[id]; return { id, ...c, ok: c.in === c.pass + c.rej + c.desel + c.drop }; });
// invariants: [{ id, label, comp: (counts, nodeId, run) => bool|null } | { id, label, hop: (hop, rec, run) => bool|null }] → { firstBreak: { id: { node, key } | null } }
RF.analyse = (run, invariants) => { const fb = {};
  for (const inv of invariants){ fb[inv.id] = null;
    if (inv.comp){ const id = run.order.find(id => run.nodes[id].role !== 'lookup' && inv.comp(run.counts[id], id, run) === false); if (id) fb[inv.id] = { node: id, key: null }; }
    else for (const r of run.recs){ const h = r.hops.find(h => inv.hop(h, r, run) === false); if (h){ fb[inv.id] = { node: h.node, key: r.key }; break; } } }
  return { firstBreak: fb }; };
// Per record key: the first hop whose node, port or fields differ from the reference run ({ j: -1 } = identical).
const stable = o => o && typeof o === 'object' ? '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}' : JSON.stringify(o);   // field order does not matter
RF.diff = (ref, run) => { const sig = h => h ? h.node + '|' + h.port + '|' + stable(h.after) : '', out = {};
  for (const r of run.recs){ const a = ref.byKey[r.key] ? ref.byKey[r.key].hops : [], b = r.hops, n = Math.max(a.length, b.length); out[r.key] = { j: -1, node: null };
    for (let j = 0; j < n; j++) if (sig(a[j]) !== sig(b[j])){ out[r.key] = { j, node: (b[j] || a[j]).node }; break; } }
  return out; };

/* selection: the string 'KEY@NODE' (record key, component id), so IE.app keeps it in the URL */
RF.sel = (key, node) => key + '@' + node;
RF.parse = s => { s = String(s == null ? '' : s); const i = s.lastIndexOf('@'); return i < 0 ? { key: s, node: null } : { key: s.slice(0, i), node: s.slice(i + 1) }; };
RF.path = (run, key) => run.byKey[key] ? run.byKey[key].hops.map(h => h.node) : [];
RF.stepBy = (run, sel, dir) => { const { key, node } = RF.parse(sel), path = RF.path(run, key); if (!path.length) return sel;
  const k = path.indexOf(node), j = k < 0 ? (dir > 0 ? 0 : path.length - 1) : clamp(k + dir, 0, path.length - 1); return RF.sel(key, path[j]); };
// Selecting another record keeps the component when the record reached it (or it is a lookup), else its last hop.
RF.select = (run, key, node) => { const path = RF.path(run, key); if (!path.length) return RF.sel(key, node);
  return RF.sel(key, path.includes(node) || (run.nodes[node] && run.nodes[node].role === 'lookup') ? node : path[path.length - 1]); };
RF.portWord = port => ({ out: 'written to', reject: 'rejected at', error: 'rejected at', deselect: 'deselected at' })[port] || (/^unused/.test(port) ? 'unmatched at' : `sent to ${port} at`);
RF.endWord = r => r.end === 'LOST' ? 'lost' : r.end === 'DROP' ? 'dropped' : !r.end ? 'in flight' : r.endPort === 'out' ? 'out' : r.endPort === 'reject' || r.endPort === 'error' ? 'rejected' : r.endPort === 'deselect' ? 'deselected' : /^unused/.test(r.endPort) ? 'unmatched' : r.endPort;
RF.endText = (run, r) => { const nm = id => (run.nodes[id] || {}).name || id;
  if (!r.end) return 'did not reach any output';
  if (r.end === 'LOST') return `was lost at ${nm(r.endAt)} (${r.endPort === 'none' ? 'no result used it' : r.endPort + ' port not connected'})`;
  if (r.end === 'DROP') return `was dropped at ${nm(r.endAt)} (${r.endPort} port not used, by design)`;
  return r.endPort === 'out' ? `was written to ${nm(r.end)}` : `was ${RF.portWord(r.endPort)} ${nm(r.endAt)}`; };

/* ================================================================ layout (needs IE.textWidth in the browser)
   Layered DAG: columns by longest path over the main flows, short branches pulled right next to where they merge
   (so a second input sits beside its join); rows by the mean of the predecessors (a join sits between its inputs).
   Side nodes go to a row above (lookup files, deselect/unused outputs) or below (reject outputs) the main rows, placed
   at the mean column of what they connect to. Side flows that would cross a box detour through the gap between columns.
   Narrow hosts get the same layout turned top-to-bottom (side rows become lanes on the right and left). */
RF.layout = (run, W, o = {}) => {
  const { edges, nodes: byId } = run, nodes = run.graph.nodes, NH = o.nodeH || 46, pad = 14;
  const into = id => edges.filter(e => e.to === id);
  const side = new Set(nodes.filter(n => n.side || n.role === 'lookup' || (n.role === 'sink' && into(n.id).every(e => e.kind !== 'main'))).map(n => n.id));
  const ord = run.order.filter(id => !side.has(id)), mE = edges.filter(e => e.kind === 'main' && !side.has(e.from) && !side.has(e.to));
  const L = {}, V = {};
  ord.forEach(id => { L[id] = Math.max(0, ...mE.filter(e => e.to === id).map(e => L[e.from] + 1)); });
  [...ord].reverse().forEach(id => { const s = mE.filter(e => e.from === id).map(e => L[e.to]); if (s.length) L[id] = Math.max(L[id], Math.min(...s) - 1); });
  const nCols = Math.max(0, ...ord.map(id => L[id])) + 1;
  for (let col = 0; col < nCols; col++){
    const ids = ord.filter(id => L[id] === col);
    ids.forEach(id => { const pv = mE.filter(e => e.to === id).map(e => V[e.from]).filter(v => v != null); V[id] = pv.length ? mean(pv) : null; });
    let prev = -Infinity;
    [...ids].sort((a, b) => (V[a] ?? 1e9) - (V[b] ?? 1e9)).forEach(id => { V[id] = V[id] == null ? (prev === -Infinity ? 0 : prev + 1) : Math.max(V[id], prev + 1); prev = V[id]; });
  }
  const vs = ord.map(id => V[id]), vMin = Math.min(...vs), vMax = Math.max(...vs), vMid = (vMin + vMax) / 2, SD = {};
  const colW = (W - 2 * pad) / nCols, vert = o.vertical ?? (colW - 46 < 76);
  for (const id of side){ const n = byId[id], conn = edges.filter(e => e.from === id || e.to === id).map(e => e.from === id ? e.to : e.from).filter(x => !side.has(x)), u = conn.length ? mean(conn.map(x => L[x])) : 0;
    const row = n.side || (into(id).some(e => e.kind === 'rej') ? 'bottom' : vert ? 'top' : conn.length && mean(conn.map(x => V[x])) > vMid + 1e-9 ? 'bottom' : 'top');
    // top-to-bottom: a side box sits half a row before (lookups) or after its component, in the gap between rows, so flows and counts have room
    SD[id] = { u: vert ? Math.round(u) + (n.role === 'lookup' ? -0.5 : 0.5) : u, row }; }
  for (const row of ['top', 'bottom']){   // spread each side row so boxes keep a column apart
    const ids = [...side].filter(id => SD[id].row === row).sort((a, b) => SD[a].u - SD[b].u), lo = vert ? -0.5 : 0; let prev = -Infinity;
    ids.forEach(id => { SD[id].u = Math.max(SD[id].u, prev + 1); prev = SD[id].u; });
    const over = prev - (nCols - (vert ? 0.5 : 1)); if (over > 0){ prev = -Infinity; ids.forEach(id => { SD[id].u = Math.max(lo, SD[id].u - over, prev + 1); prev = SD[id].u; }); }
  }
  const hasTop = [...side].some(id => SD[id].row === 'top'), hasBot = [...side].some(id => SD[id].row === 'bottom');
  const P = {}; let H, gapA, laneGap = 0;
  if (!vert){
    const bw = Math.min(150, colW - 46), A = u => pad + colW * (u + 0.5), cTop = pad + NH / 2, c0 = hasTop ? cTop + NH + 46 : pad + NH / 2, C = v => c0 + (v - vMin) * (NH + 40), cBot = C(vMax) + NH + 56;
    for (const id of ord) P[id] = { a: A(L[id]), c: C(V[id]), ha: bw / 2, hc: NH / 2, w: bw };
    for (const id of side) P[id] = { a: A(SD[id].u), c: SD[id].row === 'top' ? cTop : cBot, ha: bw / 2, hc: NH / 2, w: bw };
    H = (hasBot ? cBot : C(vMax)) + NH / 2 + pad; gapA = colW - bw;
  } else {
    const u0 = Math.min(0, ...[...side].map(id => SD[id].u)), rowH = NH + 38, A = u => pad + NH / 2 + (u - u0) * rowH, nL = (vMax - vMin + 1) + hasTop + hasBot, lw = (W - 2 * pad) / nL, bw = Math.min(150, lw - 14);
    const C = v => pad + lw * (hasTop + (v - vMin) + 0.5);
    for (const id of ord) P[id] = { a: A(L[id]), c: C(V[id]), ha: NH / 2, hc: bw / 2, w: bw };
    for (const id of side) P[id] = { a: A(SD[id].u), c: SD[id].row === 'top' ? pad + lw / 2 : pad + lw * (nL - 0.5), ha: NH / 2, hc: bw / 2, w: bw };
    H = A(Math.max(nCols - 1, ...[...side].map(id => SD[id].u))) + NH / 2 + pad; gapA = rowH - NH; laneGap = lw - bw;
  }
  const T = (a, c) => vert ? [W - c, a] : [a, c];
  for (const id in P){ const q = P[id]; [q.x, q.y] = T(q.a, q.c); q.h = NH; q.side = side.has(id); q.row = side.has(id) ? SD[id].row : 'main'; }
  // ---- flows, as dense point lists in (a, c), converted to (x, y)
  const cubic = (s, e, along) => { const k = along === 'a' ? (e[0] - s[0]) / 2 : (e[1] - s[1]) / 2, c1 = along === 'a' ? [s[0] + k, s[1]] : [s[0], s[1] + k], c2 = along === 'a' ? [e[0] - k, e[1]] : [e[0], e[1] - k];
    return Array.from({ length: 25 }, (_, i) => { const t = i / 24, u = 1 - t; return [0, 1].map(d => u * u * u * s[d] + 3 * u * u * t * c1[d] + 3 * u * t * t * c2[d] + t * t * t * e[d]); }); };
  const ortho = pts => { const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++){ const a = pts[i - 1], p = pts[i], b = pts[i + 1], d1 = Math.hypot(p[0] - a[0], p[1] - a[1]), d2 = Math.hypot(b[0] - p[0], b[1] - p[1]), r = Math.min(9, d1 / 2, d2 / 2);
      const p1 = [p[0] + (a[0] - p[0]) / (d1 || 1) * r, p[1] + (a[1] - p[1]) / (d1 || 1) * r], p2 = [p[0] + (b[0] - p[0]) / (d2 || 1) * r, p[1] + (b[1] - p[1]) / (d2 || 1) * r];
      for (const t of [0, 0.25, 0.5, 0.75, 1]){ const u = 1 - t; out.push([u * u * p1[0] + 2 * u * t * p[0] + t * t * p2[0], u * u * p1[1] + 2 * u * t * p[1] + t * t * p2[1]]); } }
    out.push(pts[pts.length - 1]); return out; };
  const all = Object.keys(P), inBox = ([a, c], skip, inf = 5) => all.some(id => !skip.includes(id) && Math.abs(a - P[id].a) < P[id].ha + inf && Math.abs(c - P[id].c) < P[id].hc + inf);
  const dense = pts => { const o = []; for (let i = 1; i < pts.length; i++){ const [a0, c0] = pts[i - 1], [a1, c1] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(a1 - a0, c1 - c0) / 5)); for (let k = 0; k < n; k++) o.push([a0 + (a1 - a0) * k / n, c0 + (c1 - c0) * k / n]); } o.push(pts[pts.length - 1]); return o; };
  const hits = (pts, skip) => dense(pts).some(q => inBox(q, skip));   // boxes (main and side) a flow would cross
  const faceOff = {};   // spread several side flows that share one box face
  const slot = (id, face, other) => { const k = id + face; (faceOff[k] = faceOff[k] || []).push(other); };
  const sideOf = e => side.has(e.from) ? [e.to, e.from] : side.has(e.to) ? [e.from, e.to] : null;
  for (const e of edges){ const s = sideOf(e); if (!s || side.has(s[0])) continue; const [m, sd] = s, up = SD[sd].row === 'top'; slot(m, up ? 't' : 'b', P[sd].a);
    if (vert) slot(sd, P[sd].a > P[m].a ? 'a-' : 'a+', P[m].a); else slot(sd, up ? 'b' : 't', P[m].a); }
  const offOf = (id, face, other) => { const l = (faceOff[id + face] || []).slice().sort((x, y) => x - y), n = l.length, i = l.indexOf(other), sp = Math.min(16, (2 * P[id].ha - 16) / Math.max(1, n - 1)); return n < 2 ? 0 : (i - (n - 1) / 2) * sp; };
  // flows entering a side box end-on (top-to-bottom layout): the one from farthest away takes the outermost slot, so legs do not cross
  const entryOff = (id, face, other, out) => { const q = P[id], l = (faceOff[id + face] || []).slice().sort((x, y) => Math.abs(y - q.a) - Math.abs(x - q.a)), n = l.length, i = l.indexOf(other), sp = Math.min(14, (2 * q.hc - 16) / Math.max(1, n - 1)); return n < 2 ? 0 : out * ((n - 1) / 2 - i) * sp; };
  const R = [];
  for (const e of edges){
    let pts, pref = null; const s = sideOf(e);
    if (!s){ const A = P[e.from], B = P[e.to], nIn = byId[e.to].inputs || 1, off = (e.toPort - (nIn - 1) / 2) * Math.min(14, B.hc * 0.6);
      pts = cubic([A.a + A.ha, A.c], [B.a - B.ha, B.c + off], 'a'); }
    else if (vert){   // elbow: out of the box's side, then end-on into the side box half a row away; the count sits on the first leg
      const [m, sd] = s, M = P[m], S = P[sd], dc = S.c > M.c ? 1 : -1, below = S.a > M.a, fM = M.c + dc * M.hc, fS = S.a + (below ? -S.ha : S.ha);
      const oM = offOf(m, SD[sd].row === 'top' ? 't' : 'b', S.a), oS = entryOff(sd, below ? 'a-' : 'a+', M.a, dc);
      pts = ortho([[M.a + oM, fM], [M.a + oM, S.c + oS], [fS, S.c + oS]]); pref = [M.a + oM, (fM + S.c + oS) / 2];
      if (hits(pts, [m, sd])){   // a box in the way: run down the gap beside the column, then across the row gap into the side box
        const cg = fM + dc * laneGap / 2, alt = ortho([[M.a + oM, fM], [M.a + oM, cg], [S.a, cg], [S.a, S.c - dc * S.hc]]);
        if (!hits(alt, [m, sd])){ pts = alt; pref = [(M.a + S.a) / 2, cg]; } }
      if (e.from === sd) pts.reverse(); }
    else { const [m, sd] = s, M = P[m], S = P[sd], up = SD[sd].row === 'top', dir = up ? -1 : 1, fM = M.c + dir * M.hc, fS = S.c - dir * S.hc;
      const sM = [M.a + offOf(m, up ? 't' : 'b', S.a), fM], sS = [S.a + offOf(sd, up ? 'b' : 't', M.a), fS];
      pts = cubic(sM, sS, 'c');
      if (hits(pts, [m, sd])){   // detour through the gap beside the column: upstream first unless the side box is well downstream
        const route = sgn => { const ach = M.a + sgn * (M.ha + gapA / 2); return ortho([sM, [sM[0], fM + dir * 10], [ach, fM + dir * 10], [ach, fS - dir * 14], [sS[0], fS - dir * 14], sS]); };
        const tries = (S.a > M.a + gapA ? [1, -1] : [-1, 1]).map(route); pts = tries.find(t => !hits(t, [m, sd])) || tries[0]; }
      if (e.from === sd) pts.reverse(); }
    R.push({ e, pts, pref, fr: !s ? [0.5, 0.4, 0.6, 0.3, 0.7] : e.from === s[1] ? [0.65, 0.5, 0.8] : [0.35, 0.25, 0.5, 0.18, 0.65, 0.8] });
  }
  // counts on the flows: main flows first, then side flows, each at the first spot clear of boxes and earlier counts
  const placed = [], F = {};
  for (const r of [...R.filter(r => !sideOf(r.e)), ...R.filter(r => sideOf(r.e))]){
    const cands = [...(r.pref ? [r.pref] : []), ...r.fr.map(f => RF.along(r.pts, f))];
    const b = r.e.kind === 'lookup' ? cands[0] : cands.find(q => !inBox(q, [], 10) && !placed.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < 22)) || cands[0];
    if (r.e.kind !== 'lookup') placed.push(b);
    const xy = r.pts.map(([a, c]) => T(a, c));
    F[r.e.key] = { pts: xy, d: 'M' + xy.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L'), badge: T(b[0], b[1]), end: xy[xy.length - 1] };
  }
  return { W, H, vert, NH, nodes: P, flows: F };
};
RF.along = (pts, f) => { const seg = []; let tot = 0; for (let i = 1; i < pts.length; i++){ const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); tot += d; }
  let goal = tot * f; for (let i = 0; i < seg.length; i++){ if (goal <= seg[i]){ const t = seg[i] ? goal / seg[i] : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]; } goal -= seg[i]; }
  return pts[pts.length - 1]; };

/* ================================================================ the pipeline view (SVG)
   const flow = IE.recordflow(host, { onPick: nodeId => …, title });   flow.set({ run, key, node })
   Built once per graph structure and width; each set() only toggles classes, badge numbers and the record dot. */
const structKey = run => run.graph.nodes.map(n => n.id).join() + '|' + run.edges.map(e => e.key + (e.cut ? '×' : '')).join();
const fit = (s, px, weight, max) => { let t = String(s); if (IE.textWidth(t, px, weight) <= max) return t; while (t.length > 2 && IE.textWidth(t + '…', px, weight) > max) t = t.slice(0, -1); return t + '…'; };
function flowView(host, spec = {}){
  let S = { ...spec }, G = null;
  const svg = IE.svg('svg', { class: 'rf-flow', role: 'img' }, host), mid = 'rf' + Math.random().toString(36).slice(2, 7);
  const v = { el: svg, get layout(){ return G && G.L; } };
  const build = () => {
    const run = S.run, W = Math.max(280, host.clientWidth || 600), L = RF.layout(run, W, S);
    svg.replaceChildren(); svg.setAttribute('viewBox', `0 0 ${W} ${L.H}`); svg.setAttribute('width', W); svg.setAttribute('height', L.H);
    const label = (S.title || 'Pipeline') + ': ' + run.order.filter(id => run.nodes[id].role !== 'lookup').map(id => run.nodes[id].name).join(', ') + '. Numbers on flows count the records that crossed them.';
    IE.svg('title', { text: label }, svg); svg.setAttribute('aria-label', label);
    const defs = IE.svg('defs', {}, svg);
    for (const k of ['main', 'rej', 'desel', 'lookup', 'cur']){ const m = IE.svg('marker', { id: `${mid}-${k}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, markerUnits: 'userSpaceOnUse', orient: 'auto' }, defs);
      IE.svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'rf-m-' + k }, m); }
    const gF = IE.svg('g', {}, svg), gB = IE.svg('g', {}, svg), gN = IE.svg('g', {}, svg), flows = {}, nodes = {};
    for (const e of run.edges){ const f = L.flows[e.key], path = IE.svg('path', { d: f.d, class: 'rf-fl ' + e.kind }, gF);
      let bg = null, badge = null;
      if (e.kind !== 'lookup'){ bg = IE.svg('circle', { cx: f.badge[0], cy: f.badge[1], r: 9.5, class: 'rf-bg' }, gB); badge = IE.svg('text', { x: f.badge[0], y: f.badge[1], class: 'rf-badge lbl' }, gB); }
      flows[e.key] = { e, path, bg, badge, f }; }
    for (const n of run.graph.nodes){ const q = L.nodes[n.id], g = IE.svg('g', { class: 'rf-node' + (q.side ? ' side' : ''), 'data-pick': 'n:' + n.id, tabindex: 0, role: 'button' }, gN);
      const sm = q.w < 100, inner = q.w - 10, npx = [12, 11, 10.5, 10].find(px => IE.textWidth(n.name, px, 'bold') <= inner) || 10;
      IE.svg('rect', { x: q.x - q.w / 2, y: q.y - q.h / 2, width: q.w, height: q.h, rx: 8 }, g);
      IE.svg('text', { x: q.x, y: q.y - 8, class: 'rf-name lbl', style: npx < 12 ? `font-size:${npx}px` : null, text: fit(n.name, npx, 'bold', inner) }, g);
      const kind = IE.svg('text', { x: q.x, y: q.y + 10, class: 'rf-kind lbl', style: sm ? 'font-size:9.5px' : null }, g);
      IE.svg('title', { text: `${n.name} (${n.kind || ''}${n.file ? ' ' + n.file : ''})` }, g);
      const pick = () => S.onPick && S.onPick(n.id);
      g.addEventListener('click', pick); g.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); pick(); } });
      nodes[n.id] = { g, kind, q, n, sm, inner }; }
    const dot = IE.svg('circle', { r: 6.5, class: 'rf-dot' }, svg);
    G = { key: structKey(run), W, L, flows, nodes, dot };
  };
  const dotAt = (run, rec, node) => {
    const path = rec.hops.map(h => h.node), n = run.nodes[node];
    if (n && n.role === 'lookup'){ const e = run.edges.find(e => e.kind === 'lookup' && e.from === node && path.includes(e.to)) || run.edges.find(e => e.kind === 'lookup' && e.from === node); if (e) return RF.along(G.flows[e.key].f.pts, 0.55); }
    const at = path.includes(node) ? node : path[path.length - 1], h = rec.hops.find(h => h.node === at), q = G.L.nodes[at];
    if (h && h.via && G.flows[h.via]) return G.flows[h.via].f.end;
    return G.L.vert ? [q.x, q.y - q.h / 2] : [q.x - q.w / 2, q.y];
  };
  const update = () => {
    const run = S.run, rec = run.byKey[S.key]; if (!rec) return;
    const path = rec.hops.map(h => h.node), on = new Set(rec.hops.map(h => h.via).filter(Boolean));
    for (const e of run.edges) if (e.kind === 'lookup' && path.includes(e.to)) on.add(e.key);
    for (const k in G.flows){ const h = G.flows[k], e = h.e, f = run.flows[k], cur = on.has(k), cut = !!e.cut;
      const cl = h.path.classList; cl.toggle('zero', !f.n && e.kind !== 'lookup'); cl.toggle('onpath', cur); cl.toggle('cut', cut); cl.toggle('live', f.n > 0 && !cur && !cut);
      h.path.setAttribute('marker-end', cut ? '' : `url(#${mid}-${cur ? 'cur' : e.kind})`);
      if (h.badge){ const lost = cut ? run.counts[e.from].lost : 0, t = cut ? (lost ? '×' : '0') : String(f.n);
        if (h.badge.textContent !== t) h.badge.textContent = t; h.badge.classList.toggle('bad', !!(cut && lost)); h.badge.classList.toggle('cur', cur); h.bg.classList.toggle('onpath', cur); } }
    for (const id in G.nodes){ const h = G.nodes[id], c = run.counts[id], n = h.n, ins = run.edges.filter(e => e.to === id);
      const notConn = ins.length && ins.every(e => e.cut);
      h.g.classList.toggle('sel', id === S.node); h.g.classList.toggle('onpath', path.includes(id) || run.edges.some(e => e.kind === 'lookup' && e.from === id && path.includes(e.to)));
      h.g.classList.toggle('endbad', (rec.end === 'LOST' || rec.endPort === 'reject' || rec.endPort === 'error') && id === rec.endAt); h.g.classList.toggle('cut', !!notConn);
      const kt = c.lost ? `${c.lost} lost` : notConn ? 'not connected' : (n.kind || ''), ft = fit(kt, h.sm ? 9.5 : 10, c.lost ? 'bold' : '', h.inner);
      if (h.kind.textContent !== ft) h.kind.textContent = ft; h.kind.classList.toggle('warn', !!c.lost || !!notConn);
      h.g.setAttribute('aria-label', `${n.name} (${n.kind || ''}): in ${c.in}${n.role === 'sink' ? '' : `, out ${c.out}`}${c.rej ? `, rejected ${c.rej}` : ''}${c.desel ? `, deselected ${c.desel}` : ''}${c.lost ? `, lost ${c.lost}` : ''}${id === S.node ? ' (selected)' : ''}`); }
    const xy = dotAt(run, rec, S.node), tf = `translate(${xy[0].toFixed(1)}px, ${xy[1].toFixed(1)}px)`; if (G.dot.style.transform !== tf) G.dot.style.transform = tf;
  };
  v.set = patch => { S = { ...S, ...patch }; if (!S.run) return v;
    if (!G || G.key !== structKey(S.run) || Math.abs(G.W - Math.max(280, host.clientWidth)) > 2) build(); update(); return v; };
  new ResizeObserver(() => { if (G && S.run && Math.abs(G.W - Math.max(280, host.clientWidth)) > 2){ build(); update(); } }).observe(host);
  if (S.run) v.set({});
  return v;
}

/* ================================================================ side panels (HTML; rebuild when the selection or params change) */
RF.value = (k, f, o = {}) => { if (!f) return '—'; if (f.v == null) return '<span class="rf-null">NULL</span>';
  if (typeof f.v === 'string') return `<span class="rf-s">"${esc(f.v)}"</span>`;
  if (typeof f.v === 'number'){ const d = (o.dp || {})[k]; return d != null ? f.v.toFixed(d) : Number.isInteger(f.v) ? String(f.v) : f.v.toFixed(2); }
  return esc(JSON.stringify(f.v)); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// before / (partner inputs) / after, field by field: chg = changed, add = added, drop = dropped
RF.baTable = (h, o = {}) => {
  const b = h.before || {}, a = h.after || {}, parts = h.partner || [], keys = [...new Set([...Object.keys(b), ...parts.flatMap(q => Object.keys(q.rec)), ...Object.keys(a)])];
  const head = `<tr><th>field</th><th>before${h.inPort != null && parts.length ? ` (in${h.inPort})` : ''}</th>${parts.map(q => `<th>other input (in${q.port})</th>`).join('')}<th>after${h.after ? '' : ' (no output record)'}</th></tr>`;
  return `<div class="tablewrap"><table class="rf-ba">${head}${keys.map(k => { const bv = b[k], av = a[k];
    const cls = !bv && av ? 'add' : bv && h.after && !av ? 'drop' : bv && av && !same(bv, av) ? 'chg' : '';
    const ty = bv && av && bv.t !== av.t ? `${bv.t} → ${av.t}` : (av || bv || (parts.find(q => q.rec[k]) || { rec: {} }).rec[k] || {}).t || '';
    return `<tr class="${cls}"><td>${esc(k)}<span class="rf-ty">${esc(ty)}</span></td><td>${bv ? RF.value(k, bv, o) : '—'}</td>${parts.map(q => `<td>${q.rec[k] ? RF.value(k, q.rec[k], o) : '—'}</td>`).join('')}<td>${av ? RF.value(k, av, o) : h.after ? 'dropped' : '—'}</td></tr>`; }).join('')}</table></div>`; };
const portText = (run, rec, h) => { const n = run.nodes[h.node];
  if (h.port === 'written') return { cls: 'out', t: `written to ${n.file || n.name}` };
  if (h.port === 'none') return { cls: 'reject', t: 'no output: the record disappears' };
  const lost = rec.endAt === h.node && rec.end === 'LOST', drop = rec.endAt === h.node && rec.end === 'DROP';
  const cls = h.port === 'out' ? 'out' : h.port === 'reject' || h.port === 'error' ? 'reject' : 'deselect';
  return { cls: lost ? 'reject' : cls, t: `→ ${h.port} port` + (lost ? ', not connected: the record is lost' : drop ? ', not connected: discarded by design' : '') }; };
// o: { dp, srcText: (node, tag) => code text, rawLine: rec => 'text', invariants, analysis }
RF.hopCard = (run, key, node, o = {}) => {
  const rec = run.byKey[key], n = run.nodes[node]; if (!rec || !n) return '';
  if (n.role === 'lookup') return RF.lookupCard(run, key, node, o) + RF.checks(run, key, node, o);
  const k = rec.hops.findIndex(h => h.node === node), h = rec.hops[k];
  if (!h) return `<p><b>${esc(key)}</b> never reached <b>${esc(n.name)}</b>: it ${esc(RF.endText(run, rec))} (hop ${rec.hops.length}). Pick a record that got this far.</p>` + RF.checks(run, key, node, o);
  const pt = portText(run, rec, h);
  let s = `<p><b>${esc(key)}</b> at <b>${esc(n.name)}</b> (${esc(n.kind || '')}) · hop ${k + 1} of ${rec.hops.length} · <span class="rf-port ${pt.cls}">${esc(pt.t)}</span></p>`;
  if (k === 0 && o.rawLine) s += `<p class="rf-note">Line read: <code>${esc(o.rawLine(rec))}</code></p>`;
  if (h.note) s += `<p class="rf-note">${esc(h.note)}</p>`;
  if (h.fan > 1) s += `<p class="rf-note">This record fed ${h.fan} output records here; the path follows the first.</p>`;
  s += RF.baTable(h, o);
  if (h.rules && h.rules.length) s += '<h4>Rules that ran</h4>' + h.rules.map(r => `<div class="rf-rule ${r.st || 'ok'}"><code>${esc(o.srcText ? o.srcText(h.node, r.tag) : r.tag)}</code><span>→ ${esc(r.res)}</span></div>`).join('');
  if (h.err) s += `<div class="rf-err"><b>${h.from ? 'Error port of ' + esc(run.nodes[h.from].name) : 'Error'}:</b> <code>${esc(h.err)}</code></div>`;
  return s + RF.checks(run, key, node, o);
};
RF.lookupCard = (run, key, node, o = {}) => {
  const n = run.nodes[node], rec = run.byKey[key], tg = run.edges.filter(e => e.kind === 'lookup' && e.from === node).map(e => e.to);
  const lh = rec.hops.find(h => tg.includes(h.node) && h.keys), used = new Set((lh ? lh.keys : []).map(x => String(x.key)));
  const kv = x => (x.key == null ? 'NULL' : `"${esc(x.key)}"`) + ' → ' + (x.value == null ? 'no row (NULL)' : esc(x.value));
  let s = `<p><b>${esc(n.name)}</b> (${esc(n.kind || 'LOOKUP')}${n.keyName ? ', key: ' + esc(n.keyName) : ''}) feeds <b>${tg.map(t => esc(run.nodes[t].name)).join(', ')}</b>.</p>`;
  s += lh ? `<p>${esc(key)} looked up ${lh.keys.map(kv).join(', then ')}.</p>` : `<p>${esc(key)} did not use it: it ${esc(RF.endText(run, rec))}.</p>`;
  const rows = n.rows ? n.rows(run.p) : [];
  return s + `<table class="rf-rates">${rows.map(([k, v]) => `<tr class="${used.has(String(k)) ? 'hit' : ''}"><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;
};
// "Rules checked" for the selected hop: o.invariants (default [RF.BALANCE]), o.analysis = RF.analyse(run, invariants)
RF.checks = (run, key, node, o = {}) => {
  const invs = o.invariants || [RF.BALANCE], an = o.analysis || RF.analyse(run, invs), rec = run.byKey[key], h = rec && rec.hops.find(x => x.node === node), c = run.counts[node], isComp = run.nodes[node] && run.nodes[node].role !== 'lookup';
  return '<h4 class="rf-h">Rules checked</h4>' + invs.map(inv => {
    const r = inv.comp ? (isComp ? inv.comp(c, node, run) : null) : h ? inv.hop(h, rec, run) : null, fb = an.firstBreak[inv.id];
    const detail = inv.comp ? (isComp ? `in ${c.in} = out ${c.pass} + rejected ${c.rej} + deselected ${c.desel}${c.drop ? ` + dropped ${c.drop}` : ''}${c.lost ? ` (+ ${c.lost} lost)` : ''}` : 'checked at components')
      : (inv.detail ? inv.detail(h, rec, run) : r == null ? 'does not apply here' : '');
    return `<p class="rf-inv"><span class="${r === true ? 'ok' : r === false ? 'bad' : 'tbd'}">${r === true ? '✓' : r === false ? '✗' : '…'}</span> ${esc(inv.label)}${detail ? ` <small>(${esc(detail)})</small>` : ''}` +
      (fb ? ` <span class="bad">breaks at ${esc(run.nodes[fb.node].name)}${fb.key ? ' for ' + esc(fb.key) : ''}</span>` : '') + '</p>'; }).join('');
};
// Record chips grouped by source; o: { selected: key, diff, onPick: key => … }
const focusKeep = host => { const a = document.activeElement, k = a && host.contains(a) && a.dataset.pick; return () => { if (k){ const el = [...host.querySelectorAll('[data-pick]')].find(e => e.dataset.pick === k); if (el) el.focus({ preventScroll: true }); } }; };
RF.chips = (host, run, o = {}) => {
  const refocus = focusKeep(host), srcs = [...new Set(run.recs.map(r => r.src))];
  host.innerHTML = srcs.map(sid => `<div class="rf-chipgroup"><span class="rf-src">${esc(run.nodes[sid].file || run.nodes[sid].name)}</span>${run.recs.filter(r => r.src === sid).map(r => {
    const d = o.diff && o.diff[r.key] && o.diff[r.key].j >= 0, w = RF.endWord(r);
    return `<button type="button" class="rf-chip e-${w.replace(/\s/g, '')}${r.key === o.selected ? ' on' : ''}${d ? ' differs' : ''}" data-pick="r:${esc(r.key)}" aria-pressed="${r.key === o.selected}" title="${esc(r.key + ' ' + RF.endText(run, r))}">${esc(r.key)}<small>${esc(w)}${d ? ' *' : ''}</small></button>`; }).join('')}</div>`).join('');
  if (!host._rfWired){ host._rfWired = true; host.addEventListener('click', ev => { const b = ev.target.closest('[data-pick^="r:"]'); if (b && host._rfPick) host._rfPick(b.dataset.pick.slice(2)); }); }
  host._rfPick = o.onPick; refocus();
};
// Source panel: lines [{ t, tag }], status { tag: 'ok'|'null'|'fail'|'skip' }; keeps the first highlighted line in view
RF.source = (host, lines, status = {}) => {
  host.innerHTML = lines.map((l, i) => { const s = status[l.tag], cls = s === 'ok' ? 'hl' : s === 'null' ? 'hl nul' : s === 'fail' ? 'hl bad' : s === 'skip' ? 'skip' : '';
    return `<span class="rf-ln ${cls}"><span class="n">${i + 1}</span>${esc(l.t)}</span>`; }).join('');
  RF.keepInView(host, host.querySelector('.rf-ln.hl'));
};
// Reference run vs this run, one row per record; o: { selected, refLabel, detail: (rec, run) => 'text', onPick: key => … }
RF.diffTable = (host, ref, run, diff, o = {}) => {
  const refocus = focusKeep(host), end = (r, R) => r ? esc(RF.endWord(r) === 'out' ? (run.nodes[r.end] || {}).name + (o.detail ? ' · ' + o.detail(r, R) : '') : RF.endText(R, r).replace(/^was /, '')) : 'absent';
  const rows = run.recs.map(r => ({ key: r.key, ref: end(ref.byKey[r.key], ref), cur: end(r, run), d: diff[r.key] }));
  IE.table(host, { caption: `${o.refLabel || 'Reference'} vs this run`, pick: r => 'd:' + r.key, highlight: r => r.key === o.selected, onPick: pk => o.onPick && o.onPick(pk.slice(2)),
    columns: [{ key: 'key', label: 'record' }, { key: 'ref', label: esc(o.refLabel || 'Reference'), fmt: v => v }, { key: 'cur', label: 'This run', fmt: (v, r) => `<span class="${r.d.j >= 0 ? 'rf-d' : ''}">${v}</span>` },
      { key: 'd', label: 'First difference', fmt: d => d.j < 0 ? 'same' : `<span class="rf-d">hop ${d.j + 1} (${esc(run.nodes[d.node].name)})</span>` }], rows });
  RF.keepInView(host.querySelector('.tablewrap'), host.querySelector('tr.on')); refocus();
};
RF.keepInView = (box, el) => { if (!box || !el || box.scrollHeight <= box.clientHeight) return; const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (r.top < b.top + 24 || r.bottom > b.bottom - 24) box.scrollTop += (r.top - b.top) - b.height / 2 + r.height / 2; };
/* Hop navigator: ◀ ▶ Play ▶| and a hop slider marked data-time (so ← → are tested by check.js).
   o: { step: dir => bool (moved?), go: k => …, rate: ms }; nav.update(k, n, label). Play stops at the last hop,
   on any arrow key and on a click elsewhere. */
RF.nav = (host, o = {}) => {
  host.classList.add('rf-nav');
  host.innerHTML = `<button class="btn" type="button" data-hop="-1" aria-label="Previous hop">◀</button><button class="btn" id="hopPlay" type="button">▶ Play</button><button class="btn" type="button" data-hop="1" aria-label="Next hop">▶|</button>
    <input type="range" id="hop" data-time min="0" max="1" step="1" value="0" aria-label="Hop of the selected record"><output id="hop_o"></output>`;
  let timer = 0; const play = host.querySelector('#hopPlay'), sl = host.querySelector('#hop'), out = host.querySelector('#hop_o');
  const stop = () => { if (timer){ clearInterval(timer); timer = 0; } play.textContent = '▶ Play'; };
  const start = () => { if (o.atEnd && o.atEnd()) o.go(0); play.textContent = '❚❚ Pause'; timer = setInterval(() => { if (!o.step(1)) stop(); }, o.rate || 750); };
  play.addEventListener('click', () => timer ? stop() : start());
  host.querySelectorAll('[data-hop]').forEach(b => b.addEventListener('click', () => { stop(); o.step(+b.dataset.hop); }));
  sl.addEventListener('input', () => { stop(); o.go(+sl.value); });
  document.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') stop(); });
  document.addEventListener('pointerdown', e => { if (!host.contains(e.target)) stop(); });
  return { stop, update(k, n, label){ sl.max = Math.max(1, n - 1); sl.disabled = n < 2; if (+sl.value !== Math.max(0, k)) sl.value = Math.max(0, k); out.textContent = label;
    host.querySelector('[data-hop="-1"]').disabled = k <= 0; host.querySelector('[data-hop="1"]').disabled = k < 0 || k >= n - 1; } };
};

if (typeof module === 'object' && module.exports) module.exports = RF;
})(typeof window !== 'undefined' ? window : globalThis);
