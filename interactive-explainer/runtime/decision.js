/* interactive-explainer runtime: decision.js (IE.decision). "Should I…?": options costed under the reader's own
   numbers, exact break-even points, a one-line recommendation with the condition that would flip it, and a tornado of
   the inputs that matter most. Views: a question form, a decision tree / flowchart, stacked cost bars, a break-even
   chart (wraps IE.lineChart) and a tornado chart. The maths has no DOM and loads in Node for a model's validation run.
   Options: [{ id, label, short, color, cost: P => number | { part: value, … } }]. Guide: shapes/decision.md. */
(function(){
'use strict';
const G = typeof window !== 'undefined' ? window : globalThis, IE = G.IE || (G.IE = {});
const D = IE.decision = {};
const money = v => IE.fmt ? IE.fmt.money(v, 'USD') : '$' + Math.round(v);

// ---------------------------------------------------------------- maths (pure)
const sumOf = c => typeof c === 'number' ? c : Object.values(c).reduce((s, v) => s + v, 0);
const sgn = sense => sense === 'max' ? -1 : 1;                       // 'min': costs (default); 'max': values
const at = D.at = (P, k, v) => ({ ...P, [k]: v });
D.total = (o, P) => sumOf(o.cost(P));
D.parts = (o, P) => { const c = o.cost(P); return typeof c === 'number' ? { total: c } : c; };
D.rank = (options, P, sense) => options.map(o => ({ id: o.id, o, total: D.total(o, P) })).sort((a, b) => sgn(sense) * (a.total - b.total));
D.best = (options, P, sense) => { const r = D.rank(options, P, sense);
  return { best: r[0], runnerUp: r[1] || null, margin: r[1] ? Math.abs(r[1].total - r[0].total) : Infinity, ranking: r }; };
D.sweep = (options, P, key, lo, hi, n = 121) => options.map(o => ({ id: o.id, o,
  points: Array.from({ length: n }, (_, i) => { const x = lo + (hi - lo) * i / (n - 1); return [x, D.total(o, at(P, key, x))]; }) }));
/* Where the best option changes as `key` runs from lo to hi (others held at P): [{ x, from, to, y }]. Scans n steps,
   then bisects the cost difference of the two options to machine precision, so it works for any cost shape. */
D.crossings = (options, P, key, lo, hi, o = {}) => {
  const n = o.n || 400, win = x => D.best(options, at(P, key, x), o.sense).best, out = [];
  let px = lo, pw = win(lo);
  for (let i = 1; i <= n; i++){
    const x = lo + (hi - lo) * i / n, w = win(x); if (w.id === pw.id){ px = x; continue; }
    const f = v => D.total(pw.o, at(P, key, v)) - D.total(w.o, at(P, key, v)), fa = Math.sign(f(px));
    let a = px, b = x; for (let k = 0; k < 80 && b - a > 1e-12 * (Math.abs(a) + 1); k++){ const m = (a + b) / 2; if (Math.sign(f(m)) === fa) a = m; else b = m; }
    const xc = (a + b) / 2; out.push({ x: xc, from: pw.id, to: w.id, y: D.total(w.o, at(P, key, xc)) });
    pw = w; px = x;
  }
  return out;
};
// Break-even of two options in `key`, solved from two evaluations (exact when costs are linear in key; a few secant
// steps otherwise). null when the two never cross (parallel).
D.breakEven = (oa, ob, P, key) => {
  const d = v => D.total(oa, at(P, key, v)) - D.total(ob, at(P, key, v));
  let x0 = P[key], x1 = x0 + (Math.abs(x0) || 1), d0 = d(x0), d1 = d(x1);
  for (let k = 0; k < 30; k++){ if (Math.abs(d1 - d0) < 1e-14) return null; const x2 = x1 - d1 * (x1 - x0) / (d1 - d0);
    x0 = x1; d0 = d1; x1 = x2; d1 = d(x1); if (Math.abs(d1) < 1e-10 * (1 + Math.abs(D.total(oa, at(P, key, x1))))) break; }
  return x1;
};
/* One-at-a-time sensitivity of f(P) (e.g. the cost gap between two options): each input [{ id, lo, hi, … }] swings
   from lo to hi with the others held at P. Returns rows sorted by swing, each with fLo, fHi, swing, the central-
   difference derivative at P (deriv) and zero: where f crosses 0 inside [lo, hi] (the input's break-even), or null. */
D.sensitivity = (f, P, inputs) => inputs.map(inp => {
  const { id, lo, hi } = inp, fLo = f(at(P, id, lo)), fHi = f(at(P, id, hi)), h = (hi - lo) * 1e-5;
  const deriv = (f(at(P, id, P[id] + h)) - f(at(P, id, P[id] - h))) / (2 * h);
  let zero = null; if (fLo * fHi < 0){ let a = lo, b = hi; for (let k = 0; k < 80; k++){ const m = (a + b) / 2; if (Math.sign(f(at(P, id, m))) === Math.sign(fLo)) a = m; else b = m; } zero = (a + b) / 2; }
  return { ...inp, base: f(P), fLo, fHi, swing: Math.abs(fHi - fLo), deriv, zero };
}).sort((a, b) => b.swing - a.swing);
/* The nearest change of the best option, over every input's range: { id, input, at, dir: -1 below | +1 above,
   winner (option), rel: distance / range, phrase }. null when no single input within its range changes the best. */
D.flip = (options, P, inputs, sense) => {
  const cur = D.best(options, P, sense).best; let best = null;
  for (const inp of inputs){ const v = P[inp.id], xs = D.crossings(options, P, inp.id, inp.lo, inp.hi, { sense });
    const up = xs.find(c => c.x > v + 1e-12), dn = [...xs].reverse().find(c => c.x < v - 1e-12);
    for (const [c, dir] of [[up, 1], [dn, -1]]){ if (!c) continue; const rel = Math.abs(c.x - v) / (inp.hi - inp.lo);
      const wid = dir > 0 ? c.to : c.from; if (wid === cur.id) continue;
      if (!best || rel < best.rel) best = { id: inp.id, input: inp, at: c.x, dir, rel, winner: options.find(o => o.id === wid) }; } }
  if (best){ const i = best.input, xt = (i.fmt || (v => String(+v.toPrecision(3))))(best.at);
    best.phrase = i.phrase ? i.phrase(best.dir, xt) : `${(i.label || i.id).toLowerCase()} is ${best.dir < 0 ? 'below' : 'above'} ${xt}`; }
  return best;
};
/* Recommendation in one line: { best, runnerUp, margin, flip, text }. o: { sense, fmt (money), horizon: 'over 3 years' }.
   Options may carry noun ('the budget unit') for use inside a sentence; label is used otherwise. */
D.recommend = (options, P, inputs, o = {}) => {
  const b = D.best(options, P, o.sense), f = D.flip(options, P, inputs, o.sense), fm = o.fmt || money;
  const nm = x => x.noun || x.label, cap = s => s.charAt(0).toUpperCase() + s.slice(1), hz = o.horizon ? ' ' + o.horizon : '';
  const lead = !b.runnerUp ? `${cap(nm(b.best.o))} is the only option.` : o.sense === 'max'
    ? `${cap(nm(b.best.o))} is worth most${hz}: ${fm(b.best.total)}, ${fm(b.margin)} more than ${nm(b.runnerUp.o)}.`
    : `${cap(nm(b.best.o))} costs least${hz}: ${fm(b.best.total)}, ${fm(b.margin)} less than ${nm(b.runnerUp.o)}.`;
  return { ...b, flip: f, text: lead + (f ? ` If ${f.phrase}, ${nm(f.winner)} wins.` : ' No single input within its range changes that.') };
};

// ---------------------------------------------------------------- shared view helpers (browser only)
const cc = c => IE.cssColor(c);
const keyPick = (el, fn) => { el.addEventListener('click', fn); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fn(); } }); };
const pickable = (el, id, label, fn) => { el.setAttribute('data-pick', id); el.setAttribute('tabindex', 0); el.setAttribute('role', 'button'); el.setAttribute('aria-label', label); keyPick(el, fn); };
const wrap = D.wrap = (s, maxW, px = 12, weight = '', maxLines = 2) => {
  const lines = []; let cur = '';
  for (const w of String(s).split(/\s+/)){ const t = cur ? cur + ' ' + w : w; if (!cur || IE.textWidth(t, px, weight) <= maxW) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  if (lines.length > maxLines){ lines.length = maxLines; lines[maxLines - 1] += '…'; }
  return lines.map(l => { if (IE.textWidth(l, px, weight) <= maxW) return l; let t = l.replace(/…$/, ''); while (t.length > 1 && IE.textWidth(t + '…', px, weight) > maxW) t = t.slice(0, -1); return t + '…'; });
};
const lines = (parent, ls, x, yTop, attrs, lh = 14) => { const t = IE.svg('text', { ...attrs, x, y: yTop }, parent); ls.forEach((l, i) => IE.svg('tspan', { x, dy: i ? lh : 0, text: l }, t)); return t; };
const observe = (host, ch, getW) => { new ResizeObserver(() => { if (ch.S && host.clientWidth && host.clientWidth !== getW()) ch.set({}); }).observe(host); };
const onlyKeys = (patch, keys) => patch && Object.keys(patch).length && Object.keys(patch).every(k => keys.includes(k));

/* D.questions(host, app, [{ id, q, unit, min, max, step, fmt, hint, group }], { more: 'Prices you were quoted' })
   -> { sync() }. A short form: each question is a parameter of app.P (a number box for the reader's exact value plus
   a slider), kept in step with steps, what-ifs and the URL. Questions with group:'more' go into a <details>. */
D.questions = (host, app, qs, o = {}) => {
  const row = q => `<div class="ie-q"><label for="q_${q.id}">${q.q}</label><div class="ie-qin"><input type="number" id="q_${q.id}" min="${q.min}" max="${q.max}" step="${q.step}" inputmode="decimal">${q.unit ? `<span class="unit">${q.unit}</span>` : ''}<input type="range" id="qr_${q.id}" min="${q.min}" max="${q.max}" step="${q.step}" aria-label="${IE.esc(q.q)}"></div>${q.hint ? `<p class="hint">${q.hint}</p>` : ''}</div>`;
  const main = qs.filter(q => q.group !== 'more'), more = qs.filter(q => q.group === 'more');
  host.insertAdjacentHTML('beforeend', `<div class="ie-qs">${main.map(row).join('')}${more.length ? `<details class="ie-qmore"><summary>${o.more || 'More settings'}</summary>${more.map(row).join('')}</details>` : ''}</div>`);
  for (const q of qs){ const nb = IE.$('q_' + q.id), rg = IE.$('qr_' + q.id);
    const put = v => { if (v === '' || !isFinite(+v)) return; app.set({ [q.id]: IE.clamp(+v, q.min, q.max) }); };
    nb.addEventListener('change', () => put(nb.value)); nb.addEventListener('input', () => { if (nb.value !== '' && +nb.value >= q.min && +nb.value <= q.max) put(nb.value); });
    rg.addEventListener('input', () => put(rg.value)); }
  const sync = () => { for (const q of qs){ const v = app.P[q.id], nb = IE.$('q_' + q.id), rg = IE.$('qr_' + q.id); if (!nb) continue;
    if (document.activeElement !== nb && +nb.value !== +(+v).toFixed(6)) nb.value = +(+v).toFixed(6); if (+rg.value !== v) rg.value = v; } };
  app.afterRender.push(sync); return { sync };
};

/* D.picker(host, options:[{id,label}], onPick, { label }) -> { set(id) }: segmented buttons (data-pick) for the
   selected option in #controls. */
D.picker = (host, items, onPick, o = {}) => {
  const d = document.createElement('div'); d.className = 'seg ie-pick'; d.setAttribute('role', 'group'); d.setAttribute('aria-label', o.label || 'Option');
  d.innerHTML = items.map(it => `<button type="button" data-pick="${IE.esc(it.id)}" aria-pressed="false"${it.title ? ` title="${IE.esc(it.title)}"` : ''}>${IE.esc(it.short || it.label)}</button>`).join('');
  host.appendChild(d); d.querySelectorAll('button').forEach(b => b.onclick = () => onPick(b.dataset.pick));
  return { el: d, set(id){ d.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.pick === String(id) ? 'true' : 'false')); } };
};

