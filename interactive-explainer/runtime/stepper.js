/* interactive-explainer runtime: stepper.js (IE.stepper). Sequences, protocols, state machines, algorithms and code
   walkthroughs: a pure simulate(p) -> TRACE, one entry per message or action, each with a snapshot of every actor's
   state; lanes per actor; invariants checked at every step; a reference run to diff against; an optional source
   panel. Guide: shapes/stepper.md. Needs core.js in the page; the trace helpers (recorder, analyse, diverge) also load
   in Node:  globalThis.IE = {}; require('<skill>/runtime/stepper.js');
   Trace entry: { kind: 'msg', t, from, to, short, text, payload, tArr, lost, line, state }
             or { kind: 'note', t, actor, short, text, line, state }.
   short = the diagram label (about 18 characters at most); text = one sentence; tArr null or <= t = instant message
   (drawn flat), later = latency (sloped arrow); line = [from, to] lines of the source panel; state = { actorId: {...} }. */
(function(){
'use strict';
const ROOT = typeof window !== 'undefined' ? window : globalThis;
const IE = ROOT.IE || (ROOT.IE = {});
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------------------------------------------------------------- trace helpers (pure)
   recorder(state0) -> R: a tiny discrete-event simulator. R.st is the live state (mutate it); R.at(t, fn) schedules
   fn(t); R.note / R.msg append trace entries with a snapshot of R.st; R.run() processes events by time (ties in the
   order scheduled) and returns the trace. Use R.msg's extra.tArr for latency (arrival time) and extra.lost. */
function recorder(state0 = {}){
  const R = { st: state0, trace: [] }, q = []; let seq = 0;
  R.at = (t, fn) => { q.push({ t, seq: seq++, fn }); return R; };
  R.note = (t, actor, short, text, extra = {}) => { R.trace.push({ kind: 'note', t, actor, short, text, ...extra, state: clone(R.st) }); return R; };
  R.msg = (t, from, to, short, payload, text, extra = {}) => { R.trace.push({ kind: 'msg', t, from, to, short, text, payload: payload || {}, tArr: extra.tArr ?? t, lost: !!extra.lost, ...extra, state: clone(R.st) }); return R; };
  R.run = (max = 2000) => { for (let i = 0; q.length && i < max; i++){ q.sort((a, b) => a.t - b.t || a.seq - b.seq); const e = q.shift(); e.fn(e.t); } return R.trace; };
  return R;
}
const keyOf = e => e.kind === 'msg' ? `${e.from}>${e.to} ${e.short}${e.lost ? ' lost' : ''}` : `${e.actor}: ${e.short}`;
const labelOf = (e, actors) => { const L = id => ((actors || []).find(a => a.id === id) || {}).label || id;
  return e.kind === 'msg' ? `${L(e.from)} → ${L(e.to)}: ${e.short}${e.lost ? ' (lost)' : ''}` : `${L(e.actor)}: ${e.short}`; };
/* invariants: [{ id, label, check(state, isEnd, entry, i) -> true | false | null (cannot tell yet) }].
   Returns { firstBreak: { id: index | -1 }, broken: Set of first-break indices, ok, at(i) -> [{ inv, r }] }. */
function analyse(trace, invariants = []){
  const end = trace.length - 1, firstBreak = {};
  for (const inv of invariants){ firstBreak[inv.id] = -1; for (let i = 0; i <= end; i++) if (inv.check(trace[i].state, i === end, trace[i], i) === false){ firstBreak[inv.id] = i; break; } }
  const broken = new Set(Object.values(firstBreak).filter(i => i >= 0));
  return { firstBreak, broken, ok: !broken.size, at: i => invariants.map(inv => ({ inv, r: trace[i] ? inv.check(trace[i].state, i === end, trace[i], i) : null })) };
}
// First index where the run leaves the reference (-1: identical). key(e) decides what counts as "the same step".
function diverge(trace, ref, key = keyOf){
  const i = trace.findIndex((e, k) => !ref[k] || key(e) !== key(ref[k]));
  return i >= 0 ? i : ref.length > trace.length ? trace.length : -1;
}

/* ---------------------------------------------------------------- the app's selection = trace index K
   IE.app's numeric sel has a fixed max; this sets it to n - 1, updates the slider, and makes ▶ start again from step 1
   when it is pressed at the end. Call it from recompute() after the trace changes. */
function setLength(app, n){
  const sc = app.cfg.sel; sc.max = Math.max(sc.min, n - 1); const sl = typeof document !== 'undefined' && document.getElementById('sel'); if (sl) sl.max = sc.max;
  if (sl && !app._ieReplay){ app._ieReplay = true; const pb = document.getElementById('play');
    if (pb) pb.addEventListener('click', () => { if (app.playing && app.sel >= sc.max - 1e-9) app.setSel(sc.min); }); }
  if (app.sel > sc.max) app.setSel(sc.max);
}
const K = sel => Math.max(0, Math.floor((sel || 0) + 1e-9));

// keep el visible inside its own scroll box (never scrolls the page); top: height covered by a sticky header
function keepInView(box, el, top = 0){ if (!box || !el) return; const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (r.top < b.top + top + 16 || r.bottom > b.bottom - 16) box.scrollTop += (r.top - b.top - top) - (b.height - top) / 2 + r.height / 2; }

/* ---------------------------------------------------------------- lanes (SVG)
   IE.stepper.lanes(host, { actors: [{ id, label, short }], fmtTick: t => '40 ms', onPick: k => ..., title,
   minLane: 84 (px; more lanes than fit scroll sideways inside the view), timeSpan: 420 (px for the whole run),
   maxGap: 110 (px; a longer quiet stretch is shortened and drawn as a break) }) -> L.
   L.set({ trace, div, broken }) rebuilds; L.at(k) marks the current entry (cheap, per frame). */
function lanes(host, o){
  const actors = o.actors, fmtTick = o.fmtTick || (t => String(t)), wrap = document.createElement('div');
  wrap.className = 'ie-lanes'; host.appendChild(wrap);
  const head = IE.svg('svg', { class: 'lanehead', 'aria-hidden': 'true' }, wrap), body = IE.svg('svg', { class: 'lanebody', role: 'group', 'aria-roledescription': 'sequence diagram' }, wrap);
  const L = { el: body, wrap }; let S = null, G = null, curK = -1;
  const build = () => {
    const tr = S.trace; if (!tr.length){ body.replaceChildren(); return; }
    const avail = Math.max(280, wrap.clientWidth || 600), n = actors.length;
    const ticks = []; let lastT = null; tr.forEach((e, i) => { if (e.t !== lastT){ ticks.push(i); lastT = e.t; } });
    const gut = 10 + Math.max(24, ...ticks.map(i => IE.textWidth(fmtTick(tr[i].t), 10)));
    const W = Math.max(avail, gut + (o.minLane || 84) * n + 8), laneW = (W - gut - 8) / n;
    const LX = Object.fromEntries(actors.map((a, i) => [a.id, gut + laneW * (i + 0.5)]));
    // header (sticky): full names when they fit, else short names
    head.replaceChildren(); head.setAttribute('viewBox', `0 0 ${W} 34`); head.setAttribute('width', W); head.setAttribute('height', 34);
    const hw = Math.min(130, laneW - 8);
    actors.forEach(a => { const nm = IE.textWidth(a.label, 12, 'bold') + 12 <= hw ? a.label : (a.short || a.label);
      IE.svg('rect', { x: LX[a.id] - hw / 2, y: 4, width: hw, height: 26, rx: 6, class: 'hbox' }, head);
      IE.svg('text', { x: LX[a.id], y: 21, class: 'head lbl', 'text-anchor': 'middle', text: nm }, head); IE.svg('title', { text: a.label }, head); });
    // rows: time-proportional where the run has real gaps, at least `gap` apart
    const t0 = tr[0].t, tMax = Math.max(1e-9, ...tr.map(e => Math.max(e.t, e.tArr ?? e.t) - t0)), scale = o.timeScale || (o.timeSpan || 420) / tMax, gap = 30, top = 18;
    // a quiet stretch longer than maxGap px is shortened to maxGap and marked with a break (the gutter keeps the times)
    const maxGap = o.maxGap || 110, ys = [], breaks = [];
    tr.forEach((e, i) => { if (!i){ ys.push(top); return; } const want = (e.t - tr[i - 1].t) * scale;
      if (want > maxGap){ breaks.push(ys[i - 1] + maxGap / 2); ys.push(ys[i - 1] + maxGap); } else ys.push(ys[i - 1] + Math.max(gap, want)); });
    const inst = e => e.tArr == null || e.tArr <= e.t;
    const yAt = (i, t) => { for (let j = i + 1; j < tr.length; j++){ if (tr[j].t >= t){ if (tr[j].t === t) return ys[j]; const a = tr[j - 1].t, b = tr[j].t; return ys[j - 1] + (ys[j] - ys[j - 1]) * (t - a) / (b - a); } }
      return ys[ys.length - 1] + Math.min(maxGap, (t - tr[tr.length - 1].t) * scale); };
    const H = Math.ceil(Math.max(...ys, ...tr.map((e, i) => e.kind === 'msg' && !e.lost && !inst(e) ? yAt(i, e.tArr) : 0)) + 22);
    body.replaceChildren(); body.setAttribute('viewBox', `0 0 ${W} ${H}`); body.setAttribute('width', W); body.setAttribute('height', H);
    body.setAttribute('aria-label', (o.title || 'Sequence of messages between actors') + `: ${tr.length} steps`);
    const defs = IE.svg('defs', {}, body), mid = 'ies' + Math.random().toString(36).slice(2, 7);
    for (const k of ['msg', 'cur', 'bad']){ const m = IE.svg('marker', { id: `${mid}-${k}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, markerUnits: 'userSpaceOnUse', orient: 'auto' }, defs); IE.svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'mk ' + k }, m); }
    const hl = IE.svg('rect', { class: 'rowhl', x: 0, width: W, height: 28, y: -100 }, body);
    actors.forEach(a => IE.svg('line', { class: 'lifeline', x1: LX[a.id], x2: LX[a.id], y1: 0, y2: H }, body));
    for (const y of breaks){ IE.svg('rect', { class: 'tbreak', x: gut - 2, y: y - 4, width: W - gut, height: 8 }, body);
      IE.svg('path', { class: 'tbreakline', d: `M${gut - 2},${y - 4} H${W} M${gut - 2},${y + 4} H${W}` }, body); }
    const tickSet = new Set(ticks);
    const entries = tr.map((e, i) => {
      const y = ys[i], g = IE.svg('g', { class: 'entry ' + e.kind, 'data-pick': 'k:' + i }, body);
      IE.svg('title', { text: `${i + 1}. ${labelOf(e, actors)}${e.text ? ' — ' + e.text : ''}` }, g);
      if (tickSet.has(i)) IE.svg('text', { x: 4, y: y + 4, class: 'tl lbl' + (S.div >= 0 && i >= S.div ? ' div' : ''), text: fmtTick(e.t) }, body);
      const h = { g, y };
      if (e.kind === 'msg'){
        const x1 = LX[e.from], xt = LX[e.to], dir = Math.sign(xt - x1) || 1, self = e.from === e.to;
        let d, x2, y2, lx;
        if (self){ y2 = y + 14; d = `M${x1},${y} h22 v14 h-20`; x2 = x1; lx = x1 + 28; }
        else { x2 = e.lost ? (x1 + xt) / 2 : xt - dir * 2; y2 = e.lost ? y + 10 : inst(e) ? y : Math.max(y + 8, yAt(i, e.tArr)); d = `M${x1},${y} L${x2},${y2}`; lx = (x1 + (e.lost ? x2 : xt)) / 2; }
        h.arrow = IE.svg('path', { d, class: 'arrow' }, g);
        if (e.lost) IE.svg('path', { d: `M${x2 - 5},${y2 - 5} L${x2 + 5},${y2 + 5} M${x2 - 5},${y2 + 5} L${x2 + 5},${y2 - 5}`, class: 'xmark' }, g);
        IE.svg('path', { d: self ? `M${x1},${y - 9} h34 v32 h-34 Z` : `M${x1},${y - 10} L${x2},${y2 - 10} L${x2},${y2 + 9} L${x1},${y + 9} Z`, class: 'hit' }, g);
        const w = IE.textWidth(e.short, 11), anchor = self ? 'start' : 'middle', cx = self ? Math.min(lx, W - 4 - w) : IE.clamp(lx, gut + w / 2 + 2, W - w / 2 - 4);
        IE.svg('text', { x: cx, y: self ? y + 4 : y + Math.min((y2 - y) / 2, 10) - 5, class: 'ml lbl', 'text-anchor': anchor, text: e.short }, g);
        h.lost = e.lost;
      } else {
        const w = IE.textWidth(e.short, 11) + 14, cx = IE.clamp(LX[e.actor], gut + w / 2, W - 4 - w / 2);
        IE.svg('rect', { class: 'note', x: cx - w / 2, y: y - 10, width: w, height: 20, rx: 5 }, g);
        IE.svg('text', { x: cx, y: y + 4, class: 'nl lbl', 'text-anchor': 'middle', text: e.short }, g);
      }
      return h;
    });
    G = { W, avail, entries, hl, mid }; curK = -1;
  };
  const tog = (el, c, on) => { if (el.classList.contains(c) !== !!on) el.classList.toggle(c, !!on); };
  L.set = s => { S = { div: -1, broken: new Set(), ...(S || {}), ...s }; build(); if (L.k != null) L.at(L.k, true); return L; };
  L.at = (k, force) => { L.k = k; if (!G || !S || (!force && k === curK)) return L; curK = k;
    G.entries.forEach((h, i) => { tog(h.g, 'future', i > k); tog(h.g, 'cur', i === k); tog(h.g, 'lost', !!h.lost); tog(h.g, 'broken', S.broken.has(i)); tog(h.g, 'div', S.div >= 0 && i >= S.div);
      if (h.arrow && !h.lost) h.arrow.setAttribute('marker-end', `url(#${G.mid}-${i === k ? 'cur' : S.broken.has(i) ? 'bad' : 'msg'})`); });
    const h = G.entries[k]; if (h){ G.hl.setAttribute('y', h.y - 14); keepInView(wrap, h.g, 34); }
    return L; };
  body.addEventListener('click', ev => { const t = ev.target.closest('[data-pick]'); if (t && o.onPick) o.onPick(+t.dataset.pick.split(':')[1]); });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (S && G && Math.abs(G.avail - Math.max(280, wrap.clientWidth || 600)) > 2) L.set({}); }).observe(wrap);
  return L;
}

/* ---------------------------------------------------------------- source panel
   IE.stepper.source(host, { text, name }) -> { at([from, to]) }. Read text from a hidden <pre> (textContent), never
   from <script type="text/plain"> (check.js syntax-checks every inline script). */
function source(host, o){
  const pre = document.createElement('pre'); pre.className = 'ie-src'; pre.setAttribute('aria-label', 'Source' + (o.name ? ': ' + o.name : ''));
  pre.innerHTML = String(o.text).replace(/^\n/, '').replace(/\s+$/, '').split('\n').map((l, i) => `<span class="ln" data-ln="${i + 1}"><span class="n" aria-hidden="true">${i + 1}</span>${IE.esc(l) || ' '}</span>`).join('');
  host.appendChild(pre); let last = '';
  return { el: pre, at(line){ const key = line ? line.join('-') : ''; if (key === last) return; last = key; let first = null;
    pre.querySelectorAll('.ln').forEach(el => { const n = +el.dataset.ln, on = !!line && n >= line[0] && n <= (line[1] ?? line[0]); el.classList.toggle('hl', on); if (on && !first) first = el; });
    keepInView(pre, first); } };
}

/* ---------------------------------------------------------------- "at this step" card
   IE.stepper.card(host, { actors, invariants, fmtT }) -> C.set({ trace, k, an }): the entry, its message contents
   (fields that differ from the previous message marked), every actor's state (changes marked), and each rule. */
const show = v => v === null ? 'null' : typeof v === 'object' ? (Array.isArray(v) ? '[' + v.map(show).join(', ') + ']' : '{' + Object.entries(v).map(([k, x]) => k + ': ' + show(x)).join(', ') + '}') : String(v);
function card(host, o){
  const fmtT = o.fmtT || (t => 't = ' + t), esc = IE.esc, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return { set({ trace, k, an }){
    const e = trace[k]; if (!e){ host.innerHTML = ''; return; }
    const prev = trace[k - 1], prevMsg = trace.slice(0, k).reverse().find(x => x.kind === 'msg');
    let h = `<p><b>${k + 1} / ${trace.length}</b> · ${esc(fmtT(e.t))} · ${esc(labelOf(e, o.actors))}</p>${e.text ? `<p>${e.text}</p>` : ''}`;
    if (e.kind === 'msg' && Object.keys(e.payload || {}).length) h += '<h4>Message contents</h4><table class="kv">' + Object.entries(e.payload).map(([key, v]) =>
      `<tr><td>${esc(key)}</td><td><span class="${prevMsg && !same(prevMsg.payload[key], v) ? 'chg' : ''}">${esc(show(v))}</span></td></tr>`).join('') + '</table>';
    h += '<h4>State of each actor</h4><table class="kv">' + o.actors.map(a => `<tr><td>${esc(a.label)}</td><td>` +
      Object.entries(e.state[a.id] || {}).map(([key, v]) => { const chg = prev && !same((prev.state[a.id] || {})[key], v);
        return `<span class="${chg ? 'chg' : ''}">${esc(key)} = ${esc(show(v))}</span>`; }).join(' · ') + '</td></tr>').join('') + '</table>';
    if (o.invariants && o.invariants.length) h += '<h4>Rules</h4>' + an.at(k).map(({ inv, r }) =>
      `<p class="inv"><span class="${r === true ? 'ok' : r === false ? 'fail' : 'tbd'}" aria-label="${r === true ? 'holds' : r === false ? 'broken' : 'not decided yet'}">${r === true ? '✓' : r === false ? '✗' : '…'}</span> ${esc(inv.label)}${an.firstBreak[inv.id] >= 0 ? ` <span class="fail">(breaks at step ${an.firstBreak[inv.id] + 1})</span>` : ''}</p>`).join('');
    host.innerHTML = h;
  } };
}

/* ---------------------------------------------------------------- reference run vs this run
   IE.stepper.compare(host, { refLabel, actors, onPick: k => ... }) -> T.set({ ref, trace, div }); T.at(k). */
function compare(host, o){
  const box = document.createElement('div'); box.className = 'ie-cmp tablewrap'; host.appendChild(box); let rows = [], cur = -1;
  box.addEventListener('click', ev => { const r = ev.target.closest('tr[data-pick]'); if (r && o.onPick) o.onPick(+r.dataset.pick.split(':')[1]); });
  return { el: box,
    set({ ref, trace, div }){ const n = Math.max(ref.length, trace.length), esc = IE.esc;
      box.innerHTML = `<table class="ie-table"><thead><tr><th class="num">#</th><th scope="col">${esc(o.refLabel || 'Reference run')}</th><th scope="col">This run</th></tr></thead><tbody>${[...Array(n)].map((_, i) => {
        const a = ref[i], b = trace[i], d = div >= 0 && i >= div;
        return `<tr${b ? ` data-pick="k:${i}"` : ''}><td class="num">${i + 1}</td><td>${a ? esc(labelOf(a, o.actors)) : '—'}</td><td class="${d ? 'diff' : ''}">${b ? esc(labelOf(b, o.actors)) : '—'}</td></tr>`; }).join('')}</tbody></table>`;
      rows = [...box.querySelectorAll('tbody tr')]; cur = -1; },
    at(k){ if (k === cur) return; if (rows[cur]) rows[cur].classList.remove('on'); cur = k; if (rows[k]){ rows[k].classList.add('on'); keepInView(box, rows[k], 30); } } };
}

IE.stepper = { recorder, analyse, diverge, keyOf, labelOf, setLength, K, lanes, source, card, compare, keepInView };
if (typeof module === 'object' && module.exports) module.exports = IE.stepper;
})();
