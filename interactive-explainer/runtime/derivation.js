/* interactive-explainer runtime: derivation.js (IE.derivation, IE.mml). A stepper over the lines of a derivation:
   each line is MathML (rendered natively, no library), a plain-words gloss and the rule used; terms are coloured the
   same on every line and the ones that changed from the previous line are highlighted; each line is checked
   numerically at the current parameters (both sides evaluated, residual shown); a linked IE.lineChart shows the
   quantity the current line describes, with exact vs approximate curves and the error shaded. Needs core.js.
   Guide: shapes/derivation.md. Pages also include the derivation.css block (style tag, data-ie "derivation"). */
(function(){
'use strict';
const IE = window.IE;
if (!IE) throw new Error('derivation.js needs core.js first');

// ---------------------------------------------------------------- MathML builder (strings)
// Tokens: numbers -> <mn>, one letter -> italic <mi> (mathvariant="normal" + CSS italic: some headless Chromium builds
// draw single-letter <mi> as an empty box), one symbol -> <mo>, longer names (exp, Pr) -> upright <mi>, '<…' kept as is.
const tok = a => {
  if (a == null || a === false) return '';
  if (Array.isArray(a)) return a.map(tok).join('');
  if (typeof a === 'number') return `<mn>${a}</mn>`;
  a = String(a);
  if (a.startsWith('<')) return a;
  if (/^[0-9]+(\.[0-9]+)?$/.test(a)) return `<mn>${a}</mn>`;
  if (/^[A-Za-zͰ-Ͽ]$/.test(a)) return `<mi mathvariant="normal" class="mi">${a}</mi>`;
  if (a.length === 1 || /^(⇒|⇔|≈|…|⋯|∞)$/.test(a)) return `<mo>${IE.esc(a)}</mo>`;
  return `<mi>${IE.esc(a)}</mi>`;
};
const cat = k => k.map(tok).join('');
const row = (...k) => `<mrow>${cat(k)}</mrow>`;
const M = IE.mml = {
  tok, row,
  math: (...k) => `<math displaystyle="true">${cat(k)}</math>`,        // a derivation line (display-size sums and fractions, left-aligned)
  inline: (...k) => `<math>${cat(k)}</math>`,                         // inside prose
  v: s => `<mi mathvariant="normal" class="mi">${IE.esc(s)}</mi>`,     // italic variable, any length
  n: s => `<mn>${s}</mn>`, o: s => `<mo>${IE.esc(s)}</mo>`, text: s => `<mtext>${IE.esc(s)}</mtext>`,
  sp: (em = 0.4) => `<mspace width="${em}em"></mspace>`,
  term: (name, ...k) => `<mrow data-term="${name}">${cat(k)}</mrow>`,  // coloured by term, highlighted when it changes
  sub: (b, s) => `<msub>${row(b)}${row(s)}</msub>`,
  sup: (b, s) => `<msup>${row(b)}${row(s)}</msup>`,
  subsup: (b, s, p) => `<msubsup>${row(b)}${row(s)}${row(p)}</msubsup>`,
  frac: (a, b) => `<mfrac>${row(a)}${row(b)}</mfrac>`,
  paren: (...k) => `<mrow><mo>(</mo>${cat(k)}<mo>)</mo></mrow>`,
  sqrt: (...k) => `<msqrt>${cat(k)}</msqrt>`,
  sum: (lo, hi, ...body) => `<mrow><munderover><mo>∑</mo>${row(lo)}${row(hi)}</munderover>${cat(body)}</mrow>`,
  cases: rows => `<mrow><mo>{</mo><mtable columnalign="left">${rows.map(r => `<mtr>${r.map(c => `<mtd>${row(c)}</mtd>`).join('')}</mtr>`).join('')}</mtable></mrow>`,
};

// ---------------------------------------------------------------- number formatting for checks
const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
// sig significant digits; plain decimals between 0.001 and 100 000, else m×10ⁿ
const sci = (v, sig = 4) => {
  if (!isFinite(v)) return IE.fmt.num(v); if (v === 0) return '0';
  const a = Math.abs(v), e = Math.floor(Math.log10(a));
  if (a >= 1e-3 && a < 1e5) return IE.fmt.num(v, Math.max(0, sig - 1 - e));
  const [m, ex] = v.toExponential(Math.max(0, sig - 1)).split('e'), ms = IE.fmt.num(+m, Math.max(0, sig - 1)).replace(/([.,]\d*?)0+$/, '$1').replace(/[.,]$/, '');
  return (ms === '1' ? '' : ms + '×') + '10' + String(+ex).split('').map(c => SUP[c]).join('');
};
// log y-axis spanning the data, at most ~6 decade ticks
const logY = (vals, o = {}) => {
  const f = vals.filter(v => isFinite(v) && v > 0); if (!f.length) return { min: 1e-3, max: 1, log: true, fmt: v => sci(v, 1) };
  let lo = Math.floor(Math.log10(Math.min(...f))), hi = Math.ceil(Math.log10(Math.max(...f)));
  if (o.floor != null) lo = Math.max(lo, Math.floor(Math.log10(o.floor))); if (hi <= lo) hi = lo + 1;
  const st = Math.max(1, Math.ceil((hi - lo) / 6)), ticks = []; for (let e = hi; e >= lo; e -= st) ticks.unshift(Math.pow(10, e));
  return { min: Math.pow(10, lo), max: Math.pow(10, hi), log: true, ticks, fmt: v => sci(v, 1), label: o.label };
};
const linY = (vals, o = {}) => {
  const f = vals.filter(isFinite); let lo = Math.min(0, ...f), hi = Math.max(...f, lo + 1e-9);
  const st = IE.niceStep(hi - lo, 4); lo = Math.floor(lo / st + 1e-9) * st; hi = Math.ceil(hi / st - 1e-9) * st;
  return { min: lo, max: hi, label: o.label, fmt: o.fmt };
};

// ---------------------------------------------------------------- the stepper
/* IE.derivation(host, {
     lines: [{ math, gloss, rule, part, approx, tol, check: P => [lhs, rhs] | { lhs, rhs, scale, note }, plot: P => plotSpec }],
     terms: { name: { color: 's1', label } },     colour per <mrow data-term="name"> on every line
     plotHost, plotHeight, onPick: i => …, tol (exact lines, relative, default 1e-9), approxTol (default 0.1),
     breakTol (default 0.1: "where the approximation breaks"), paramText: P => 'q = 0.1, z = 5' })
   plotSpec = { title, summary, x, y?, exact: { label, points }, approx?: { label, points }, series?, marks?, cursor?,
                hlines?, notes?, bands?, onPick?: x => … }   (exact and approx on the same x grid)
   -> { el, chart, set({ sel, P, breaks }), results(P), summary(P), checkHtml(i, P), plotNote } */
IE.derivation = (host, cfg) => {
  if (typeof host === 'string') host = IE.$(host);
  const lines = cfg.lines, terms = cfg.terms || {}, TOL = cfg.tol ?? 1e-9, ATOL = cfg.approxTol ?? 0.1, BTOL = cfg.breakTol ?? 0.1;
  const D = { lines, chart: null };
  // term legend
  const names = Object.keys(terms);
  if (names.length && cfg.legend !== false) host.insertAdjacentHTML('beforeend', `<div class="ie-terms" aria-label="Colour key for the terms">${names.map(n =>
    `<span><i style="background:${IE.cssColor(terms[n].color)}"></i>${terms[n].label || n}</span>`).join('')}</div>`);
  const ol = document.createElement('ol'); ol.className = 'ie-deriv'; ol.setAttribute('aria-label', `Derivation in ${lines.length} lines; Enter on a line selects it`);
  host.appendChild(ol); D.el = ol;
  const items = lines.map((L, i) => {
    if (L.part) ol.insertAdjacentHTML('beforeend', `<li class="part" role="presentation">${L.part}</li>`);
    const li = document.createElement('li'); li.className = 'dl' + (L.approx ? ' apx' : '');
    li.dataset.pick = 'line-' + (i + 1); li.tabIndex = 0; li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `Line ${i + 1}${L.approx ? ' (approximation)' : ''}: ${(L.rule || '').replace(/<[^>]+>/g, '')}`);
    li.innerHTML = `<span class="dn">${i + 1}</span><div class="dm">${L.math}</div><span class="dc" aria-live="off"></span>` +
      `<div class="dr">${L.approx ? '<span class="apxtag">approximation</span> ' : ''}${L.rule || ''}</div><div class="dg">${L.gloss || ''}</div>`;
    const pick = () => cfg.onPick && cfg.onPick(i);
    li.addEventListener('click', pick);
    li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pick(); } });
    ol.appendChild(li); return li;
  });
  // colour each term; mark the terms that differ from the same term on the previous line (or are new)
  const norm = el => el.innerHTML.replace(/\s+/g, '');
  items.forEach((li, i) => li.querySelectorAll('[data-term]').forEach(el => {
    const t = terms[el.dataset.term]; if (t && t.color) el.style.color = IE.cssColor(t.color);
    if (i === 0) return;
    const prev = [...items[i - 1].querySelectorAll('[data-term]')].filter(p => p.dataset.term === el.dataset.term);
    if (!prev.some(p => norm(p) === norm(el))) el.classList.add('chg');
  }));

  // ---- numeric checks
  const evalLine = (L, P) => {
    if (!L.check) return null;
    let o; try { o = L.check(P); } catch (e) { return { err: e.message, ok: false }; }
    if (Array.isArray(o)) o = { lhs: o[0], rhs: o[1] };
    const diff = Math.abs(o.lhs - o.rhs), scale = o.scale ?? Math.max(Math.abs(o.lhs), Math.abs(o.rhs)), rel = scale ? diff / scale : diff;
    const lim = L.tol ?? (L.approx ? ATOL : TOL);
    return { ...o, diff, rel, lim, approx: !!L.approx, ok: isFinite(rel) && rel <= lim };
  };
  D.results = P => lines.map(L => evalLine(L, P));
  D.summary = P => { const r = D.results(P).filter(Boolean); return { pass: r.filter(x => x.ok).length, total: r.length, exactPass: r.filter(x => !x.approx && x.ok).length, exactTotal: r.filter(x => !x.approx).length }; };
  const badge = r => !r ? ['', '', 'no check'] : r.err ? ['–', 'bad', 'check failed: ' + r.err] :
    r.approx ? [(r.ok ? '≈ ' : '⚠ ') + IE.fmt.pct(r.rel, r.rel < 0.1 ? 1 : 0), r.ok ? 'ok' : 'bad', `approximation off by ${IE.fmt.pct(r.rel, 1)} (within ${IE.fmt.pct(r.lim)} counts as close)`] :
    [(r.ok ? '✓ ' : '✗ ') + sci(r.rel, 1), r.ok ? 'ok' : 'bad', `both sides agree to a relative difference of ${sci(r.rel, 2)}`];
  D.checkHtml = (i, P) => {
    const L = lines[i], r = evalLine(L, P); if (!r) return 'This line has no numeric check.';
    if (r.err) return `Check failed: ${IE.esc(r.err)}`;
    const at = cfg.paramText ? ` at ${cfg.paramText(P)}` : '';
    const sides = `left side <b>${sci(r.lhs, 7)}</b>, right side <b>${sci(r.rhs, 7)}</b>`;
    return r.approx
      ? `Check${at}${r.note ? ' (' + r.note + ')' : ''}: exact ${sci(r.lhs, 5)}, approximation ${sci(r.rhs, 5)}, off by <b>${IE.fmt.pct(r.rel, 1)}</b> ${r.ok ? '<span class="ok">≈ close</span>' : `<span class="fail">⚠ more than ${IE.fmt.pct(r.lim)}</span>`}`
      : `Check${at}${r.note ? ' (' + r.note + ')' : ''}: ${sides}, relative difference ${sci(r.rel, 2)} ${r.ok ? '<span class="ok" aria-label="passes">✓</span>' : '<span class="fail" aria-label="fails">✗</span>'}`;
  };

  // ---- linked plot
  let plotT = null, plotN = null, cur = -1, resKey = '', plotKey = '', curPlot = null, fillG = null;
  if (cfg.plotHost){
    const ph = typeof cfg.plotHost === 'string' ? IE.$(cfg.plotHost) : cfg.plotHost;
    plotT = document.createElement('p'); plotT.className = 'sub ie-dplot-t'; ph.appendChild(plotT);
    const ch = document.createElement('div'); ph.appendChild(ch);
    plotN = document.createElement('p'); plotN.className = 'sub ie-dplot-n'; ph.appendChild(plotN);
    D.chart = IE.lineChart(ch, { title: 'Plot', x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, series: [], height: cfg.plotHeight || 280,
      onPick: x => curPlot && curPlot.onPick && curPlot.onPick(x) });
    // error shading between the exact and approximate curves: drawn under the curves after every (re)build.
    // (core lineChart has no fill-between; this hooks chart.set, which its resize and theme handlers also call)
    const set0 = D.chart.set;
    D.chart.set = patch => { set0(patch); drawFill(); return D.chart; };
    fillG = IE.svg('g', { class: 'ie-dfill' }); D.chart.el.insertBefore(fillG, D.chart.el.children[1]);
  }
  function drawFill(){
    if (!fillG) return; fillG.replaceChildren(); const g = D.chart.el._geo;
    if (!curPlot || !curPlot.exact || !curPlot.approx || !g) return;
    const ly = D.chart.spec.y.log, ok = v => isFinite(v) && (!ly || v > 0);
    const e = curPlot.exact.points, a = curPlot.approx.points, top = [], bot = [];
    for (let k = 0; k < Math.min(e.length, a.length); k++) if (ok(e[k][1]) && ok(a[k][1])){ top.push([g.X(e[k][0]), g.Y(e[k][1])]); bot.push([g.X(a[k][0]), g.Y(a[k][1])]); }
    if (top.length < 2) return;
    const id = 'dc' + Math.random().toString(36).slice(2, 8), cp = IE.svg('clipPath', { id }, fillG);
    IE.svg('rect', { x: g.pad.l, y: g.pad.t, width: g.pw, height: g.ph }, cp);
    IE.svg('path', { d: IE.pathD(top) + 'L' + IE.pathD(bot.reverse()).slice(1) + 'Z', fill: IE.cssColor(curPlot.approx.color || 's2'), opacity: 0.2, 'clip-path': `url(#${id})` }, fillG);
  }
  // x-ranges where |approx − exact| > tol·|exact| (each point owns the half-gaps to its neighbours)
  const breakRanges = (e, a, tol, x0, x1) => {
    const out = []; let st = null;
    const bad = k => { const ev = e[k][1], av = a[k][1]; return isFinite(ev) && isFinite(av) && Math.abs(av - ev) > tol * Math.abs(ev); };
    const lo = k => k === 0 ? x0 : (e[k - 1][0] + e[k][0]) / 2, hi = k => k === e.length - 1 ? x1 : (e[k][0] + e[k + 1][0]) / 2;
    const n = Math.min(e.length, a.length), push = (s, t) => out.push([lo(s), hi(t), e[s][0], e[t][0]]);   // band edges, first and last bad x
    for (let k = 0; k < n; k++){ if (bad(k)){ if (st === null) st = k; } else if (st !== null){ push(st, k - 1); st = null; } }
    if (st !== null) push(st, n - 1);
    return out;
  };
  function drawPlot(L, P, breaks){
    const s = L.plot ? L.plot(P) : null; curPlot = s;
    if (!s){ plotT.textContent = 'This line has no plot.'; plotN.textContent = ''; return; }
    const ser = [];   // exact, then approximate, then any extra series on top
    if (s.exact) ser.push({ id: 'exact', label: s.exact.label, color: s.exact.color || 'total', points: s.exact.points, width: 2.6, legend: !!s.approx });
    if (s.approx) ser.push({ id: 'approx', label: s.approx.label, color: s.approx.color || 's2', points: s.approx.points, dash: '6 4', width: 2.2 });
    ser.push(...(s.series || []));
    const bands = [...(s.bands || [])]; let brk = null;
    if (s.exact && s.approx && breaks){ brk = breakRanges(s.exact.points, s.approx.points, s.breakTol ?? BTOL, s.x.min, s.x.max); brk.forEach(b => bands.push({ x0: b[0], x1: b[1] })); }
    const ys = ser.flatMap(x => x.points.map(p => p[1]));
    const y = s.y && s.y.min != null ? s.y : (s.y && s.y.log ? logY(ys, s.y) : linY(ys, s.y || {}));
    plotT.innerHTML = s.title || '';
    D.chart.set({ title: (s.title || '').replace(/<[^>]+>/g, ''), summary: s.summary || '', x: s.x, y, series: ser, bands, hlines: s.hlines || [], notes: s.notes || [],
      marks: s.marks || [], cursor: s.cursor ?? null, cursorLabel: s.cursorLabel || null, legend: s.legend });
    const fx = s.x.fmt || (v => Number.isInteger(v) ? String(v) : IE.fmt.num(v, 2)), tolTxt = IE.fmt.pct(s.breakTol ?? BTOL), xn = s.xName || 'x';
    plotN.innerHTML = [s.note || '', s.approx ? `Shaded between the curves: the error of the approximation.` : '',
      brk ? (brk.length ? `Grey band: ${IE.esc(s.approx.label)} is off by more than ${tolTxt} (${brk.map(b => b[2] === b[3] ? `${xn} = ${fx(b[2])}` : `${xn} = ${fx(b[2])} to ${fx(b[3])}`).join('; ')}).`
        : `${IE.esc(s.approx.label)} stays within ${tolTxt} everywhere in this range.`) : ''].filter(Boolean).join(' ');
    D.plotNote = plotN.textContent;
  }
  D.set = ({ sel, P, breaks = false }) => {
    const i = IE.clamp(Math.round(sel), 0, lines.length - 1), pk = JSON.stringify(P);
    if (pk !== resKey){ resKey = pk; D.results(P).forEach((r, k) => { const [t, c, title] = badge(r), el = items[k].querySelector('.dc'); el.textContent = t; el.className = 'dc ' + c; el.title = title; el.setAttribute('aria-label', title); }); }
    if (i !== cur){ items.forEach((li, k) => { li.classList.toggle('on', k === i); k === i ? li.setAttribute('aria-current', 'step') : li.removeAttribute('aria-current'); });
      if (cur >= 0 && cfg.scroll !== false) items[i].scrollIntoView({ block: 'nearest', behavior: IE.reducedMotion ? 'auto' : 'smooth' });   // not on first paint
      cur = i; }
    const key = i + '|' + pk + '|' + breaks;
    if (D.chart && key !== plotKey){ plotKey = key; drawPlot(lines[i], P, breaks); }
    return D;
  };
  D.breakRanges = breakRanges;
  return D;
};
IE.derivation.sci = sci;
IE.derivation.logY = logY;
IE.derivation.linY = linY;
})();