/* ---------------------------------------------------------------- decision tree / flowchart
   D.tree(host, { title, root, highlight: [ids on the path], best: id, onPick: pick => … }) -> { set(patch) }
   node: { id, kind: 'decision' | 'chance' | 'question' | 'leaf', label, value, pick, children: [node] }.
   Left to right, one column per level, leaves stacked. Markers follow the usual notation: square = decision, circle =
   chance, diamond = question, triangle = end. Nodes with `pick` are buttons (data-pick) that move the selection.
   Keep it to 3–4 levels and about 8 leaves; group branches beyond that. */
D.tree = (host, spec) => {
  const root = IE.svg('svg', { class: 'ie-chart ie-tree' }, host), title = IE.svg('title', {}, root), base = IE.svg('g', {}, root);
  const ch = { el: root, S: null }; let W0 = 0, nodeEls = {}, edgeEls = [];
  const build = () => {
    const S = ch.S, W = W0 = Math.max(260, host.clientWidth || 600), all = [];
    const walk = (n, d, parent) => { n._d = d; n._p = parent; all.push(n); (n.children || []).forEach(c => walk(c, d + 1, n)); }; walk(S.root, 0, null);
    const depth = Math.max(...all.map(n => n._d)), gapX = W < 520 ? 14 : 28, boxW = (W - 8 - gapX * depth) / (depth + 1), tw = boxW - 26;
    for (const n of all){ n._l = wrap(n.label, tw, 12, '600', 2); n._v = n.value ? wrap(n.value, tw, 11.5, '', 2) : []; n._h = 12 + 14 * (n._l.length + n._v.length); }
    let cur = 6; const vgap = 10;
    const place = n => { if (!(n.children || []).length){ n._y = cur + n._h / 2; cur += n._h + vgap; return; }
      n.children.forEach(place); n._y = (n.children[0]._y + n.children[n.children.length - 1]._y) / 2;
      const need = n._y + n._h / 2 + vgap; if (need > cur) cur = need; };
    place(S.root);
    const H = Math.ceil(cur), X = d => 4 + d * (boxW + gapX);
    root.setAttribute('viewBox', `0 0 ${W} ${H}`); root.setAttribute('width', W); root.setAttribute('height', H);
    title.textContent = (S.title || 'Decision tree') + ': ' + all.filter(n => !(n.children || []).length).map(n => `${n._p ? n._p.label + ' → ' : ''}${n.label}${n.value ? ' ' + n.value : ''}`).join('; ');
    root.setAttribute('aria-label', title.textContent); root.setAttribute('role', S.onPick ? 'group' : 'img');
    base.replaceChildren(); nodeEls = {}; edgeEls = [];
    for (const n of all) if (n._p){ const x1 = X(n._p._d) + boxW, x2 = X(n._d), xm = (x1 + x2) / 2;
      edgeEls.push({ a: n._p.id, b: n.id, el: IE.svg('path', { class: 'tedge', d: `M${x1},${n._p._y}C${xm},${n._p._y} ${xm},${n._y} ${x2},${n._y}` }, base) }); }
    for (const n of all){
      const x = X(n._d), y = n._y - n._h / 2, g = IE.svg('g', { class: 'tnode k-' + (n.kind || 'leaf') }, base);
      if (n.pick != null && S.onPick) pickable(g, n.pick, `${n.label}${n.value ? ': ' + n.value : ''}`, () => ch.S.onPick(n.pick));
      IE.svg('rect', { class: 'tbox', x, y, width: boxW, height: n._h, rx: n.kind === 'chance' ? 12 : 5 }, g);
      const mx = x + 11, my = y + 13, k = n.kind || 'leaf', col = n.color ? cc(n.color) : null;
      if (k === 'decision') IE.svg('rect', { class: 'tmark', x: mx - 4.5, y: my - 4.5, width: 9, height: 9, fill: col }, g);
      else if (k === 'chance') IE.svg('circle', { class: 'tmark', cx: mx, cy: my, r: 5, fill: col }, g);
      else if (k === 'question') IE.svg('path', { class: 'tmark', d: `M${mx},${my - 6}L${mx + 6},${my}L${mx},${my + 6}L${mx - 6},${my}Z`, fill: col }, g);
      else IE.svg('path', { class: 'tmark', d: `M${mx - 5},${my}L${mx + 4},${my - 5}L${mx + 4},${my + 5}Z`, fill: col }, g);
      lines(g, n._l, x + 21, y + 17, { class: 'lbl tname' });
      if (n._v.length) lines(g, n._v, x + 21, y + 17 + 14 * n._l.length, { class: 'lbl tval' });
      nodeEls[n.id] = g;
    }
  };
  const paint = () => { const S = ch.S, on = new Set([].concat(S.highlight || []).map(String));
    for (const id in nodeEls){ nodeEls[id].classList.toggle('on', on.has(id)); nodeEls[id].classList.toggle('best', String(S.best) === id); }
    for (const e of edgeEls) e.el.classList.toggle('on', on.has(String(e.a)) && on.has(String(e.b))); };
  ch.set = patch => { const only = onlyKeys(patch, ['highlight', 'best']); ch.S = { ...(ch.S || {}), ...patch }; if (!only || !Object.keys(nodeEls).length) build(); paint(); return ch; };
  observe(host, ch, () => W0);
  return ch.set(spec);
};

