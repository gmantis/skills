/* interactive-explainer runtime: timeline.js (IE.timeline). "What happened when, in which era, and what changed
   because of it": era bands, event lanes with point and span events, labels stacked within a lane (labels that cannot
   fit are hidden; the detail card shows them), "led to" links, a brush overview strip, a selected-date cursor, a
   density view (counts per year) and a counts-per-era chart. Guide: shapes/timeline.md.
   The pure helpers (prepare, audit, count, matrix, step, parse, fmtT, fmtWhen) also load in Node:
   require('<skill>/runtime/timeline.js') returns IE.timeline, so the page's model can be validated outside the browser. */
(function(root){
'use strict';
const IE = root.IE || (root.IE = {});
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const at = (y, m, d) => { const x = new Date(0); x.setUTCFullYear(y, m, d); x.setUTCHours(0, 0, 0, 0); return +x; };   // years < 100 stay literal
const dec = (y, m, d) => y + (at(y, m, d) - at(y, 0, 1)) / (at(y + 1, 0, 1) - at(y, 0, 1));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const series = i => 's' + ((i % 8) + 1);

/* Dates: 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD' | Date | decimal year. Internally a decimal year t (start of the period) and a
   precision ('y' | 'm' | 'd') that decides how the date is printed. An end date names the last period that is included:
   end '2013' runs to 2014.0, end '2013-06' to 1 Jul 2013. */
function parse(v){
  if (v == null || v === '') return null;
  if (v instanceof Date) return { t: dec(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()), prec: 'd', y: v.getUTCFullYear(), m: v.getUTCMonth(), d: v.getUTCDate() };
  if (typeof v === 'number') return { t: v, prec: Number.isInteger(v) ? 'y' : 'd', num: true };
  const m = /^(-?\d{1,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(String(v).trim());
  if (!m) throw new Error(`timeline: cannot read the date "${v}" (use YYYY, YYYY-MM or YYYY-MM-DD)`);
  const y = +m[1], mo = m[2] ? +m[2] - 1 : 0, d = m[3] ? +m[3] : 1;
  if (mo < 0 || mo > 11 || d < 1 || d > 31) throw new Error(`timeline: "${v}" is not a real date`);
  return { t: dec(y, mo, d), prec: m[3] ? 'd' : m[2] ? 'm' : 'y', y, m: mo, d };
}
function endOf(v){
  const p = parse(v); if (!p) return null;
  if (p.num) return p.prec === 'y' ? p.t + 1 : p.t;
  return p.prec === 'y' ? dec(p.y + 1, 0, 1) : p.prec === 'm' ? dec(p.y, p.m + 1, 1) : dec(p.y, p.m, p.d + 1);
}
function toParts(t){
  const y = Math.floor(t), s = at(y, 0, 1), a = new Date(Math.round(s + (t - y) * (at(y + 1, 0, 1) - s)));
  return { y: a.getUTCFullYear(), m: a.getUTCMonth(), d: a.getUTCDate() };
}
const fmtT = (t, prec = 'd') => { if (t == null || !isFinite(t)) return '–'; const p = toParts(t);
  return prec === 'y' ? String(p.y) : prec === 'm' ? `${MON[p.m]} ${p.y}` : `${p.d} ${MON[p.m]} ${p.y}`; };
const fmtWhen = e => e.span ? `${fmtT(e.t, e.prec)} – ${fmtT(e.te, e.endPrec)}` : fmtT(e.t, e.prec);

/* prepare(model) -> D: { lanes, eras, events (sorted by date; e.i = index), byId, domain:[t0,t1] }.
   model = { lanes:[{id,label,color}], eras:[{id,label,short,start,end}], events:[{id,date,end?,lane,title,short?,text?,source?,ledTo?:[id]}], domain?:[start,end] }
   Each event gets t, t1 (exclusive end of a span), era (the era its start falls in), next/prev (led-to links as indices). */
function prepare(m){
  if (m && m._tl) return m;
  const lanes = (m.lanes || []).map((l, i) => ({ color: series(i), ...l, idx: i }));
  const laneIdx = Object.fromEntries(lanes.map(l => [l.id, l.idx]));
  const eras = (m.eras || []).map((e, i) => ({ ...e, src: i, t0: parse(e.start).t, t1: endOf(e.end) })).sort((a, b) => a.t0 - b.t0);
  eras.forEach((e, i) => { e.idx = i; });
  const events = (m.events || []).map((e, src) => { const a = parse(e.date), span = e.end != null && e.end !== '', b = span ? parse(e.end) : null;
    return { ...e, src, t: a.t, prec: a.prec, span, te: b ? b.t : null, endPrec: b ? b.prec : null, t1: span ? endOf(e.end) : null, laneIdx: laneIdx[e.lane] ?? -1 }; });
  events.sort((a, b) => a.t - b.t || a.src - b.src);
  const byId = {};
  events.forEach((e, i) => { e.i = i; const r = eras.find(x => e.t >= x.t0 - 1e-9 && e.t < x.t1 - 1e-9); e.era = r ? r.id : null; if (e.id != null) byId[e.id] = i; });
  events.forEach(e => { e.next = (e.ledTo || []).map(id => byId[id]).filter(j => j != null); e.prev = []; });
  events.forEach(e => e.next.forEach(j => events[j].prev.push(e.i)));
  const ts = [...events.map(e => e.t), ...events.map(e => e.t1).filter(v => v != null), ...eras.flatMap(e => [e.t0, e.t1])];
  let d0 = ts.length ? Math.min(...ts) : 0, d1 = ts.length ? Math.max(...ts) : 1;
  if (m.domain){ d0 = parse(m.domain[0]).t; d1 = endOf(m.domain[1]); }
  if (!(d1 > d0)) d1 = d0 + 1;
  return { _tl: true, lanes, laneIdx, eras, events, byId, domain: [d0, d1], src: m };
}

/* audit(model) -> { ok, n, sortedInput, firstUnsorted, unknownLane[], noEra[], badSpan[], crossEra[], badLink[], eraOverlap[], eraGap[], dupId[] }
   For the validation table: the source order is by date, every span ends after it starts and inside its era, every
   event has a known lane and an era, "led to" points at a later event, eras neither overlap nor leave gaps. */
function audit(m){
  const D = prepare(m), raw = m.events || [], nm = e => e.id ?? ('#' + (e.src + 1));
  const o = { n: D.events.length, sortedInput: true, firstUnsorted: null, unknownLane: [], noEra: [], badSpan: [], crossEra: [], badLink: [], eraOverlap: [], eraGap: [], dupId: [] };
  for (let i = 1; i < raw.length; i++) if (parse(raw[i].date).t < parse(raw[i - 1].date).t - 1e-12){ o.sortedInput = false; o.firstUnsorted = raw[i].id ?? '#' + (i + 1); break; }
  const seen = new Set(); raw.forEach(e => { if (e.id == null) return; if (seen.has(e.id)) o.dupId.push(e.id); seen.add(e.id); });
  for (const e of D.events){
    if (e.laneIdx < 0) o.unknownLane.push(nm(e));
    if (!e.era) o.noEra.push(nm(e));
    if (e.span && !(e.t1 > e.t)) o.badSpan.push(nm(e));
    if (e.span && e.era){ const r = D.eras.find(x => x.id === e.era); if (e.t1 > r.t1 + 1e-9) o.crossEra.push(nm(e)); }
    for (const id of e.ledTo || []){ const j = D.byId[id]; if (j == null) o.badLink.push(`${nm(e)} → ${id} (unknown)`); else if (D.events[j].t < e.t) o.badLink.push(`${nm(e)} → ${id} (earlier)`); }
  }
  for (let i = 1; i < D.eras.length; i++){ const a = D.eras[i - 1], b = D.eras[i];
    if (b.t0 < a.t1 - 1e-9) o.eraOverlap.push(`${a.id}/${b.id}`); else if (b.t0 > a.t1 + 1e-9) o.eraGap.push(`${a.id}/${b.id}`); }
  o.ok = o.sortedInput && !['unknownLane', 'noEra', 'badSpan', 'crossEra', 'badLink', 'eraOverlap', 'dupId'].some(k => o[k].length);
  return o;
}
const keyFn = by => typeof by === 'function' ? by : by === 'year' ? (e => Math.floor(e.t)) : (e => e[by]);
// count(model|D, by = 'era' | 'lane' | 'year' | e => key, filter?) -> { key: n }
function count(m, by = 'era', filter){ const D = prepare(m), k = keyFn(by), o = {};
  for (const e of D.events) if (!filter || filter(e)){ const v = k(e); o[v] = (o[v] || 0) + 1; } return o; }
// matrix(model|D, filter?) -> { eraId: { laneId: n, total } } (every era and lane present, zeros included)
function matrix(m, filter){ const D = prepare(m), o = {};
  for (const r of D.eras){ o[r.id] = { total: 0 }; for (const l of D.lanes) o[r.id][l.id] = 0; }
  for (const e of D.events) if ((!filter || filter(e)) && o[e.era] && e.lane in o[e.era]){ o[e.era][e.lane]++; o[e.era].total++; }
  return o; }
// visible(opts) -> predicate for { hidden: [laneId], only: eraId | null }
const visible = (o = {}) => { const h = new Set(o.hidden || []); return e => !h.has(e.lane) && (!o.only || e.era === o.only); };
// step(D, i, dir, pred): the next event after i in date order (dir +1 / −1) that passes pred; stays at i at either end.
// step(D, i, 0, pred): i itself if it passes, else the nearest that does (later first).
function step(m, i, dir, pred = () => true){ const D = prepare(m), E = D.events, n = E.length; if (!n) return -1;
  i = Math.max(0, Math.min(n - 1, Math.round(i)));
  if (!dir){ if (pred(E[i])) return i; for (let k = 1; k < n; k++){ if (i + k < n && pred(E[i + k])) return i + k; if (i - k >= 0 && pred(E[i - k])) return i - k; } return i; }
  for (let j = i + dir; j >= 0 && j < n; j += dir) if (pred(E[j])) return j;
  return i; }

// fit text into maxW px (12 px system font), with an ellipsis; '' when not even one letter fits
function fit(s, maxW, px = 12, w = ''){
  s = String(s ?? ''); if (!IE.textWidth) return s; if (IE.textWidth(s, px, w) <= maxW) return s;
  let lo = 0, hi = s.length; while (lo < hi){ const mid = (lo + hi + 1) >> 1; if (IE.textWidth(s.slice(0, mid).trimEnd() + '…', px, w) <= maxW) lo = mid; else hi = mid - 1; }
  return lo < 2 ? '' : s.slice(0, lo).trimEnd() + '…';
}
// year/quarter/month ticks for [v0, v1] at ≥ minPx spacing
function timeTicks(v0, v1, px, minPx = 48){
  const ppy = px / (v1 - v0), out = [];
  if (ppy * 0.25 >= minPx){
    const stepM = ppy / 12 >= minPx ? 1 : 3;
    for (let y = Math.floor(v0); y <= Math.ceil(v1); y++) for (let mo = 0; mo < 12; mo += stepM){ const t = dec(y, mo, 1); if (t >= v0 - 1e-9 && t <= v1 + 1e-9) out.push({ t, label: mo ? MON[mo] : String(y), major: !mo }); }
    return out;
  }
  const st = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].find(s => s * ppy >= minPx) || 1000;
  for (let y = Math.ceil(v0 / st) * st; y <= v1 + 1e-9; y += st) out.push({ t: y, label: String(y), major: true });
  return out;
}

/* ============================================================== the view
   tl = IE.timeline(host, spec); tl.set(patch)
   spec: { data: model | prepare(model), title, summary,
           hidden: [laneId], only: eraId | null, density: false, selected: event index | -1,
           maxRows: 3, rowH: 20, overview: true, densityStep: 'auto' | 1 | 0.25,
           onPick(i), onEra(eraId), onView([t0, t1]) }
   Patching only `selected` updates the cursor, highlight and links in place; anything else rebuilds. A selected event
   outside the zoom window pans the window to it. Changing `only` zooms to that era (or back to everything). */
function view(host, spec){
  host.classList.add('ie-tl');
  const main = IE.svg('svg', { class: 'ie-chart tl-main', role: 'group' }, host);   // group, not img: it holds focusable events
  const title = IE.svg('title', {}, main), base = IE.svg('g', {}, main), over = IE.svg('g', { class: 'tl-over' }, main);
  const ov = IE.svg('svg', { class: 'ie-chart tl-ov', role: 'img' }, host), ovTitle = IE.svg('title', {}, ov), ovBase = IE.svg('g', {}, ov), ovTop = IE.svg('g', {}, ov);
  let S = null, D = null, geo = null, vw = null, lastW = -1, lastOnly, els = {}, eraEls = [], ticks = [], brush = null, ovCur = null;
  const tl = { el: main, overview: ov };
  const pred = () => visible(S);
  const defView = () => { const [d0, d1] = D.domain; const r = S.only && D.eras.find(e => e.id === S.only);
    if (!r) return [d0, d1]; const pad = (r.t1 - r.t0) * 0.03; return [Math.max(d0, r.t0 - pad), Math.min(d1, r.t1 + pad)]; };
  const clampView = v => { const [d0, d1] = D.domain, minW = Math.min(d1 - d0, S.minSpan || 0.25); let [a, b] = v;
    if (b - a < minW){ const c = (a + b) / 2; a = c - minW / 2; b = c + minW / 2; }
    if (b - a > d1 - d0){ a = d0; b = d1; } if (a < d0){ b += d0 - a; a = d0; } if (b > d1){ a -= b - d1; b = d1; } return [a, b]; };

  const build = () => {
    const W = Math.max(300, host.clientWidth || 800); lastW = host.clientWidth;
    const vis = pred(), narrow = W < 560, rowH = S.rowH || 20, maxRows = S.maxRows || 3;
    const lanes = D.lanes.filter(l => !(S.hidden || []).includes(l.id));
    const nIn = l => D.events.filter(e => e.lane === l.id && vis(e)).length;
    const gut = narrow ? 0 : Math.min(Math.round(W * 0.22), 30 + Math.max(56, ...D.lanes.map(l => IE.textWidth(l.label, 12, '600'))));
    const x0 = gut + 10, x1 = W - 12;
    vw = clampView(vw || defView());
    const [v0, v1] = vw, X = t => x0 + (t - v0) / (v1 - v0) * (x1 - x0);
    const eraH = 24, axH = 22, top = eraH + axH;
    base.replaceChildren(); els = {}; eraEls = []; ticks = [];
    const gBg = IE.svg('g', {}, base), gAx = IE.svg('g', {}, base), gLane = IE.svg('g', {}, base), gEv = IE.svg('g', {}, base);
    // lanes and their events (labels packed into rows: right of the marker, else left, else hidden)
    let y = top + 4, nHidden = 0, nOff = 0;
    const laneGeo = [];
    for (const l of lanes){
      const col = IE.cssColor(l.color), hdr = narrow ? 17 : 0, mine = D.events.filter(e => e.lane === l.id && vis(e));
      const inView = mine.filter(e => (e.span ? e.t1 : e.t) >= v0 - 1e-9 && e.t <= v1 + 1e-9); nOff += mine.length - inView.length;
      let rows = 1, items = [];
      if (S.density){ rows = 0; }
      else {
        items = inView.map(e => { const a = Math.max(x0, X(e.t)), b = e.span ? Math.min(x1, X(e.t1)) : a;
          const txt = fit(e.short || e.title, Math.min(220, (x1 - x0) * 0.6)), w = txt ? IE.textWidth(txt, 12) : 0, c = [];
          if (txt){ if (e.span){ if (w + 12 <= b - a) c.push({ a: a - 1, b: b + 1, tx: a + 6, anchor: 'start' });   // inside the bar, else after it, else before it
              else { if (b + 6 + w <= x1) c.push({ a: a - 1, b: b + 6 + w, tx: b + 6, anchor: 'start' }); if (a - 6 - w >= x0) c.push({ a: a - 6 - w, b: b + 1, tx: a - 6, anchor: 'end' }); } }
            else { if (a + 9 + w <= x1) c.push({ a: a - 6, b: a + 9 + w, tx: a + 9, anchor: 'start' }); if (a - 9 - w >= x0) c.push({ a: a - 9 - w, b: a + 6, tx: a - 9, anchor: 'end' }); } }
          return { e, a, b, txt, c, ma: a - 6, mb: Math.max(a, b) + 6 }; }).sort((p, q) => p.a - q.a || p.e.i - q.e.i);
        const end = [], last = [];   // per row: right edge so far, and the item that set it
        for (const it of items){
          let done = false;
          for (let r = 0; r < maxRows && !done; r++) for (const c of it.c){ if ((end[r] ?? -1e9) <= c.a - 4){ it.row = r; it.lab = c; end[r] = c.b; last[r] = it; done = true; break; } }
          if (done) continue;
          // no room for the label: the marker alone goes to the first row with room, else the row that frees up first;
          // a label it would cover is hidden instead (the card shows it), so markers never sit on text
          let r = -1; for (let k = 0; k < maxRows; k++) if ((end[k] ?? -1e9) <= it.ma){ r = k; break; }
          if (r < 0){ r = 0; for (let k = 1; k < end.length; k++) if (end[k] < end[r]) r = k;
            const q = last[r]; if (q && q.lab && q.lab.b > it.ma){ q.lab = null; end[r] = q.mb; nHidden++; } }
          it.row = r; it.lab = null; end[r] = Math.max(end[r] ?? -1e9, it.mb); last[r] = it; nHidden++;
        }
        rows = Math.max(1, end.length);
      }
      const h = hdr + 8 + (S.density ? 44 : rows * rowH);
      laneGeo.push({ l, y, h, hdr, items, col, n: nIn(l), mine });
      y += h;
    }
    const H = Math.max(y + 4, top + 60);
    main.setAttribute('viewBox', `0 0 ${W} ${H}`); main.setAttribute('width', W); main.setAttribute('height', H);
    // era bands (top row, clickable) and faint era shading behind the lanes
    D.eras.forEach((r, k) => { if (r.t1 <= v0 || r.t0 >= v1) return;
      const a = Math.max(x0, X(r.t0)), b = Math.min(x1, X(r.t1)), alt = k % 2 ? ' alt' : '';
      IE.svg('rect', { class: 'tl-eraBg' + alt, x: a, y: top, width: Math.max(0, b - a), height: H - top }, gBg);
      if (X(r.t0) > x0 + 1) IE.svg('line', { class: 'tl-eraEdge', x1: X(r.t0), x2: X(r.t0), y1: top, y2: H - 2 }, gBg);
      const g = IE.svg('g', { class: 'tl-era' + alt + (S.only && S.only !== r.id ? ' ghost' : ''), 'data-pick': 'era:' + r.id, tabindex: 0, role: 'button',
        'aria-label': `Era: ${r.label}, ${fmtT(r.t0, 'y')} to ${fmtT(r.t1 - 1e-6, 'y')}` }, gAx);
      IE.svg('rect', { x: a + 1, y: 2, width: Math.max(0, b - a - 2), height: eraH - 4, rx: 4 }, g);
      const txt = [r.label, r.short].filter(Boolean).map(s => fit(s, b - a - 12, 11.5, '600')).find(s => s && !s.endsWith('…')) || fit(r.short || r.label, b - a - 12, 11.5, '600');
      if (txt) IE.svg('text', { class: 'lbl', x: (a + b) / 2, y: eraH / 2 + 4, 'text-anchor': 'middle', text: txt }, g);
      IE.svg('title', { text: `${r.label} (${fmtT(r.t0, 'y')}–${fmtT(r.t1 - 1e-6, 'y')})` }, g);
      eraEls.push({ id: r.id, g });
    });
    // time axis
    for (const tk of timeTicks(v0, v1, x1 - x0, narrow ? 44 : 56)){ const x = X(tk.t);
      IE.svg('line', { class: tk.major ? 'grid' : 'grid minor', x1: x, x2: x, y1: top, y2: H - 2 }, gBg);
      const anchor = x - x0 < 20 ? 'start' : x1 - x < 20 ? 'end' : 'middle';
      ticks.push(IE.svg('text', { class: 'tick', x, y: eraH + 15, 'text-anchor': anchor, text: tk.label }, gAx)); }
    IE.svg('line', { class: 'axis', x1: x0, x2: x1, y1: top, y2: top }, gAx);
    // lanes
    const maxBin = S.density ? densityMax(laneGeo, v0, v1) : 0;
    for (const L of laneGeo){
      const { l, y: ly, h, hdr, col } = L;
      IE.svg('line', { class: 'tl-lane', x1: 0, x2: W, y1: ly + h, y2: ly + h }, gLane);
      if (narrow){ IE.svg('circle', { cx: x0 + 4, cy: ly + 9, r: 4, fill: col }, gLane);
        IE.svg('text', { class: 'lbl tl-laneLbl', x: x0 + 12, y: ly + 13, text: `${l.label} · ${L.n}` }, gLane); }
      else { const two = h >= 2 * rowH + 8, ny = two ? ly + 19 : ly + h / 2 + 4;
        IE.svg('circle', { cx: 9, cy: ny - 4, r: 4.5, fill: col }, gLane);
        IE.svg('text', { class: 'lbl tl-laneLbl', x: 19, y: ny, text: fit(l.label, gut - 22, 12, '600') }, gLane);
        if (two) IE.svg('text', { class: 'lbl tl-laneN', x: 19, y: ny + 16, text: `${L.n} event${L.n === 1 ? '' : 's'}` }, gLane); }
      if (S.density){ drawBins(gEv, L, X, v0, v1, ly + hdr + 6, 40, maxBin, x0, x1); continue; }
      for (const it of L.items){ const e = it.e, cy = ly + hdr + 4 + it.row * rowH + rowH / 2;
        const g = IE.svg('g', { class: 'tl-ev' + (e.span ? ' span' : ''), 'data-pick': 'ev:' + e.i, tabindex: 0, role: 'button', style: `--c:${col}`,
          'aria-label': `${fmtWhen(e)}, ${l.label}: ${e.title}` }, gEv);
        if (e.span){ IE.svg('rect', { class: 'mk', x: it.a, y: cy - 6, width: Math.max(4, it.b - it.a), height: 12, rx: 3 }, g); }
        else { IE.svg('circle', { class: 'hit', cx: it.a, cy, r: 10 }, g); IE.svg('circle', { class: 'mk', cx: it.a, cy, r: 5 }, g); }
        if (it.lab) IE.svg('text', { class: 'lbl', x: it.lab.tx, y: cy + 4, 'text-anchor': it.lab.anchor, text: it.txt }, g);
        IE.svg('title', { text: `${fmtWhen(e)} · ${e.title}` }, g);
        els[e.i] = { g, x: it.a, xb: it.b, cy, labelled: !!it.lab }; }
    }
    if (!lanes.length) IE.svg('text', { class: 'note lbl', x: (x0 + x1) / 2, y: top + 30, 'text-anchor': 'middle', text: 'Every lane is switched off' }, gEv);
    geo = { W, H, X, x0, x1, top, eraH, v0, v1, nHidden, nOff, narrow };
    const nVis = D.events.filter(vis).length;
    title.textContent = (S.title || 'Timeline') + `: ${nVis} events from ${fmtT(v0, 'y')} to ${fmtT(v1 - 1e-6, 'y')}` + (S.summary ? '. ' + S.summary : '') + (nHidden ? `. ${nHidden} labels hidden for space; pick an event to read it.` : '');
    main.setAttribute('aria-label', title.textContent);
    buildOverview(W, x0, x1, vis);
  };
  function densityMax(laneGeo, v0, v1){ const st = binStep(v0, v1); let mx = 1;
    for (const L of laneGeo){ const c = {}; for (const e of L.mine){ if (e.t < v0 || e.t >= v1) continue; const b = Math.floor(e.t / st + 1e-9); c[b] = (c[b] || 0) + 1; mx = Math.max(mx, c[b]); } } return mx; }
  const binStep = (v0, v1) => S.densityStep && S.densityStep !== 'auto' ? S.densityStep : v1 - v0 > 3 ? 1 : 0.25;
  function drawBins(g, L, X, v0, v1, y, h, mx, x0, x1){
    const st = binStep(v0, v1), c = {}, first = {};
    for (const e of L.mine){ const b = Math.floor(e.t / st + 1e-9); c[b] = (c[b] || 0) + 1; if (!(b in first)) first[b] = e.i; }
    for (const b in c){ const t0 = b * st, t1 = t0 + st; if (t1 <= v0 || t0 >= v1) continue;
      const a = Math.max(x0, X(t0)) + 1, w = Math.max(2, Math.min(x1, X(t1)) - a - 1), bh = Math.max(3, (h - 14) * c[b] / mx);
      const lbl = st === 1 ? String(Math.round(t0)) : fmtT(t0, 'm');
      const gg = IE.svg('g', { class: 'tl-bin', 'data-pick': `bin:${L.l.id}:${t0}`, 'data-first': first[b], tabindex: 0, role: 'button', style: `--c:${L.col}`,
        'aria-label': `${L.l.label}, ${lbl}: ${c[b]} event${c[b] === 1 ? '' : 's'}` }, g);
      IE.svg('rect', { x: a, y: y + h - bh, width: w, height: bh, rx: 2 }, gg);
      if (w >= IE.textWidth(String(c[b]), 10.5) + 2) IE.svg('text', { class: 'lbl', x: a + w / 2, y: y + h - bh - 3, 'text-anchor': 'middle', text: String(c[b]) }, gg);
      IE.svg('title', { text: `${lbl}: ${c[b]}` }, gg); }
  }
  function buildOverview(W, x0, x1, vis){
    if (S.overview === false){ ov.style.display = 'none'; return; } ov.style.display = '';
    const OH = 48, [d0, d1] = D.domain, OX = t => x0 + (t - d0) / (d1 - d0) * (x1 - x0), nl = Math.max(1, D.lanes.length), rh = 24 / nl;
    ov.setAttribute('viewBox', `0 0 ${W} ${OH}`); ov.setAttribute('width', W); ov.setAttribute('height', OH);
    ovTitle.textContent = `Overview of the whole history, ${fmtT(d0, 'y')}–${fmtT(d1 - 1e-6, 'y')}; the box is the zoom window: drag it, drag its edges, or drag a new range; click to pick the nearest event`;
    ov.setAttribute('aria-label', ovTitle.textContent);
    ovBase.replaceChildren(); ovTop.replaceChildren();
    IE.svg('rect', { x: 0, y: 0, width: W, height: OH, fill: 'transparent' }, ovBase);
    D.eras.forEach((r, k) => IE.svg('rect', { class: 'tl-ovEra' + (k % 2 ? ' alt' : ''), x: OX(r.t0), y: 2, width: Math.max(0, OX(r.t1) - OX(r.t0)), height: 28 }, ovBase));
    for (const e of D.events){ const yy = 4 + Math.max(0, e.laneIdx) * rh, a = OX(e.t), b = e.span ? OX(e.t1) : a + 2;
      IE.svg('rect', { class: 'tl-ovEv' + (vis(e) ? '' : ' off'), x: a - (e.span ? 0 : 1), y: yy, width: Math.max(2, b - a), height: Math.max(1.5, rh - 1), fill: IE.cssColor((D.lanes[e.laneIdx] || {}).color || 'muted') }, ovBase); }
    for (const tk of timeTicks(d0, d1, x1 - x0, 44)){ const x = OX(tk.t); if (!tk.major) continue;
      IE.svg('text', { class: 'tick', x, y: OH - 4, 'text-anchor': x - x0 < 20 ? 'start' : x1 - x < 20 ? 'end' : 'middle', text: tk.label }, ovBase); }
    const [v0, v1] = vw;
    brush = IE.svg('rect', { class: 'tl-brush', 'data-h': 'move', x: OX(v0), y: 1, width: Math.max(4, OX(v1) - OX(v0)), height: 30, rx: 3 }, ovTop);
    IE.svg('rect', { class: 'tl-handle', 'data-h': 'l', x: OX(v0) - 3, y: 6, width: 6, height: 20, rx: 2 }, ovTop);
    IE.svg('rect', { class: 'tl-handle', 'data-h': 'r', x: OX(v1) - 3, y: 6, width: 6, height: 20, rx: 2 }, ovTop);
    ovCur = IE.svg('line', { class: 'cursor', x1: -10, x2: -10, y1: 0, y2: 32 }, ovTop);
    ov._geo = { OX, x0, x1, d0, d1 };
  }
  // ---- selection overlay: cursor + date label (ticks under it hide), span band, highlight, led-to links
  const overlay = () => {
    over.replaceChildren(); if (!geo) return;
    const e = D.events[S.selected], ok = e && pred()(e);
    for (const k in els) els[k].g.classList.toggle('on', ok && +k === e.i);
    for (const r of eraEls) r.g.classList.toggle('on', !!(ok && r.id === e.era));
    ticks.forEach(t => t.style.visibility = '');
    if (ovCur){ const x = ok ? ov._geo.OX(e.t) : -10; ovCur.setAttribute('x1', x); ovCur.setAttribute('x2', x); }
    if (!ok) return;
    const { X, x0, x1, top, eraH, H } = geo, x = X(e.t);
    if (x < x0 - 0.5 || x > x1 + 0.5) return;
    if (e.span) IE.svg('rect', { class: 'tl-selband', x, y: top, width: Math.max(2, Math.min(x1, X(e.t1)) - x), height: H - top }, over);
    IE.svg('line', { class: 'cursor', x1: x, x2: x, y1: eraH, y2: H - 2 }, over);
    const el = els[e.i], txt = fmtWhen(e) + (el && el.labelled ? '' : ' · ' + fit(e.short || e.title, 180, 11.5, '600'));
    const w = IE.textWidth(txt, 11.5, '600') + 12, lx = IE.clamp(x - w / 2, x0 - 6, x1 - w + 6);
    const g = IE.svg('g', { class: 'tl-cur' }, over);
    IE.svg('rect', { x: lx, y: eraH + 1, width: w, height: 19, rx: 4 }, g);
    IE.svg('text', { class: 'lbl', x: lx + 6, y: eraH + 15, text: txt }, g);
    ticks.forEach(t => { const b = t.getBBox ? t.getBBox() : null; if (b && b.x < lx + w + 3 && b.x + b.width > lx - 3) t.style.visibility = 'hidden'; });
    if (el) for (const [list, cls] of [[e.next, 'tl-link'], [e.prev, 'tl-link prev']]) for (const j of list){ const o = els[j]; if (!o) continue;
      const xa = cls === 'tl-link' && e.span ? el.xb : el.x, ya = el.cy, xb = o.x, yb = o.cy, bend = Math.min(60, Math.abs(xb - xa) / 2 + 12), my = Math.min(ya, yb) - bend * 0.5;
      IE.svg('path', { class: cls, d: `M${xa},${ya}C${xa},${my} ${xb},${my} ${xb},${yb - 7}`, 'marker-end': cls === 'tl-link' ? `url(#${mk})` : null }, over); }
  };
  const mk = 'tlm' + Math.random().toString(36).slice(2, 7);
  { const defs = IE.svg('defs', {}, main), m = IE.svg('marker', { id: mk, viewBox: '0 0 8 8', refX: 6, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    IE.svg('path', { d: 'M0,0L8,4L0,8Z', class: 'tl-arrow' }, m); }

  // ---- interaction: click / Enter / Space on events, eras, bins
  const act = el => { const k = el.dataset.pick;
    if (k.startsWith('ev:')) S.onPick && S.onPick(+k.slice(3));
    else if (k.startsWith('era:')) S.onEra ? S.onEra(k.slice(4)) : S.onPick && S.onPick(step(D, D.events.findIndex(e => e.era === k.slice(4)), 0, pred()));
    else if (k.startsWith('bin:')) S.onPick && S.onPick(+el.dataset.first); };
  main.addEventListener('click', ev => { const el = ev.target.closest('[data-pick]'); if (el) act(el); });
  main.addEventListener('keydown', ev => { if (ev.key !== 'Enter' && ev.key !== ' ') return; const el = ev.target.closest('[data-pick]'); if (el){ ev.preventDefault(); act(el); } });
  // overview: drag the window, its edges, or a new range; a click picks the nearest visible event
  let drag = null;
  const tAt = ev => { const g = ov._geo, r = ov.getBoundingClientRect(), sx = (ev.clientX - r.left) * (ov.viewBox.baseVal.width / r.width || 1);
    return IE.clamp(g.d0 + (sx - g.x0) / (g.x1 - g.x0) * (g.d1 - g.d0), g.d0, g.d1); };
  ov.addEventListener('pointerdown', ev => { if (!ov._geo) return; const t = tAt(ev), full = vw[1] - vw[0] >= D.domain[1] - D.domain[0] - 1e-9;
    let h = ev.target.dataset && ev.target.dataset.h; if (h === 'move' && full) h = 'new';   // nothing zoomed yet: a drag draws a window
    drag = { mode: h || 'new', t0: t, v: [...vw], x: ev.clientX }; ov.setPointerCapture?.(ev.pointerId); ev.preventDefault(); });
  ov.addEventListener('pointermove', ev => { if (!drag) return; const t = tAt(ev), [a, b] = drag.v; let nv = null;
    if (drag.mode === 'move') nv = [a + t - drag.t0, b + t - drag.t0];
    else if (drag.mode === 'l') nv = [Math.min(t, b - 0.25), b];
    else if (drag.mode === 'r') nv = [a, Math.max(t, a + 0.25)];
    else if (Math.abs(ev.clientX - drag.x) > 4) nv = [Math.min(drag.t0, t), Math.max(drag.t0, t)];
    if (nv){ drag.moved = true; vw = clampView(nv); build(); overlay(); } });
  const endDrag = ev => { if (!drag) return; const d = drag; drag = null;
    if (!d.moved && (d.mode === 'new' || d.mode === 'move')){ const t = tAt(ev), p = pred(); let best = -1, bd = Infinity;
      D.events.forEach(e => { if (!p(e)) return; const dd = Math.abs(e.t - t); if (dd < bd){ bd = dd; best = e.i; } });
      if (best >= 0 && S.onPick) S.onPick(best); }
    else if (d.moved && S.onView) S.onView([...vw]); };
  ov.addEventListener('pointerup', endDrag); ov.addEventListener('pointercancel', () => { drag = null; });
  ov.addEventListener('dblclick', () => { vw = null; build(); overlay(); S.onView && S.onView([...vw]); });

  tl.set = patch => {
    const prev = S; S = { ...(S || {}), ...patch };
    if (!prev || 'data' in patch) D = prepare(S.data);
    if ('view' in patch) vw = patch.view ? [...patch.view] : null;
    else if (!prev || S.only !== lastOnly || 'data' in patch) vw = null;
    lastOnly = S.only;
    let structural = !prev || Object.keys(patch).some(k => k !== 'selected') || host.clientWidth !== lastW;
    const e = D.events[S.selected];
    // pan to the pick only when it (or the filter) changed, so a window the reader brushed stays put
    if (e && vw && pred()(e) && !drag && (!prev || prev.selected !== S.selected || structural)){ const [a, b] = vw, w = b - a, lo = e.t, hi = e.span ? Math.min(e.t1, lo + w * 0.9) : lo;
      if (lo < a || hi > b){ vw = clampView([lo - w * 0.15, lo + w * 0.85]); structural = true; } }
    if (structural) build();
    overlay(); return tl;
  };
  tl.reset = () => { vw = null; build(); overlay(); return tl; };
  Object.defineProperty(tl, 'view', { get: () => vw && [...vw] });
  Object.defineProperty(tl, 'data', { get: () => D });
  tl.labelHidden = i => !(els[i] && els[i].labelled);   // true when the event shows no label at this zoom (or is off-screen)
  tl.stats = () => geo && { hiddenLabels: geo.nHidden, offscreen: geo.nOff, view: [...vw] };
  new ResizeObserver(() => { if (S && host.clientWidth && host.clientWidth !== lastW){ build(); overlay(); } }).observe(host);
  tl.set(spec);
  return tl;
}

/* counts(host, spec): stacked bars of events per era, split by lane, as a linked view.
   spec: { data, hidden, only, highlight: eraId, onPick(eraId), title }. Each era row is a keyboard button (data-pick "cnt:<era>"). */
function counts(host, spec){
  const leg = document.createElement('div'); leg.className = 'legend tl-legend'; host.appendChild(leg);
  const root = IE.svg('svg', { class: 'ie-chart tl-counts', role: 'group' }, host), title = IE.svg('title', {}, root), g = IE.svg('g', {}, root);
  let S = null; const ch = { el: root };
  const build = () => {
    const D = prepare(S.data), hid = new Set(S.hidden || []), lanes = D.lanes.filter(l => !hid.has(l.id)), M = matrix(D, e => !hid.has(e.lane));
    const W = Math.max(280, host.clientWidth || 400), rowH = 28, H = D.eras.length * rowH + 8;
    const name = r => { const max = W * 0.38; return IE.textWidth(r.label, 12) <= max ? r.label : fit(r.short || r.label, max, 12); };
    const labW = Math.min(W * 0.38, 12 + Math.max(...D.eras.map(r => IE.textWidth(name(r), 12)))), valW = 34, pw = Math.max(40, W - labW - valW - 6);
    const mx = Math.max(1, ...D.eras.map(r => M[r.id].total)), X = v => labW + v / mx * pw;
    root.setAttribute('viewBox', `0 0 ${W} ${H}`); root.setAttribute('width', W); root.setAttribute('height', H);
    title.textContent = (S.title || 'Events per era') + ': ' + D.eras.map(r => `${r.label} ${M[r.id].total}`).join(', ');
    root.setAttribute('aria-label', title.textContent);
    leg.innerHTML = D.lanes.map(l => `<span class="${hid.has(l.id) ? 'off' : ''}"><i style="background:${IE.cssColor(l.color)};height:9px;width:9px;border-radius:50%"></i>${esc(l.label)}</span>`).join('');
    g.replaceChildren();
    D.eras.forEach((r, k) => { const y = 4 + k * rowH, m = M[r.id];
      const gg = IE.svg('g', { class: 'tl-cnt' + (S.highlight === r.id ? ' on' : '') + (S.only && S.only !== r.id ? ' ghost' : ''), 'data-pick': 'cnt:' + r.id, tabindex: 0, role: 'button',
        'aria-label': `${r.label}: ${m.total} events (${lanes.map(l => `${l.label} ${m[l.id]}`).join(', ')})` }, g);
      IE.svg('rect', { class: 'tl-cntBg', x: 0, y, width: W, height: rowH }, gg);
      IE.svg('text', { class: 'lbl', x: labW - 8, y: y + rowH / 2 + 4, 'text-anchor': 'end', text: name(r) }, gg);
      let v = 0; for (const l of lanes){ const n = m[l.id]; if (!n) continue;
        IE.svg('rect', { x: X(v), y: y + 5, width: Math.max(1, X(v + n) - X(v) - 1), height: rowH - 10, rx: 2, fill: IE.cssColor(l.color) }, gg); v += n; }
      IE.svg('text', { class: 'lbl end', x: X(v) + 6, y: y + rowH / 2 + 4, text: String(m.total) }, gg);
      IE.svg('title', { text: `${r.label}: ${lanes.map(l => `${l.label} ${m[l.id]}`).join(' · ')}` }, gg);
    });
  };
  const act = el => S.onPick && S.onPick(el.dataset.pick.slice(4));
  root.addEventListener('click', ev => { const el = ev.target.closest('[data-pick]'); if (el) act(el); });
  root.addEventListener('keydown', ev => { if (ev.key !== 'Enter' && ev.key !== ' ') return; const el = ev.target.closest('[data-pick]'); if (el){ ev.preventDefault(); act(el); } });
  let lastW = 0;
  ch.set = patch => { S = { ...(S || {}), ...patch }; lastW = host.clientWidth; build(); return ch; };
  new ResizeObserver(() => { if (S && host.clientWidth !== lastW){ lastW = host.clientWidth; build(); } }).observe(host);
  return ch.set(spec);
}

/* card(data, i, o) -> HTML for the picked event: date, lane, era, title, text, source citation, and "led to" /
   "followed from" jump buttons (data-set="sel=<index>", handled by IE.app). o: { hiddenLabel: bool, empty: 'html' } */
function card(m, i, o = {}){
  const D = prepare(m), e = D.events[i];
  if (!e) return o.empty || '<p class="sub">Pick an event in the timeline to read it here.</p>';
  const lane = D.lanes[e.laneIdx] || { label: e.lane, color: 'muted' }, era = D.eras.find(r => r.id === e.era);
  const jump = j => { const f = D.events[j]; return `<button type="button" class="btn tl-jump" data-set="sel=${j}">${esc(f.short || f.title)} · ${fmtWhen(f)}</button>`; };
  const cite = e.source && IE.cite ? IE.cite(e.source) : '';
  return `<div class="tl-card"><p class="tl-when"><b>${fmtWhen(e)}</b> <span class="tl-chip" style="--c:${IE.cssColor ? IE.cssColor(lane.color) : lane.color}"><i></i>${esc(lane.label)}</span>` +
    (era ? ` <span class="badge">${esc(era.label)}</span>` : ' <span class="badge">no era</span>') + `</p>` +
    `<p class="tl-title">${esc(e.title)}${cite}</p>` + (e.text ? `<p>${esc(e.text)}</p>` : '') +
    (o.hiddenLabel ? '<p class="sub">Its label is hidden in the timeline at this zoom; zoom in with the overview strip to see it in place.</p>' : '') +
    (e.prev.length ? `<p class="sub">Followed from: ${e.prev.map(jump).join(' ')}</p>` : '') +
    (e.next.length ? `<p class="sub">Led to: ${e.next.map(jump).join(' ')}</p>` : '') + `</div>`;
}

const TL = view;
Object.assign(TL, { parse, endOf, fmtT, fmtWhen, prepare, audit, count, matrix, visible, step, counts, card, fit, MON });
IE.timeline = TL;
if (typeof module === 'object' && module.exports) module.exports = TL;
})(typeof window !== 'undefined' ? window : globalThis);
