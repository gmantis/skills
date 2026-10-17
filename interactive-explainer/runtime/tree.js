/* interactive-explainer runtime: tree.js (IE.tree). Hierarchies with nested totals: bottom-up totals for any number of
   measures, hide-a-branch re-totalling, a squarified treemap two levels deep that zooms to the selected node, a
   collapsible tree, a breadcrumb, a top-N leaves list (the step up) and a detail card.
   IE.tree.model(tree, spec) and the layout helpers are pure (no DOM) and also load in Node:
   require('<skill>/runtime/tree.js').model(tree, spec). IE.tree.view(T, hosts) draws it; it needs core.js and
   <style data-ie="tree">. Guide: shapes/tree.md. */
(function(){
'use strict';
const G = typeof window !== 'undefined' ? window : globalThis;
const IE = G.IE || (G.IE = {});
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ pure helpers
   A node: { id (unique, [A-Za-z0-9_], not a number), name (short; drawn in boxes), title (a few words), desc, color, children? }.
   Leaves carry every measure (node[measureKey] = number >= 0); internal nodes are always totalled, never stored. */
function index(tree){
  const by = {}, parent = {}, depth = {}, order = [];
  const walk = (n, p, d) => { if (by[n.id]) throw new Error('IE.tree: duplicate id ' + n.id); by[n.id] = n; parent[n.id] = p; depth[n.id] = d; order.push(n.id); (n.children || []).forEach(c => walk(c, n.id, d + 1)); };
  walk(tree, null, 0);
  const ix = { root: tree.id, by, parent, depth, order, leaves: order.filter(id => !(by[id].children && by[id].children.length)) };
  ix.kids = id => (by[id].children || []).map(c => c.id);
  ix.pathTo = id => { const p = []; for (let v = id; v != null; v = parent[v]) p.unshift(v); return p; };
  ix.branchOf = id => ix.pathTo(id)[1] || ix.root;
  ix.isHidden = (id, hidden) => ix.pathTo(id).some(v => hidden[v]);
  return ix;
}
// sub[id] = total of the visible leaves inside id, ignoring id's own (and its ancestors') hide flag: "what it would add back".
// eff[id] = sub[id] unless id or an ancestor is hidden, else 0. A hidden child adds 0 to its parent: that is the re-totalling.
function totals(ix, measure, hidden = {}){
  const sub = {};
  const rec = id => { const n = ix.by[id]; if (!(n.children && n.children.length)) return (sub[id] = +n[measure] || 0);
    let s = 0; for (const c of n.children){ const v = rec(c.id); if (!hidden[c.id]) s += v; } return (sub[id] = s); };
  rec(ix.root);
  const eff = {}; ix.order.forEach(id => { eff[id] = ix.isHidden(id, hidden) ? 0 : sub[id]; });
  return { sub, eff };
}
const share = (a, b) => b > 0 ? a / b : null;   // null = no whole to divide by (say so in words)
// Percent that never rounds a part up to 100% or a non-zero part down to 0%.
const fmtShare = s => s == null || !Number.isFinite(s) ? '–' : s === 0 ? '0%' : s < 0.001 ? '<0.1%' : s < 1 && s >= 0.995 ? (Math.floor(s * 1000) / 10).toFixed(1) + '%'
  : (s * 100).toFixed(s < 0.1 ? 1 : 0) + '%';
const topLeaves = (ix, eff, n) => ix.leaves.filter(id => eff[id] > 0).sort((a, b) => eff[b] - eff[a]).slice(0, n);
const largestChild = (ix, id, eff) => ix.kids(id).filter(c => eff[c] > 0).sort((a, b) => eff[b] - eff[a])[0] || null;
// The node the boxes zoom to: the selection if it has parts, else its parent; climb past anything hidden or empty.
function zoomOf(ix, sel, eff){
  let z = ix.kids(sel).length ? sel : (ix.parent[sel] ?? sel);
  while (z !== ix.root && !(eff[z] > 0)) z = ix.parent[z];
  return z;
}
/* Squarified treemap (Bruls, Huizing & van Wijk 2000): areas exactly proportional to v, tiling rect, aspect ratios
   near 1, so area reads as amount in any panel shape. items [{id, v}] (v > 0), rect {x, y, w, h} -> [{id, v, x, y, w, h}].
   Prefer an icicle when depth matters more than size. */
function squarify(items, rect){
  const tot = items.reduce((a, it) => a + (it.v > 0 ? it.v : 0), 0), out = [];
  if (!(tot > 0) || rect.w <= 0 || rect.h <= 0) return out;
  const k = rect.w * rect.h / tot;
  let rest = items.filter(it => it.v > 0).sort((a, b) => b.v - a.v).map(it => ({ ...it, a: it.v * k }));
  let { x, y, w, h } = rect;
  const worst = (row, side) => { const s = row.reduce((a, r) => a + r.a, 0), mx = Math.max(...row.map(r => r.a)), mn = Math.min(...row.map(r => r.a));
    return Math.max(side * side * mx / (s * s), s * s / (side * side * mn)); };
  while (rest.length){
    const side = Math.min(w, h); let n = 1;
    while (n < rest.length && worst(rest.slice(0, n + 1), side) <= worst(rest.slice(0, n), side)) n++;
    const row = rest.slice(0, n), s = row.reduce((a, r) => a + r.a, 0), last = n === rest.length;
    if (w >= h){ const cw = last ? w : s / h; let yy = y;   // a column along the shorter (vertical) side
      row.forEach((r, i) => { const rh = i === n - 1 ? y + h - yy : r.a / cw; out.push({ id: r.id, v: r.v, x, y: yy, w: cw, h: rh }); yy += rh; }); x += cw; w -= cw; }
    else { const rh = last ? h : s / w; let xx = x;           // a row along the shorter (horizontal) side
      row.forEach((r, i) => { const rw = i === n - 1 ? x + w - xx : r.a / rh; out.push({ id: r.id, v: r.v, x: xx, y, w: rw, h: rh }); xx += rw; }); y += rh; h -= rh; }
    rest = rest.slice(n);
  }
  return out;
}
// Two nested levels inside W×H: the zoom node's visible children, and inside each big enough child its visible
// children below a header strip that holds the child's name and value. o: { head: 32, minW: 56, minH: 62, pad: 3 }
function nestedLayout(ix, zoom, eff, W, H, o = {}){
  const HEAD = o.head ?? 32, minW = o.minW ?? 56, minH = o.minH ?? HEAD + 30, pad = o.pad ?? 3;
  const top = squarify(ix.kids(zoom).filter(c => eff[c] > 0).map(c => ({ id: c, v: eff[c] })), { x: 0, y: 0, w: W, h: H });
  const out = top.map(r => ({ ...r, level: 1, head: false }));
  for (const r of out.slice()){
    const cs = ix.kids(r.id).filter(c => eff[c] > 0);
    if (!cs.length || r.w < minW || r.h < minH) continue;
    r.head = true;
    squarify(cs.map(c => ({ id: c, v: eff[c] })), { x: r.x + pad, y: r.y + HEAD, w: r.w - 2 * pad, h: r.h - HEAD - pad })
      .forEach(g => out.push({ ...g, level: 2, parent: r.id }));
  }
  return out;
}

/* ------------------------------------------------------------------ model
   spec: { measures: { <key>: { label: 'bytes', fmt: v => '1.2 GB', fmtNum: v => '1.2 GB' (tree column; default fmt) } },
           measure: <default key> }
   Parameters it owns (all in P, so links and steps keep them): measure, hide_<id> for every node but the root. */
function model(tree, spec = {}){
  const ix = index(tree), measures = spec.measures || { value: { label: 'value', fmt: v => String(v) } };
  const mkeys = Object.keys(measures), hideKey = id => 'hide_' + id;
  const HIDE_KEYS = ix.order.filter(id => id !== ix.root).map(hideKey);
  const real = { measure: spec.measure || mkeys[0], ...Object.fromEntries(HIDE_KEYS.map(k => [k, false])) };
  const hidden = P => Object.fromEntries(ix.order.map(id => [id, !!P[hideKey(id)]]));
  const hideOnly = ids => ({ ...Object.fromEntries(HIDE_KEYS.map(k => [k, false])), ...Object.fromEntries(ids.map(id => [hideKey(id), true])) });
  const T = { ix, measures, mkeys, hideKey, HIDE_KEYS, real, hidden, hideOnly, totals: (m, hid) => totals(ix, m, hid),
    // everything the views need for P: per-measure totals with the hides (T[m]), the current measure (M), and "before" (all)
    compute(P){ const hid = hidden(P), by = Object.fromEntries(mkeys.map(m => [m, totals(ix, m, hid)]));
      return { hid, by, M: by[P.measure], all: totals(ix, P.measure, {}), measure: P.measure }; },
    // what-if presets for IE.app's whatIf: [{ key, label, hide: [ids] }] -> segmented buttons that hide exactly those branches
    presets: list => list.map(w => ({ key: w.key, label: w.label, set: hideOnly(w.hide || []) })),
    fmt: (m, v) => measures[m].fmt(v), share, fmtShare, topLeaves: (eff, n) => topLeaves(ix, eff, n),
    largestChild: (id, eff) => largestChild(ix, id, eff), zoomOf: (sel, eff) => zoomOf(ix, sel, eff),
    relPath: id => ix.pathTo(id).slice(1).map(v => ix.by[v].name).join('/') || ix.by[ix.root].name,
  };
  return T;
}

/* ------------------------------------------------------------------ view (browser)
   hosts: element ids (or elements), each optional: { tree, map, crumbs, top, detail, caption, selnav, whatif }
   opts: { topN: 5, height: W => px, color: id => 's1'|'#hex' (default: one series colour per top-level branch),
           measureSeg: true (adds a "Measure" segment to hosts.whatif), hideLabel: 'Hide a branch…', duration: 220 }
   Selection (app.sel) = a node id (null = the root). Returns V: recompute(P, app), render(S), dyn(S), readout(S),
   stepBy(dir, app), C (current totals), layout (last treemap layout {W, H, rects}), zoom. */
function view(T, hosts = {}, opts = {}){
  const el = k => typeof hosts[k] === 'string' ? document.getElementById(hosts[k]) : hosts[k] || null;
  const H = Object.fromEntries(['tree', 'map', 'crumbs', 'top', 'detail', 'caption', 'selnav', 'whatif'].map(k => [k, el(k)]));
  const { ix } = T, ROOT = ix.root, TOP_N = opts.topN || 5, DUR = () => IE.reducedMotion ? 0 : (opts.duration ?? 220);
  const branches = ix.kids(ROOT);
  const colorOf = id => { if (opts.color) return IE.cssColor(opts.color(id));
    const p = ix.pathTo(id), own = p.map(v => ix.by[v].color).filter(Boolean).pop(); if (own) return IE.cssColor(own);
    const b = p[1]; return b ? IE.cssColor('s' + ((branches.indexOf(b) % 8) + 1)) : 'var(--accent)'; };
  let app = null, P = null, C = null, built = false, shown = '', lastSel = null, openVer = 0, M = null;
  const open = new Set([ROOT]);
  const V = { T, get C(){ return C; }, get layout(){ return M && M.lay ? { W: M.W, H: M.H, rects: Object.values(M.lay) } : null; }, get zoom(){ return M && M.zoom; } };
  const selOf = s => (typeof s === 'string' && ix.by[s]) ? s : ROOT;
  const fmtV = v => T.fmt(P.measure, v), fmtNum = v => (T.measures[P.measure].fmtNum || T.measures[P.measure].fmt)(v);
  const openTo = id => { ix.pathTo(id).slice(0, -1).forEach(a => open.add(a)); if (ix.kids(id).length) open.add(id); };   // selecting opens the node and its path
  const select = id => { if (!app) return; openTo(id); openVer++; app.setSel(id); };
  const isOpen = id => open.has(id);
  const visibleRows = () => ix.order.filter(id => ix.pathTo(id).slice(0, -1).every(isOpen));
  // ← → walk the visible rows of the tree in reading order (selecting opens a folder, so → goes into it), cycling
  V.stepBy = (dir, a) => { app = a || app; const rows = visibleRows(), i = rows.indexOf(selOf(app.sel));
    select(rows[((i + dir) % rows.length + rows.length) % rows.length]); };
  const toggle = id => {   // closing a folder that holds the selection moves the selection up to it (without reopening it)
    if (isOpen(id)){ open.delete(id); const s = selOf(app.sel); if (s !== id && ix.pathTo(s).includes(id)){ lastSel = id; app.setSel(id); } } else open.add(id);
    openVer++; app.redraw(); };

  // ---- wiring (once)
  const onPickKey = (host, fn) => host && host.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; if (e.target.tagName === 'BUTTON') return;
    const t = e.target.closest('[data-pick]'); if (t){ e.preventDefault(); fn(t, true); } });
  const pickId = t => t.dataset.pick.slice(2);
  const rebuild = (host, html) => { if (!host) return; const a = document.activeElement, pk = a && host.contains(a) && a.dataset ? a.dataset.pick : null;
    host.innerHTML = html; if (pk){ const t = [...host.querySelectorAll('[data-pick]')].find(x => x.dataset.pick === pk); if (t) t.focus({ preventScroll: true }); } };
  function build(){
    built = true;
    if (H.tree){ H.tree.classList.add('tr-tree'); H.tree.setAttribute('role', 'tree');
      H.tree.addEventListener('click', e => { const tg = e.target.closest('.tog'); if (tg){ toggle(tg.dataset.tog); return; }
        const r = e.target.closest('[data-pick]'); if (r) select(pickId(r)); });
      onPickKey(H.tree, t => { const id = pickId(t); if (selOf(app.sel) === id && ix.kids(id).length) toggle(id); else select(id); }); }
    for (const k of ['crumbs', 'top', 'map']) if (H[k]){
      H[k].addEventListener('click', e => { const t = e.target.closest('[data-pick]'); if (t) select(pickId(t)); });
      onPickKey(H[k], t => select(pickId(t))); }
    if (H.crumbs) H.crumbs.classList.add('tr-crumbs');
    if (H.top) H.top.classList.add('tr-top');
    if (H.map){ H.map.classList.add('tr-map'); H.map.setAttribute('role', 'img'); }
    if (H.selnav){ H.selnav.innerHTML = `<div class="tr-selnav"><button type="button" class="btn" data-dir="-1" aria-label="Previous folder (←)">‹</button><span class="cur" aria-live="polite"></span><button type="button" class="btn" data-dir="1" aria-label="Next folder (→)">›</button></div>
        <div class="row" style="margin-top:6px"><button type="button" class="btn" data-set="sel=${ROOT}">Back to the top</button><button type="button" class="btn" data-up="1">Up one level</button></div>`;
      H.selnav.addEventListener('click', e => { const b = e.target.closest('[data-dir]'); if (b){ V.stepBy(+b.dataset.dir, app); return; }
        if (e.target.closest('[data-up]')){ const s = selOf(app.sel); select(ix.parent[s] ?? ROOT); } }); }
    if (H.whatif){
      const seg = H.whatif.querySelector('#whatSeg');
      if (seg && opts.hideLabel !== false) seg.insertAdjacentHTML('beforebegin', `<p class="tr-seglab">${esc(opts.hideLabel || 'Hide a branch (it leaves every total)')}</p>`);
      if (opts.measureSeg !== false && T.mkeys.length > 1) H.whatif.insertAdjacentHTML('beforeend', `<p class="tr-seglab">Measure</p><div class="seg" id="measureSeg" role="group" aria-label="Measure">${
        T.mkeys.map(m => `<button type="button" data-w="m_${m}" data-set="measure=${m}" aria-pressed="false">${esc(T.measures[m].button || T.measures[m].label)}</button>`).join('')}</div>`);
    }
  }

  V.recompute = (p, a) => { P = p; if (a) app = a; C = T.compute(p); };

  // ---- treemap: built once per zoom and width, attributes updated per frame (tweened), labels placed when settled
  const NS = 'http://www.w3.org/2000/svg';
  function buildMap(zoom, W){
    const svg = H.map, Hh = Math.round(opts.height ? opts.height(W) : Math.max(240, Math.min(440, W * 0.68)));
    svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`); svg.setAttribute('width', W); svg.setAttribute('height', Hh); svg.replaceChildren();
    const ttl = IE.svg('title', {}, svg), els = {};
    ix.kids(zoom).forEach(c => {
      const has = ix.kids(c).length > 0, col = colorOf(c);
      const g = IE.svg('g', { class: 'box', 'data-pick': 'b:' + c, tabindex: 0, role: 'button' }, svg);
      const rect = IE.svg('rect', { class: 'b1', rx: 3, fill: col, 'fill-opacity': has ? 0.16 : 0.42, stroke: col }, g);
      const t = IE.svg('title', {}, g);
      els[c] = { level: 1, g, rect, t, cur: null };
      ix.kids(c).forEach((gc, k) => { const r2 = IE.svg('rect', { class: 'b2', rx: 2, fill: colorOf(gc), 'fill-opacity': Math.max(0.2, 0.5 - 0.08 * k), 'data-pick': 'b:' + gc }, g);
        IE.svg('title', { text: T.relPath(gc) }, r2); els[gc] = { level: 2, rect: r2, parent: c, cur: null }; });
      els[c].name = IE.svg('text', { class: 'n1 lbl' }, g); els[c].val = IE.svg('text', { class: 'v1 lbl' }, g);
      ix.kids(c).forEach(gc => { els[gc].name = IE.svg('text', { class: 'n2 lbl' }, g); els[gc].val = IE.svg('text', { class: 'v2 lbl' }, g); });
    });
    const msg = IE.svg('text', { class: 'msg lbl', x: W / 2, y: Hh / 2, 'text-anchor': 'middle', display: 'none' }, svg);
    M = { zoom, W, H: Hh, els, msg, ttl, layKey: null, t0: 0, lay: {}, placed: false };
  }
  const collapse = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, w: 0, h: 0 });
  function setLayout(now){
    const lay = nestedLayout(ix, M.zoom, C.M.eff, M.W, M.H), byId = Object.fromEntries(lay.map(r => [r.id, r]));
    const key = P.measure + JSON.stringify(lay.map(r => [r.id, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h), r.head, r.v]));
    if (key === M.layKey) return;
    const first = M.layKey === null; M.layKey = key; M.t0 = first ? -Infinity : now; M.lay = byId; M.placed = false;   // no tween on a fresh build
    for (const [id, e] of Object.entries(M.els)){
      const to = byId[id];
      const from = e.cur && e.cur.w > 0 ? e.cur : to ? collapse(to) : null;
      e.from = first ? (to || null) : from; e.to = to ? { x: to.x, y: to.y, w: to.w, h: to.h } : (from ? collapse(from) : null);
      e.name.setAttribute('display', 'none'); e.val.setAttribute('display', 'none');
    }
  }
  function placeLabels(){
    for (const [id, e] of Object.entries(M.els)){
      const r = M.lay[id], n = ix.by[id];
      e.name.setAttribute('display', 'none'); e.val.setAttribute('display', 'none');
      if (!r) continue;
      const l1 = e.level === 1, px = l1 ? 6 : 5, vs = fmtV(r.v), fs = l1 ? 12 : 11, fv = l1 ? 11 : 10.5;
      const nameFits = r.w >= IE.textWidth(n.name, fs, '600') + 2 * px && r.h >= (l1 ? 20 : 17);
      const valFits = nameFits && r.w >= IE.textWidth(vs, fv) + 2 * px && r.h >= (l1 ? 34 : 30);
      if (nameFits){ e.name.textContent = n.name; e.name.setAttribute('x', r.x + px); e.name.setAttribute('y', r.y + (l1 ? 15 : 13)); e.name.removeAttribute('display'); }
      if (valFits){ e.val.textContent = vs; e.val.setAttribute('x', r.x + px); e.val.setAttribute('y', r.y + (l1 ? 28 : 25)); e.val.removeAttribute('display'); }
    }
  }
  function updateMap(now, sel){
    const d = DUR(), t = d ? Math.min(1, (now - M.t0) / d) : 1, k = 1 - Math.pow(1 - t, 3);
    for (const [id, e] of Object.entries(M.els)){
      const node = e.g || e.rect;
      if (!e.to){ node.setAttribute('display', 'none'); continue; }
      const f = e.from || e.to, c = { x: f.x + (e.to.x - f.x) * k, y: f.y + (e.to.y - f.y) * k, w: f.w + (e.to.w - f.w) * k, h: f.h + (e.to.h - f.h) * k };
      e.cur = c; const ins = e.level === 1 ? 1 : 0.5, show = c.w > 2 * ins && c.h > 2 * ins;   // slivers under a pixel are not drawn; the tree still lists them
      if (show){ e.rect.setAttribute('x', (c.x + ins).toFixed(1)); e.rect.setAttribute('y', (c.y + ins).toFixed(1)); e.rect.setAttribute('width', (c.w - 2 * ins).toFixed(1)); e.rect.setAttribute('height', (c.h - 2 * ins).toFixed(1)); node.removeAttribute('display'); }
      else node.setAttribute('display', 'none');
      if (e.g){ const v = C.M.eff[id]; e.g.classList.toggle('sel', sel === id && v > 0);
        e.t.textContent = `${T.relPath(id)}: ${v > 0 ? fmtV(v) + ', ' + fmtShare(share(v, C.M.eff[M.zoom])) + ' of ' + ix.by[M.zoom].name : 'hidden'}`;
        e.g.setAttribute('aria-label', e.t.textContent); }
    }
    const empty = !(C.M.eff[ROOT] > 0);
    M.msg.textContent = empty ? 'Everything is hidden: nothing to total.' : ''; empty ? M.msg.removeAttribute('display') : M.msg.setAttribute('display', 'none');
    M.ttl.textContent = empty ? 'Treemap: everything is hidden' : `Treemap of ${T.relPath(M.zoom)} by ${T.measures[P.measure].label}: ` + ix.kids(M.zoom).filter(c => C.M.eff[c] > 0)
      .sort((a, b) => C.M.eff[b] - C.M.eff[a]).map(c => `${ix.by[c].name} ${fmtShare(share(C.M.eff[c], C.M.eff[M.zoom]))}`).join(', ');
    H.map.setAttribute('aria-label', M.ttl.textContent);
    if (t >= 1){ if (!M.placed){ placeLabels(); M.placed = true; } } else { M.placed = false; app.redraw(); }
  }

  // ---- HTML panels (rebuilt when the state changes, never per frame)
  function renderTree(sel){
    const tot = C.M.eff[ROOT], onPath = new Set(ix.pathTo(sel)), ml = T.measures[P.measure];
    let h = `<div class="hd" aria-hidden="true"><span>name</span><span class="bar"></span><span class="num">${esc(ml.column || ml.label)}</span><span class="num"><span class="lg">of parent</span><span class="sh">%par</span></span><span class="num"><span class="lg">of total</span><span class="sh">%all</span></span></div>`;
    for (const id of visibleRows()){
      const n = ix.by[id], d = ix.depth[id], hs = ix.isHidden(id, C.hid), v = C.M.eff[id], par = ix.parent[id], has = ix.kids(id).length > 0;
      const sp = par == null ? null : share(v, C.M.eff[par]), st = share(v, tot);
      h += `<div class="row${sel === id ? ' sel' : onPath.has(id) ? ' path' : ''}${hs ? ' hid' : ''}" data-pick="t:${id}" role="treeitem" tabindex="0" aria-level="${d + 1}" aria-selected="${sel === id}"${has ? ` aria-expanded="${isOpen(id)}"` : ''}>
        <span class="nm" style="padding-left:${Math.min(d, 5) * 12}px">${has ? `<button type="button" class="tog" data-tog="${id}" tabindex="-1" aria-label="${isOpen(id) ? 'Close' : 'Open'} ${esc(n.name)}">${isOpen(id) ? '▾' : '▸'}</button>` : '<span class="tog"></span>'}<b>${esc(n.name)}</b><span class="t">${esc(n.title || '')}</span></span>
        <span class="bar"><span class="minibar"><i style="width:${hs || sp == null ? 0 : (sp * 100).toFixed(1)}%;background:${colorOf(id)}"></i></span></span>
        <span class="num">${hs ? 'hidden' : fmtNum(v)}</span><span class="num">${hs ? '–' : par == null ? '–' : fmtShare(sp)}</span><span class="num">${hs ? '–' : fmtShare(st)}</span></div>`;
    }
    rebuild(H.tree, h);
  }
  function renderCrumbs(sel){
    if (!H.crumbs) return; const p = ix.pathTo(sel);
    rebuild(H.crumbs, '<span class="lab">Path</span>' + p.map((id, i) => (i ? '<span class="sep" aria-hidden="true">›</span>' : '') +
      `<button type="button" class="crumb${id === sel ? ' cur' : ''}" data-pick="c:${id}"${id === sel ? ' aria-current="location"' : ''}>${esc(ix.by[id].name)}</button>`).join(''));
  }
  function renderDetail(sel){
    if (!H.detail) return;
    const id = sel, n = ix.by[id], tot = C.M.eff[ROOT], v = C.M.eff[id], par = ix.parent[id], showAll = T.HIDE_KEYS.map(k => k + '=false').join('; ');
    let h = `<p><b>${esc(T.relPath(id))}</b>${n.title ? ' · ' + esc(n.title) : ''}</p>${n.desc ? `<p>${n.desc}</p>` : ''}`;
    if (!(tot > 0)) h += `<p><b>Everything is hidden</b>, so there is nothing to total and no shares to show.</p><button type="button" class="btn" data-set="${showAll}">Show everything</button>`;
    else if (ix.isHidden(id, C.hid)){
      const top = ix.pathTo(id).find(x => C.hid[x]), back = C.M.sub[id];
      h += `<p><b>Hidden</b>: left out of every total. Shown again it would add ${fmtV(back)} (${fmtShare(share(back, tot + (top === id ? back : 0)))} of the new total${top === id ? '' : ', once ' + esc(ix.by[top].name) + ' is shown'}).</p><button type="button" class="btn" data-set="${T.hideKey(top)}=false">Show ${esc(ix.by[top].name)} again</button>`;
    } else {
      const lc = T.largestChild(id, C.M.eff), pv = par == null ? null : C.M.eff[par];
      h += `<table class="tr-kv"><tr><td>${esc(T.measures[P.measure].label)}</td><td><b>${fmtV(v)}</b>${T.mkeys.filter(m => m !== P.measure).map(m => ` <span class="mut">(${T.fmt(m, C.by[m].eff[id])})</span>`).join('')}</td></tr>` +
        (par == null ? `<tr><td>share</td><td>the whole (100%)</td></tr>` : `<tr><td>of ${esc(ix.by[par].name)}</td><td>${fmtShare(share(v, pv))}</td></tr><tr><td>of the total</td><td>${fmtShare(share(v, tot))}</td></tr>`) +
        `<tr><td>largest part</td><td>${lc ? `${esc(ix.by[lc].name)}: ${fmtV(C.M.eff[lc])} (${fmtShare(share(C.M.eff[lc], v))})` : ix.kids(id).length ? 'all parts hidden' : 'none (a leaf)'}</td></tr></table>`;
      h += par == null ? `<p>This is the whole tree. Hide its branches to see what is left.</p>`
        : `<p>Without it, <b>${esc(ix.by[par].name)}</b> would shrink from ${fmtV(pv)} to ${fmtV(pv - v)} (−${fmtShare(share(v, pv))}) and the total by ${fmtShare(share(v, tot))}.</p><button type="button" class="btn" data-set="${T.hideKey(id)}=true">Hide this branch</button>`;
    }
    rebuild(H.detail, h);
  }
  function renderTop(sel){
    if (!H.top) return;
    const tot = C.M.eff[ROOT], ls = T.topLeaves(C.M.eff, TOP_N), m = ls.length ? C.M.eff[ls[0]] : 1;
    rebuild(H.top, ls.length ? ls.map((id, i) => `<div class="li${sel === id ? ' sel' : ''}" data-pick="l:${id}" role="button" tabindex="0" aria-label="${i + 1}. ${esc(T.relPath(id))}: ${fmtV(C.M.eff[id])}"><span class="rk">${i + 1}</span>
      <span class="pth">${esc(T.relPath(id))}<span class="minibar"><i style="width:${(C.M.eff[id] / m * 100).toFixed(1)}%;background:${colorOf(id)}"></i></span></span>
      <span class="num">${fmtV(C.M.eff[id])}</span><span class="num">${fmtShare(share(C.M.eff[id], tot))}</span></div>`).join('')
      : '<p class="sub">Nothing left: every branch is hidden.</p>');
  }
  // parts below 1% of the zoomed node, at the two drawn levels: honest slivers (or not drawn), still listed in the tree
  V.slivers = (zoom, frac = 0.01) => { const zt = C.M.eff[zoom]; if (!(zt > 0)) return [];
    return ix.kids(zoom).flatMap(c => [c, ...ix.kids(c)]).filter(id => C.M.eff[id] > 0 && C.M.eff[id] / zt < frac); };
  function renderCaption(){
    if (!H.caption || !M) return; const tot = C.M.eff[ROOT], z = M.zoom, sl = V.slivers(z);
    H.caption.textContent = !(tot > 0) ? 'Everything is hidden.' : `Area = ${T.measures[P.measure].label}. Inside ${T.relPath(z)}: its parts, and their parts. Click a box to zoom in; the path above zooms out.` +
      (sl.length ? ` ${sl.length} part${sl.length > 1 ? 's are' : ' is'} under 1% of ${ix.by[z].name}, so ${sl.length > 1 ? 'they show' : 'it shows'} as a sliver or not at all; the tree lists ${sl.length > 1 ? 'them' : 'it'}.` : '');
  }
  function renderSelnav(sel){
    if (!H.selnav) return; const v = C.M.eff[sel];
    H.selnav.querySelector('.cur').innerHTML = `<b>${esc(T.relPath(sel))}</b> <span class="mut">${ix.isHidden(sel, C.hid) ? 'hidden' : fmtV(v)}</span>`;
  }
  V.render = ({ P: p, sel: s }) => {
    P = p; if (!built) build();
    const sel = selOf(s), now = performance.now();
    if (sel !== lastSel){ openTo(sel); lastSel = sel; openVer++; }   // also for selections from steps, links and data-set buttons
    if (H.map){ const z = T.zoomOf(sel, C.M.eff), W = Math.max(260, Math.floor(H.map.getBoundingClientRect().width || 600));   // CSS width:100%, so this is the panel's content width
      if (!M || M.zoom !== z || Math.abs(M.W - W) > 2) buildMap(z, W);
      setLayout(now); updateMap(now, sel); }
    const key = JSON.stringify(P) + '|' + sel + '|' + openVer;
    if (key === shown) return; shown = key;
    if (H.tree) renderTree(sel);
    renderCrumbs(sel); renderDetail(sel); renderTop(sel); renderCaption(); renderSelnav(sel);
    document.querySelectorAll('#measureSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.w === 'm_' + P.measure)));
  };
  // live numbers: val_/pct_/par_/pctall_<id> and v_<measure>_<id> for every node, plus totals and the top-N summary
  V.dyn = () => {
    const v = {}, tot = C.M.eff[ROOT], none = 'n/a (everything is hidden)';
    for (const id of ix.order){
      const hs = ix.isHidden(id, C.hid), par = ix.parent[id], e = C.M.eff[id];
      v['val_' + id] = hs ? 'hidden' : fmtV(e);
      for (const m of T.mkeys) v[`v_${m}_${id}`] = hs ? 'hidden' : T.fmt(m, C.by[m].eff[id]);
      v['pct_' + id] = hs ? 'hidden' : tot > 0 ? fmtShare(share(e, tot)) : none;
      v['par_' + id] = par == null ? 'the whole' : hs ? 'hidden' : C.M.eff[par] > 0 ? fmtShare(share(e, C.M.eff[par])) : none;
      v['pctall_' + id] = fmtShare(share(C.all.eff[id], C.all.eff[ROOT]));
    }
    v.root_total = tot > 0 ? fmtV(tot) : 'nothing (everything is hidden)';
    v.root_total_all = fmtV(C.all.eff[ROOT]);
    for (const m of T.mkeys) v['root_' + m] = C.by[m].eff[ROOT] > 0 ? T.fmt(m, C.by[m].eff[ROOT]) : 'nothing';
    const tl = T.topLeaves(C.M.eff, TOP_N);
    v.n_leaves = String(ix.leaves.filter(id => C.M.eff[id] > 0).length); v.top_n = String(tl.length);
    v.top_pct = tot > 0 ? fmtShare(share(tl.reduce((a, id) => a + C.M.eff[id], 0), tot)) : none;
    v.measure_name = T.measures[P.measure].label;
    v.n_hidden = String(T.HIDE_KEYS.filter(k => P[k]).length);
    return v;
  };
  V.readout = ({ sel: s }) => { const sel = selOf(s), tot = C.M.eff[ROOT];
    const hidTop = branches.filter(c => P[T.hideKey(c)]).map(c => ix.by[c].name), deeper = T.HIDE_KEYS.filter(k => P[k] && ix.parent[k.slice(5)] !== ROOT).length;
    const hidTxt = hidTop.length || deeper ? ` · hidden: <b>${[...hidTop.map(esc), ...(deeper ? [deeper + ' deeper part(s)'] : [])].join(', ')}</b>` : '';
    return !(tot > 0) ? `<b>Everything is hidden</b>: there is no total, so no shares. Show a branch again.`
      : `Total <b>${fmtV(tot)}</b> in ${ix.leaves.filter(id => C.M.eff[id] > 0).length} leaves${hidTxt} · selected <b>${esc(T.relPath(sel))}</b>` +
        (ix.isHidden(sel, C.hid) ? ' (hidden)' : ` = ${ix.parent[sel] == null ? 'the whole' : fmtShare(share(C.M.eff[sel], C.M.eff[ix.parent[sel]])) + ' of its parent, ' + fmtShare(share(C.M.eff[sel], tot)) + ' of the total'}`); };
  return V;
}

IE.tree = { index, totals, share, fmtShare, topLeaves, largestChild, zoomOf, squarify, nestedLayout, model, view };
if (typeof module === 'object' && module.exports) module.exports = IE.tree;
})();