/* ---------------------------------------------------------------- stacked cost bars
   D.stackedBars(host, { title, rows:[{ id, label, parts:{ key: value }, note }], parts:[{ key, label, color }], fmt,
     highlight, onPick, legend: true }) -> { set(patch) }. One bar per option, split into its cost parts (non-negative),
   total and note at the end. Rows are buttons (data-pick) when onPick is given. */
D.stackedBars = (host, spec) => {
  const leg = document.createElement('div'); leg.className = 'legend'; host.appendChild(leg);
  const root = IE.svg('svg', { class: 'ie-chart ie-sbars' }, host), title = IE.svg('title', {}, root), base = IE.svg('g', {}, root);
  const ch = { el: root, S: null }; let W0 = 0, rowEls = {};
  const build = () => {
    const S = ch.S, fm = S.fmt || money, W = W0 = Math.max(260, host.clientWidth || 600), rowH = S.rowH || 36;
    if (!S.rows.length){ base.replaceChildren(); rowEls = {}; root.setAttribute('height', 0); return; }
    const tot = r => S.parts.reduce((s, p) => s + Math.max(0, r.parts[p.key] || 0), 0), txt = r => fm(tot(r)) + (r.note ? '  ' + r.note : '');
    const labW = Math.min(W * 0.3, 12 + Math.max(...S.rows.map(r => IE.textWidth(r.label, 12)))), valW = Math.min(W * 0.36, 12 + Math.max(...S.rows.map(r => IE.textWidth(txt(r), 12, 'bold'))));
    const mx = S.max || IE.niceMax(Math.max(...S.rows.map(tot))), x0 = labW + 4, pw = Math.max(40, W - x0 - valW - 6), X = v => x0 + v / mx * pw, H = S.rows.length * rowH + 22;
    root.setAttribute('viewBox', `0 0 ${W} ${H}`); root.setAttribute('width', W); root.setAttribute('height', H);
    title.textContent = (S.title || 'Cost per option') + ': ' + S.rows.map(r => `${r.label} ${fm(tot(r))}`).join(', ');
    root.setAttribute('aria-label', title.textContent); root.setAttribute('role', S.onPick ? 'group' : 'img');
    base.replaceChildren(); rowEls = {};
    for (const v of IE.ticks(0, mx, Math.max(2, Math.round(pw / 90)))){ IE.svg('line', { class: 'grid', x1: X(v), x2: X(v), y1: 2, y2: S.rows.length * rowH + 2 }, base);
      IE.svg('text', { class: 'tick', x: X(v), y: H - 5, 'text-anchor': v === 0 ? 'start' : X(v) > x0 + pw - 20 ? 'end' : 'middle', text: fm(v) }, base); }
    S.rows.forEach((r, i) => { const y = 2 + i * rowH, g = IE.svg('g', { class: 'srow' }, base);
      if (S.onPick) pickable(g, r.id, `${r.label}: ${fm(tot(r))} (${S.parts.filter(p => r.parts[p.key]).map(p => `${p.label} ${fm(r.parts[p.key])}`).join(', ')})`, () => ch.S.onPick(r.id));
      IE.svg('rect', { class: 'sbg', x: 0, y: y + 1, width: W, height: rowH - 2, rx: 5 }, g);
      const ls = wrap(r.label, labW - 10, 12, '', 2); lines(g, ls, labW - 6, y + rowH / 2 + 4 - (ls.length - 1) * 6.5, { class: 'lbl', 'text-anchor': 'end' }, 13);
      let acc = 0; for (const p of S.parts){ const v = Math.max(0, r.parts[p.key] || 0); if (!v) continue;
        IE.svg('rect', { x: X(acc), y: y + 7, width: Math.max(0.5, X(acc + v) - X(acc) - 0.6), height: rowH - 14, fill: cc(p.color) }, g); acc += v; }
      IE.svg('rect', { class: 'sout', x: x0 - 1, y: y + 6, width: X(acc) - x0 + 2, height: rowH - 12, rx: 2, fill: 'none' }, g);
      IE.svg('text', { class: 'lbl end', x: X(acc) + 6, y: y + rowH / 2 + 4, text: txt(r) }, g);
      rowEls[r.id] = g; });
    leg.innerHTML = S.legend === false ? '' : S.parts.map(p => `<span><i style="background:${cc(p.color)};height:9px;width:9px"></i>${IE.esc(p.label)}</span>`).join('');
  };
  const paint = () => { for (const id in rowEls) rowEls[id].classList.toggle('on', String(ch.S.highlight) === id); };
  ch.set = patch => { const only = onlyKeys(patch, ['highlight']); ch.S = { ...(ch.S || {}), ...patch }; if (!only || !Object.keys(rowEls).length) build(); paint(); return ch; };
  observe(host, ch, () => W0);
  return ch.set(spec);
};

/* ---------------------------------------------------------------- break-even chart
   D.breakEvenChart(host, { options, P, key, lo, hi, n, sense, highlight, fmtX, fmtY, xLabel, height, title,
     youLabel: v => text, onPick: x => … }) -> { set(patch), crossings, chart }
   Each option's total as `key` sweeps lo..hi (the others at P), the reader's value as a cursor, every point where
   the best option changes as a labelled dot, and the stretch where the highlighted option is best shaded. */
D.breakEvenChart = (host, spec) => {
  const be = { S: null, crossings: [], chart: null };
  be.set = patch => {
    const S = be.S = { ...(be.S || {}), ...patch }, fx = S.fmtX || (v => String(+v.toPrecision(3))), fy = S.fmtY || money;
    const sw = D.sweep(S.options, S.P, S.key, S.lo, S.hi, S.n || 121), xs = D.crossings(S.options, S.P, S.key, S.lo, S.hi, { sense: S.sense });
    be.crossings = xs;
    const segs = [], cuts = [S.lo, ...xs.map(c => c.x), S.hi];
    for (let i = 0; i < cuts.length - 1; i++){ const w = D.best(S.options, at(S.P, S.key, (cuts[i] + cuts[i + 1]) / 2), S.sense).best.id; if (w === S.highlight) segs.push({ x0: cuts[i], x1: cuts[i + 1] }); }
    const ys = sw.flatMap(s => s.points.map(p => p[1])), y0 = Math.min(0, ...ys), y1 = IE.niceMax(Math.max(...ys) * 1.04);
    const v = S.P[S.key], cur = D.best(S.options, S.P, S.sense).best;
    const cs = { title: S.title || 'Break-even', height: S.height || 300, summary: xs.length ? xs.map(c => `${S.options.find(o => o.id === c.to).label} becomes best at ${fx(c.x)}`).join('; ') : 'the best option does not change over this range',
      x: { min: S.lo, max: S.hi, fmt: fx, label: S.xLabel }, y: { min: y0, max: y1, fmt: fy },
      series: sw.map(s => ({ id: s.id, label: s.o.short || s.o.label, color: s.o.color || 's1', points: s.points, width: s.id === S.highlight ? 3.2 : 1.8 })),
      bands: segs.map(b => ({ x0: b.x0, x1: b.x1 })), legend: false,
      cursor: v, cursorLabel: S.youLabel ? S.youLabel(v) : `you: ${fx(v)}`,
      // crossing labels sit just under their dot (above it near the floor), clear of the cursor label at the top
      notes: xs.map(c => ({ x: c.x, y: c.y - (y1 - y0) * 0.075 < y0 + (y1 - y0) * 0.04 ? c.y + (y1 - y0) * 0.05 : c.y - (y1 - y0) * 0.075, text: fx(c.x), anchor: 'middle' })),
      marks: [...xs.map(c => ({ x: c.x, y: c.y, color: 'ink', r: 4 })), { x: v, y: cur.total, color: cur.o.color || 'ink', r: 5 }] };
    if (!be.chart){ be.chart = IE.lineChart(host, { ...cs, onPick: x => be.S.onPick && be.S.onPick(x) }); } else be.chart.set(cs);
    return be;
  };
  return be.set(spec);
};

/* ---------------------------------------------------------------- tornado chart
   D.tornado(host, { title, rows: D.sensitivity(...) rows [{ id, label, lo, hi, fLo, fHi, fmt (input) }], base, fmt
     (outcome), x: { label }, zero: true, zeroLabel: 'tie', baseLabel: v => text, loColor: 's1', hiColor: 's2',
     highlight, onPick: id => …, legend: true }) -> { set(patch) }
   One bar per input from the outcome at its low value to the outcome at its high value, centred on today's outcome,
   longest on top. The dashed zero line is where the two compared options tie: a bar that crosses it can flip the
   decision on its own. */
D.tornado = (host, spec) => {
  const leg = document.createElement('div'); leg.className = 'legend'; host.appendChild(leg);
  const root = IE.svg('svg', { class: 'ie-chart ie-tornado' }, host), title = IE.svg('title', {}, root), base = IE.svg('g', {}, root);
  const ch = { el: root, S: null }; let W0 = 0, rowEls = {};
  const build = () => {
    const S = ch.S, fm = S.fmt || money, W = W0 = Math.max(260, host.clientWidth || 600), rowH = S.rowH || 30, rows = S.rows;
    if (!rows.length){ base.replaceChildren(); rowEls = {}; root.setAttribute('height', 0); return; }
    const fin = r => (r.fmt || (v => String(+v.toPrecision(3)))), tl = r => fin(r)(r.lo), th = r => fin(r)(r.hi);
    const labW = Math.min(W * (W < 520 ? 0.36 : 0.3), 12 + Math.max(...rows.map(r => IE.textWidth(r.label, 12, '650')))), tw = 8 + Math.max(...rows.flatMap(r => [IE.textWidth(tl(r), 11.5), IE.textWidth(th(r), 11.5)]));
    const vals = rows.flatMap(r => [r.fLo, r.fHi]).concat([S.base], S.zero === false ? [] : [0]), mn = Math.min(...vals), mx = Math.max(...vals);
    const p0 = labW + 6 + tw, p1 = W - 6 - tw, X = v => p0 + (v - mn) / ((mx - mn) || 1) * (p1 - p0);
    const zl = S.zero === false || !(mn <= 0 && mx >= 0) ? null : S.zeroLabel || 'tie', bl = S.baseLabel ? S.baseLabel(S.base) : `now ${fm(S.base)}`;
    const wb = IE.textWidth(bl, 11.5) + 6, wz = zl ? IE.textWidth(zl, 11.5) + 6 : 0, xb = IE.clamp(X(S.base) - wb / 2, 2, W - wb - 2), xz = zl ? IE.clamp(X(0) - wz / 2, 2, W - wz - 2) : 0;
    const flips = r => !!zl && r.fLo * r.fHi < 0;   // the bar crosses the tie line: this input alone can flip the choice
    const xl = S.x && S.x.label ? wrap(S.x.label, W - 12, 11, '', 2) : [];
    const two = zl && xb < xz + wz && xz < xb + wb, top = two ? 32 : 18, yb = top + rows.length * rowH, H = yb + 24 + 14 * xl.length;
    root.setAttribute('viewBox', `0 0 ${W} ${H}`); root.setAttribute('width', W); root.setAttribute('height', H);
    title.textContent = (S.title || 'What matters most') + ': ' + rows.map(r => `${r.label} from ${tl(r)} to ${th(r)} moves it from ${fm(r.fLo)} to ${fm(r.fHi)}`).join('; ');
    root.setAttribute('aria-label', title.textContent); root.setAttribute('role', S.onPick ? 'group' : 'img');
    base.replaceChildren(); rowEls = {};
    for (const v of IE.ticks(mn, mx, Math.max(3, Math.round((p1 - p0) / 70)))){ IE.svg('line', { class: 'grid', x1: X(v), x2: X(v), y1: top, y2: yb }, base);
      IE.svg('text', { class: 'tick', x: X(v), y: yb + 15, 'text-anchor': 'middle', text: fm(v) }, base); }
    if (xl.length) lines(base, xl, W / 2, yb + 34, { class: 'tick', 'text-anchor': 'middle' }, 13);
    rows.forEach((r, i) => { const y = top + i * rowH, cy = y + rowH / 2, g = IE.svg('g', { class: 'trow' + (flips(r) ? ' flips' : '') }, base);
      if (S.onPick) pickable(g, r.id, `${r.label}: ${tl(r)} gives ${fm(r.fLo)}, ${th(r)} gives ${fm(r.fHi)}`, () => ch.S.onPick(r.id));
      IE.svg('rect', { class: 'tbg', x: 0, y: y + 1, width: W, height: rowH - 2, rx: 5 }, g);
      const ls = wrap(r.label, labW - 8, 12, flips(r) ? '650' : '', 2); lines(g, ls, labW - 4, cy + 4 - (ls.length - 1) * 6.5, { class: 'lbl tl', 'text-anchor': 'end' }, 13);
      for (const [f, t, c] of [[r.fLo, tl(r), S.loColor || 's1'], [r.fHi, th(r), S.hiColor || 's2']]){
        const a = X(Math.min(S.base, f)), b = X(Math.max(S.base, f));
        IE.svg('rect', { x: a, y: y + 7, width: Math.max(1, b - a), height: rowH - 14, rx: 2, fill: cc(c) }, g);
        const right = f >= S.base; IE.svg('text', { class: 'lbl tv', x: right ? b + 4 : a - 4, y: cy + 4, 'text-anchor': right ? 'start' : 'end', text: t }, g); }
      rowEls[r.id] = g; });
    IE.svg('line', { class: 'axis', x1: X(S.base), x2: X(S.base), y1: top - 3, y2: yb, 'stroke-width': 1.6 }, base);
    IE.svg('text', { class: 'note lbl', x: xb + 3, y: 12, text: bl }, base);
    if (zl){ IE.svg('line', { class: 'tzero', x1: X(0), x2: X(0), y1: top - 3, y2: yb }, base); IE.svg('text', { class: 'note lbl tzl', x: xz + 3, y: two ? 26 : 12, text: zl }, base); }
    leg.innerHTML = S.legend === false ? '' : `<span><i style="background:${cc(S.loColor || 's1')};height:9px;width:9px"></i>${IE.esc(S.loText || 'input at the low end of its range')}</span><span><i style="background:${cc(S.hiColor || 's2')};height:9px;width:9px"></i>${IE.esc(S.hiText || 'at the high end')}</span>`;
  };
  const paint = () => { for (const id in rowEls) rowEls[id].classList.toggle('on', String(ch.S.highlight) === id); };
  ch.set = patch => { const only = onlyKeys(patch, ['highlight']); ch.S = { ...(ch.S || {}), ...patch }; if (!only || !Object.keys(rowEls).length) build(); paint(); return ch; };
  observe(host, ch, () => W0);
  return ch.set(spec);
};

if (typeof module === 'object' && module.exports) module.exports = D;
})();
