/* interactive-explainer runtime: uncertainty.js (IE.uncertainty). Risk, probability, base rates and simulation:
   seeded sampling (IE.seeded), exact distributions (binomial, Poisson, normal), quantiles and intervals, natural-
   frequency wording ("8 of 1,000" next to "0.8%"), and three SVG views: an icon array, a histogram / dot plot of
   simulation draws with the exact distribution overlaid, and an interval (forest) chart. Guide: shapes/uncertainty.md.
   The maths also loads in Node for a model's validation run: set globalThis.IE = { seeded } first, then require it. */
(function(){
'use strict';
const G = typeof window !== 'undefined' ? window : globalThis, IE = G.IE || (G.IE = {});
const U = IE.uncertainty = {};
const int = v => IE.fmt ? IE.fmt.int(v) : Math.round(v).toLocaleString('en');

// ---------------------------------------------------------------- exact distributions
const LZ = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
const lgamma = x => { if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);   // Lanczos, ~1e-15
  x -= 1; let a = LZ[0]; const t = x + 7.5; for (let i = 1; i < 9; i++) a += LZ[i] / (x + i);
  return 0.9189385332046728 + (x + 0.5) * Math.log(t) - t + Math.log(a); };
U.lgamma = lgamma;
U.logChoose = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
// support that carries all but ~1e-30 of the mass: sums over it are exact to double precision
const span = (mean, sd, lo, hi) => [Math.max(lo, Math.floor(mean - 12 * sd - 12)), Math.min(hi, Math.ceil(mean + 12 * sd + 12))];
const discrete = (pmf, sp) => ({
  cdf(k){ k = Math.floor(k); const [a, b] = sp(); if (k < a) return 0; if (k >= b) return 1; let s = 0;
    if (k - a <= b - k){ for (let j = a; j <= k; j++) s += pmf(j); return Math.min(1, s); }
    for (let j = k + 1; j <= b; j++) s += pmf(j); return Math.max(0, 1 - s); },
  quantile(q){ const [a, b] = sp(); let s = 0; for (let j = a; j <= b; j++){ s += pmf(j); if (s >= q - 1e-12) return j; } return b; },   // smallest k with cdf(k) >= q
});
U.binom = {
  pmf(k, n, p){ if (k < 0 || k > n || k !== Math.floor(k)) return 0; if (p <= 0) return k === 0 ? 1 : 0; if (p >= 1) return k === n ? 1 : 0;
    return Math.exp(U.logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p)); },
  mean: (n, p) => n * p, sd: (n, p) => Math.sqrt(n * p * (1 - p)),
  cdf: (k, n, p) => discrete(j => U.binom.pmf(j, n, p), () => span(n * p, U.binom.sd(n, p), 0, n)).cdf(k),
  quantile: (q, n, p) => discrete(j => U.binom.pmf(j, n, p), () => span(n * p, U.binom.sd(n, p), 0, n)).quantile(q),
  support: (n, p) => span(n * p, U.binom.sd(n, p), 0, n),
};
U.poisson = {
  pmf(k, l){ if (k < 0 || k !== Math.floor(k)) return 0; if (l <= 0) return k === 0 ? 1 : 0; return Math.exp(k * Math.log(l) - l - lgamma(k + 1)); },
  mean: l => l, sd: l => Math.sqrt(l),
  cdf: (k, l) => discrete(j => U.poisson.pmf(j, l), () => span(l, Math.sqrt(l), 0, Infinity)).cdf(k),
  quantile: (q, l) => discrete(j => U.poisson.pmf(j, l), () => span(l, Math.sqrt(l), 0, Infinity)).quantile(q),
  support: l => span(l, Math.sqrt(l), 0, Infinity),
};
const erfc = x => { const z = Math.abs(x), t = 1 / (1 + 0.5 * z);   // Numerical Recipes erfcc, relative error < 1.2e-7
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r; };
const AQ = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00],
  BQ = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01],
  CQ = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00],
  DQ = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
const probit = p => { if (p <= 0) return -Infinity; if (p >= 1) return Infinity;   // Acklam, relative error 1.2e-9
  const tail = q => (((((CQ[0] * q + CQ[1]) * q + CQ[2]) * q + CQ[3]) * q + CQ[4]) * q + CQ[5]) / ((((DQ[0] * q + DQ[1]) * q + DQ[2]) * q + DQ[3]) * q + 1);
  if (p < 0.02425) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5, r = q * q;
  return (((((AQ[0] * r + AQ[1]) * r + AQ[2]) * r + AQ[3]) * r + AQ[4]) * r + AQ[5]) * q / (((((BQ[0] * r + BQ[1]) * r + BQ[2]) * r + BQ[3]) * r + BQ[4]) * r + 1); };
U.normal = {
  pdf: (x, mu = 0, sd = 1) => Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * 2.5066282746310002),
  cdf: (x, mu = 0, sd = 1) => 0.5 * erfc(-(x - mu) / (sd * Math.SQRT2)),
  quantile: (q, mu = 0, sd = 1) => mu + sd * probit(q),
};

// ---------------------------------------------------------------- seeded sampling
const tables = new Map();   // cumulative tables for repeated binomial/Poisson draws with the same parameters
const tableDraw = (key, pmf, [a, b], u) => {
  let t = tables.get(key);
  if (!t){ const c = new Float64Array(b - a + 1); let s = 0; for (let j = a; j <= b; j++){ s += pmf(j); c[j - a] = s; } for (let i = 0; i < c.length; i++) c[i] /= s;
    if (tables.size > 64) tables.clear(); tables.set(key, t = { a, c }); }
  let lo = 0, hi = t.c.length - 1; while (lo < hi){ const m = (lo + hi) >> 1; if (t.c[m] < u) lo = m + 1; else hi = m; } return t.a + lo; };
/* U.rng(seed | () => [0,1)) -> { u(), int(a,b), bernoulli(p), normal(mu,sd), binomial(n,p), poisson(l), pick(arr), shuffle(arr) }.
   Same seed, same stream: a page reruns identically and a URL can carry the seed. */
U.rng = seed => {
  const u = typeof seed === 'function' ? seed : IE.seeded(seed | 0);
  return { u, seed,
    int: (a, b) => a + Math.floor(u() * (b - a + 1)),
    bernoulli: p => u() < p,
    normal(mu = 0, sd = 1){ let a = u(); while (a <= 0) a = u(); return mu + sd * Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u()); },
    binomial(n, p){ if (n <= 0 || p <= 0) return 0; if (p >= 1) return n;
      if (n <= 40){ let k = 0; for (let i = 0; i < n; i++) if (u() < p) k++; return k; }
      return tableDraw('b' + n + '|' + p, j => U.binom.pmf(j, n, p), U.binom.support(n, p), u()); },
    poisson(l){ if (l <= 0) return 0;
      if (l < 30){ const L = Math.exp(-l); let k = 0, q = u(); while (q > L){ k++; q *= u(); } return k; }
      return tableDraw('p' + l, j => U.poisson.pmf(j, l), U.poisson.support(l), u()); },
    pick: arr => arr[Math.floor(u() * arr.length)],
    shuffle(arr){ for (let i = arr.length - 1; i > 0; i--){ const j = Math.floor(u() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; },
  };
};
// runs independent repetitions from one seeded stream: U.simulate(2000, seed, (rng, i) => outcome)
U.simulate = (runs, seed, fn) => { const r = U.rng(seed), out = new Array(runs); for (let i = 0; i < runs; i++) out[i] = fn(r, i); return out; };

// ---------------------------------------------------------------- summaries, intervals, agreement
const sortedCopy = a => Float64Array.from(a).sort();
U.mean = a => { let s = 0; for (const v of a) s += v; return a.length ? s / a.length : NaN; };
U.sd = a => { const m = U.mean(a); let s = 0; for (const v of a) s += (v - m) ** 2; return a.length > 1 ? Math.sqrt(s / (a.length - 1)) : 0; };
/* U.quantile(draws, q, { sorted, discrete }): linear interpolation (type 7) for continuous draws; for integer draws
   (discrete:true) the smallest value whose share of draws reaches q, comparable with an exact quantile. */
U.quantile = (a, q, o = {}) => { const s = o.sorted ? a : sortedCopy(a), n = s.length; if (!n) return NaN;
  if (o.discrete) return s[Math.min(n - 1, Math.max(0, Math.ceil(q * n - 1e-9) - 1))];
  const h = (n - 1) * q, lo = Math.floor(h); return s[lo] + (h - lo) * (s[Math.min(lo + 1, n - 1)] - s[lo]); };
U.isIntegers = a => { for (const v of a) if (v !== Math.floor(v)) return false; return true; };
U.summary = (a, qs = [0.05, 0.5, 0.95]) => { const s = sortedCopy(a), discrete = U.isIntegers(s);
  return { n: s.length, mean: U.mean(s), sd: U.sd(s), min: s[0], max: s[s.length - 1], qs, q: qs.map(q => U.quantile(s, q, { sorted: true, discrete })), sorted: s, discrete }; };
U.share = (a, pred) => { let k = 0; for (const v of a) if (pred(v)) k++; return a.length ? k / a.length : NaN; };
U.wilson = (k, n, conf = 0.95) => { if (!n) return [0, 1]; const z = probit(1 - (1 - conf) / 2), ph = k / n, d = 1 + z * z / n;
  const c = (ph + z * z / (2 * n)) / d, h = z * Math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n)) / d; return [Math.max(0, c - h), Math.min(1, c + h)]; };
U.seProp = (p, n) => Math.sqrt(p * (1 - p) / n);                       // standard error of a simulated proportion
U.seMean = (sd, n) => sd / Math.sqrt(n);                               // standard error of a simulated mean
U.seQuantile = (q, n, density) => Math.sqrt(q * (1 - q) / n) / density;   // standard error of a sample quantile
// does a simulated value agree with the exact one? within z standard errors (3 by default: false alarms ~0.3%)
U.agree = (sim, exact, se, z = 3) => ({ ok: Math.abs(sim - exact) <= z * se + 1e-12, z: se > 0 ? (sim - exact) / se : 0, se, tol: z * se });

// ---------------------------------------------------------------- natural-frequency wording
const sig2 = v => { const e = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.round(v / e) * e; };
U.pct = p => !isFinite(p) ? '–' : IE.fmt ? IE.fmt.pct(p, p === 0 || p >= 0.1 ? 0 : p >= 0.001 ? 1 : 2) : (p * 100).toFixed(p >= 0.1 ? 0 : p >= 0.001 ? 1 : 2) + '%';
// U.freq(p, N): { k, N, text: '8 of 1,000' }. Without N: the smallest power of ten that gives about 10 or more cases.
U.freq = (p, N) => { if (!N){ N = 10; while (N < 1e6 && p * N < 9.5) N *= 10; } const k = Math.round(p * N); return { k, N, text: `${int(k)} of ${int(N)}` }; };
U.oneIn = p => !(p > 0) ? 'never' : p >= 1 ? 'every time' : p >= 0.3 ? `${Math.round(p * 10)} in 10` : `1 in ${int(1 / p < 20 ? Math.round(1 / p) : sig2(1 / p))}`;
U.both = (p, N) => `${U.pct(p)} (${U.freq(p, N).text})`;      // the page's standard: a percentage and its natural frequency together
// whole counts that add up to N exactly (largest remainder), for icon arrays built from expected values
U.roundCounts = (vals, N) => { const tot = vals.reduce((s, v) => s + v, 0) || 1, N0 = N ?? Math.round(tot), sc = vals.map(v => v / tot * N0);
  const fl = sc.map(Math.floor); let left = N0 - fl.reduce((s, v) => s + v, 0);
  sc.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0){ fl[i]++; left--; } }); return fl; };

// ---------------------------------------------------------------- shared view helpers (browser only)
const cc = c => IE.cssColor(c);
const keyPick = (el, fn) => { el.addEventListener('click', fn); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fn(); } }); };
// wrap text into at most maxLines lines of maxW px; ellipsis when it still does not fit
U.wrap = (s, maxW, px = 12, weight = '', maxLines = 2) => {
  const lines = []; let cur = '';
  for (const w of String(s).split(/\s+/)){ const t = cur ? cur + ' ' + w : w; if (!cur || IE.textWidth(t, px, weight) <= maxW) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  if (lines.length > maxLines){ lines.length = maxLines; lines[maxLines - 1] += '…'; }
  return lines.map(l => { if (IE.textWidth(l, px, weight) <= maxW) return l; let t = l.replace(/…$/, ''); while (t.length > 1 && IE.textWidth(t + '…', px, weight) > maxW) t = t.slice(0, -1); return t + '…'; });
};
const multiText = (parent, lines, x, yMid, attrs, lh = 14) => {
  const t = IE.svg('text', { ...attrs, x, y: yMid - (lines.length - 1) * lh / 2 + 4 }, parent);
  lines.forEach((l, i) => IE.svg('tspan', { x, dy: i ? lh : 0, text: l }, t)); return t; };
U.multiText = multiText;
const observe = (host, ch, getW) => { new ResizeObserver(() => { if (ch.S && host.clientWidth && host.clientWidth !== getW()) ch.set({}); }).observe(host); };

/* U.picker(host, items:[{id,label}], onPick, { label }) -> { set(id) }. A segmented control for the shared
   selection (#controls); every button carries data-pick. */
U.picker = (host, items, onPick, o = {}) => {
  const d = document.createElement('div'); d.className = 'seg ie-pick'; d.setAttribute('role', 'group'); d.setAttribute('aria-label', o.label || 'Selection');
  d.innerHTML = items.map(it => `<button type="button" data-pick="${IE.esc(it.id)}" aria-pressed="false"${it.title ? ` title="${IE.esc(it.title)}"` : ''}>${IE.esc(it.label)}</button>`).join('');
  host.appendChild(d); d.querySelectorAll('button').forEach(b => b.onclick = () => onPick(b.dataset.pick));
  return { el: d, set(id){ d.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.pick === String(id) ? 'true' : 'false')); } };
};
// "Draw again": reruns the simulation with a new seed (keep the seed in app.P so the link reproduces the draw)
U.drawAgain = (host, onDraw, label = 'Draw again') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ie-again';
  b.textContent = '⟳ ' + label; b.title = 'Rerun the simulation with a new random seed'; b.onclick = onDraw; host.appendChild(b); return b; };

/* ---------------------------------------------------------------- icon array
   U.iconArray(host, { title, groups:[{id,label,count,color}], N, cols:10, rows:10, shape:'person'|'dot'|'square',
     shuffle: seed|null, highlight: id|[ids]|null, onPick: id => …, legend: true, legendText: (g, N) => html,
     maxHeight: 380, maxSize: 18 }) -> { set(patch), el }
   N icons in blocks of cols×rows (default 10×10 = 100), so counts can be read by blocks. Groups fill in order (or at
   seeded random places with shuffle). Each group is one <g data-pick> (keyboard: Tab, Enter); the legend above
   repeats every group as a button with its natural frequency. Highlighting dims the other groups. */
// one path per group: every icon of the group is a sub-path (cheap DOM even for 10 000 icons)
const f1 = v => Math.round(v * 10) / 10;
const iconD = (shape, x, y, s) => { const k = s / 10;
  if (shape === 'square') return `M${f1(x + k)},${f1(y + k)}h${f1(8 * k)}v${f1(8 * k)}h${f1(-8 * k)}Z`;
  if (shape === 'dot'){ const r = f1(3.8 * k); return `M${f1(x + 5 * k - r)},${f1(y + 5 * k)}a${r},${r} 0 1,0 ${f1(2 * r)},0a${r},${r} 0 1,0 ${f1(-2 * r)},0Z`; }
  const X = v => f1(x + (0.6 + 0.88 * v) * k), Y = v => f1(y + (0.6 + 0.88 * v) * k), r = f1(1.95 * 0.88 * k);   // person: head + shoulders
  return `M${X(5) - r},${Y(2.3)}a${r},${r} 0 1,0 ${f1(2 * r)},0a${r},${r} 0 1,0 ${f1(-2 * r)},0Z` +
    `M${X(1.9)},${Y(10)}V${Y(6.8)}C${X(1.9)},${Y(5.3)} ${X(3.2)},${Y(4.6)} ${X(5)},${Y(4.6)}S${X(8.1)},${Y(5.3)} ${X(8.1)},${Y(6.8)}V${Y(10)}Z`; };
U.iconArray = (host, spec) => {
  const wrap = document.createElement('div'); wrap.className = 'ie-icons'; host.appendChild(wrap);
  const leg = document.createElement('div'); leg.className = 'ie-ulegend'; leg.setAttribute('role', 'group'); wrap.appendChild(leg);
  const root = IE.svg('svg', { class: 'ie-chart ie-iconsvg' }, wrap), title = IE.svg('title', {}, root), body = IE.svg('g', {}, root);
  const ch = { el: root, S: null }; let key = '', gEls = {}, W0 = 0;
  const N = () => ch.S.N || ch.S.groups.reduce((s, g) => s + g.count, 0);
  const hlSet = () => new Set([].concat(ch.S.highlight ?? []).map(String));
  const build = () => {
    const S = ch.S, n = N(), cols = S.cols || 10, rows = S.rows || 10, per = cols * rows, nB = Math.max(1, Math.ceil(n / per));
    const W = W0 = Math.max(260, host.clientWidth || 600), maxH = S.maxHeight || 380, maxS = S.maxSize || 18, gap = S.gap ?? 8;
    const rowsUsed = nB === 1 ? Math.ceil(n / cols) : rows;
    const cands = [];   // blocks per row: the largest icons that fit maxHeight, preferring full rows of blocks
    for (let bpr = 1; bpr <= nB; bpr++){ const s = Math.min(maxS, (W - 8 - (bpr - 1) * gap) / (bpr * cols)), br = Math.ceil(nB / bpr);
      cands.push({ bpr, s, H: br * rowsUsed * s + (br - 1) * gap, score: s * (nB % bpr === 0 ? 1 : 0.92) }); }
    const fit = cands.filter(c => c.H <= maxH);
    const { bpr, s } = fit.length ? fit.reduce((a, c) => c.score > a.score ? c : a) : cands.reduce((a, c) => c.H < a.H ? c : a), br = Math.ceil(nB / bpr), gridW = Math.min(bpr, nB) * cols * s + (Math.min(bpr, nB) - 1) * gap, H = Math.ceil(br * rowsUsed * s + (br - 1) * gap + 8);
    const x0 = (W - gridW) / 2, y0 = 4;
    root.setAttribute('viewBox', `0 0 ${W} ${H}`); root.setAttribute('width', W); root.setAttribute('height', H);
    body.replaceChildren(); gEls = {};
    const order = Array.from({ length: n }, (_, i) => i); if (S.shuffle != null) U.rng(S.shuffle).shuffle(order);
    const pos = i => { const b = Math.floor(i / per), j = i % per; return [x0 + (b % bpr) * (cols * s + gap) + (j % cols) * s, y0 + Math.floor(b / bpr) * (rowsUsed * s + gap) + Math.floor(j / cols) * s]; };
    const shape = S.shape || (s >= 9 ? 'person' : 'square'), shapeOf = shape === 'person' && s < 7 ? 'square' : shape;
    let i = 0;
    const groups = [...S.groups], used = groups.reduce((t, g) => t + g.count, 0);
    if (used < n) groups.push({ id: '_rest', label: 'other', count: n - used, color: 'grid', rest: true });
    for (const g of groups){
      const ge = IE.svg('g', { class: 'ie-icgrp', fill: cc(g.color), 'data-group': g.id }, body);
      if (S.onPick && !g.rest){ ge.setAttribute('data-pick', g.id); ge.setAttribute('tabindex', 0); ge.setAttribute('role', 'button');
        ge.setAttribute('aria-label', `${g.label}: ${int(g.count)} of ${int(n)}`); keyPick(ge, () => ch.S.onPick(g.id)); }
      let d = ''; for (let k = 0; k < g.count && i < n; k++, i++){ const [x, y] = pos(order[i]); d += iconD(shapeOf, x, y, s); }
      if (d) IE.svg('path', { d }, ge);
      gEls[g.id] = ge;
    }
    title.textContent = (S.title || 'Icon array') + ': ' + S.groups.map(g => `${g.label} ${int(g.count)} of ${int(n)}`).join('; ');
    root.setAttribute('aria-label', title.textContent); root.setAttribute('role', S.onPick ? 'group' : 'img');
    leg.innerHTML = S.legend === false ? '' : S.groups.map(g => `<button type="button"${S.onPick ? ` data-pick="${IE.esc(g.id)}"` : ' disabled'} aria-pressed="false"><i style="background:${cc(g.color)}"></i>${
      S.legendText ? S.legendText(g, n) : `<span><b>${int(g.count)}</b> of ${int(n)}</span><span class="g">${IE.esc(g.label)}</span>`}</button>`).join('');
    if (S.onPick) leg.querySelectorAll('button').forEach(b => b.onclick = () => ch.S.onPick(b.dataset.pick));
  };
  const paint = () => { const hs = hlSet(), any = hs.size > 0;
    for (const id in gEls){ gEls[id].classList.toggle('on', hs.has(id)); gEls[id].classList.toggle('off', any && !hs.has(id)); }
    leg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', hs.has(b.dataset.pick) ? 'true' : 'false')); };
  ch.set = patch => { ch.S = { ...(ch.S || {}), ...patch }; const S = ch.S;
    const k = [host.clientWidth, N(), S.groups.map(g => g.id + ':' + g.count + ':' + g.color + ':' + g.label).join(','), S.shuffle, S.shape, S.cols, S.rows, S.maxHeight].join('|');
    if (k !== key){ key = k; build(); } paint(); return ch; };
  observe(host, ch, () => W0);
  return ch.set(spec);
};

/* ---------------------------------------------------------------- histogram / dot plot of draws
   U.histogram(host, { title, draws, discrete (auto), bins (continuous; default 30), maxBars: 90, x:{min,max,fmt,label},
     exact: { pmf: k => p } | { pdf: x => density }, exactLabel, color:'s1', highlight:{from,to}|null, hlColor:'s2',
     quantiles:[0.05,0.5,0.95], qLabel: q => text, marks:[{x,label,color}], mode:'bars'|'dots', height: 250,
     onPick: x => …, legend: true, drawsLabel }) -> { set(patch) }
   Bars count the draws; the exact distribution is drawn as dots (discrete) or a curve (continuous) scaled to the
   same number of draws, so the two can be compared by eye. Dashed lines mark sample quantiles. */
U.histogram = (host, spec) => {
  const leg = document.createElement('div'); leg.className = 'legend'; host.appendChild(leg);
  const root = IE.svg('svg', { class: 'ie-chart ie-hist', role: 'img' }, host), title = IE.svg('title', {}, root), base = IE.svg('g', {}, root);
  const ch = { el: root, S: null }; let bars = [], W0 = 0;
  const build = () => {
    const S = ch.S, d = S.draws || [], n = d.length, disc = S.discrete ?? U.isIntegers(d), fx = (S.x && S.x.fmt) || (v => IE.fmt.num(v, disc ? 0 : 2));
    const W = W0 = Math.max(260, host.clientWidth || 600), H = S.height || 250, qs = S.quantiles || [0.05, 0.5, 0.95];
    const sm = n ? U.summary(d, qs) : null;
    let lo = S.x && S.x.min != null ? S.x.min : sm ? sm.min : 0, hi = S.x && S.x.max != null ? S.x.max : sm ? sm.max : 1;
    if (S.exact && S.exact.pmf && (!S.x || S.x.min == null)){ while (lo > 0 && S.exact.pmf(lo - 1) * n > 0.3) lo--; while (S.exact.pmf(hi + 1) * n > 0.3) hi++; }
    let edges = [];
    if (disc){ const w = Math.max(1, Math.ceil((hi - lo + 1) / (S.maxBars || 90))); for (let a = lo; a <= hi; a += w) edges.push([a - 0.5, a + w - 0.5]); }
    else { const nb = S.bins || 30, w = (hi - lo) / nb || 1; for (let i = 0; i < nb; i++) edges.push([lo + i * w, lo + (i + 1) * w]); }
    const e0 = edges[0][0], e1 = edges[edges.length - 1][1], bw = edges[0][1] - edges[0][0];
    const cnt = edges.map(() => 0); for (const v of d){ const i = Math.floor((v - e0) / bw); if (i >= 0 && i < cnt.length) cnt[i]++; else if (v === e1) cnt[cnt.length - 1]++; }
    let ex = null;
    if (S.exact && S.exact.pmf && disc) ex = edges.map(([a, b]) => { let p = 0; for (let k = Math.ceil(a); k < b; k++) p += S.exact.pmf(k); return [(a + b) / 2, p * n]; });
    else if (S.exact && S.exact.pdf) ex = IE.range(e0, e1, 160).map(x => [x, S.exact.pdf(x) * bw * n]);
    const yMax = IE.niceMax(Math.max(1, ...cnt, ...(ex || []).map(p => p[1])) * 1.06);
    const marks = [...(sm ? qs.map((q, i) => ({ x: sm.q[i], label: S.qLabel ? S.qLabel(q, sm.q[i]) : (q === 0.5 ? 'median ' : Math.round(q * 100) + '%: ') + fx(sm.q[i]), q: true })) : []), ...(S.marks || [])];
    const pad = { l: 44, r: 14, t: marks.length ? 34 : 12, b: S.x && S.x.label ? 38 : 24 }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const X = v => pad.l + (v - e0) / (e1 - e0) * pw, Y = c => pad.t + ph - c / yMax * ph;
    root.setAttribute('viewBox', `0 0 ${W} ${H}`); root.setAttribute('width', W); root.setAttribute('height', H); root._geo = { pad, pw, x0: e0, x1: e1 };
    title.textContent = (S.title || 'Distribution of simulated outcomes') + (sm ? `: ${int(n)} draws, median ${fx(sm.q[qs.indexOf(0.5)] ?? sm.mean)}, ${qs.map((q, i) => Math.round(q * 100) + '% ' + fx(sm.q[i])).join(', ')}` : '');
    root.setAttribute('aria-label', title.textContent);
    base.replaceChildren(); bars = [];
    IE.svg('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' }, base);
    for (const v of IE.ticks(0, yMax, Math.max(3, Math.round(ph / 50)))){ IE.svg('line', { class: 'grid', x1: pad.l, x2: pad.l + pw, y1: Y(v), y2: Y(v) }, base);
      IE.svg('text', { class: 'tick', x: pad.l - 6, y: Y(v) + 4, 'text-anchor': 'end', text: int(v) }, base); }
    let xt = IE.ticks(lo, hi, Math.max(3, Math.round(pw / 80))); if (disc) xt = [...new Set(xt.map(Math.round))];
    for (const v of xt){ const x = X(v), anc = x - pad.l < 20 ? 'start' : pad.l + pw - x < 20 ? 'end' : 'middle';
      IE.svg('text', { class: 'tick', x, y: pad.t + ph + 16, 'text-anchor': anc, text: fx(v) }, base); }
    if (S.x && S.x.label){ const w = IE.textWidth(S.x.label, 11) / 2 + 3; IE.svg('text', { class: 'tick', x: IE.clamp(pad.l + pw / 2, w, W - w), y: H - 5, 'text-anchor': 'middle', text: S.x.label }, base); }
    const dotsMode = S.mode === 'dots' && n && n <= 600, maxC = Math.max(1, ...cnt), r = Math.min((X(e0 + bw) - X(e0)) / 2 - 0.4, ph / maxC / 2 - 0.2);
    edges.forEach(([a, b], i) => {
      const x = X(a) + 0.5, w = Math.max(1, X(b) - X(a) - 1), g = IE.svg('g', { class: 'hbar' }, base);
      if (dotsMode && r >= 1.6) for (let k = 0; k < cnt[i]; k++) IE.svg('circle', { cx: (X(a) + X(b)) / 2, cy: pad.t + ph - r - 2 * r * k, r: r * 0.9 }, g);
      else if (cnt[i]) IE.svg('rect', { x, y: Y(cnt[i]), width: w, height: Y(0) - Y(cnt[i]), rx: Math.min(2, w / 3) }, g);
      bars.push({ a, b, g });
    });
    IE.svg('line', { class: 'axis', x1: pad.l, x2: pad.l + pw, y1: pad.t + ph, y2: pad.t + ph }, base);
    if (ex){ if (disc && bw === 1 && ex.length <= 80){ IE.svg('path', { d: IE.pathD(ex.map(([x, y]) => [X(x), Y(y)])), class: 'exact', fill: 'none' }, base);
        for (const [x, y] of ex) if (y > yMax * 0.004) IE.svg('circle', { cx: X(x), cy: Y(y), r: 2.6, class: 'exactdot' }, base); }
      else IE.svg('path', { d: IE.pathD(ex.map(([x, y]) => [X(x), Y(y)])), class: 'exact', fill: 'none' }, base); }
    // quantile and mark lines, labels in a two-row band above the plot, de-overlapped left to right
    const placed = [[], []];
    for (const m of marks){ if (!isFinite(m.x) || m.x < e0 || m.x > e1) continue; const x = X(m.x);
      IE.svg('line', { class: m.q ? 'qline' : 'mline', x1: x, x2: x, y1: pad.t - 2, y2: pad.t + ph, stroke: m.color ? cc(m.color) : null }, base);
      const w = IE.textWidth(m.label, 11.5) + 6, l = IE.clamp(x - w / 2, 2, W - w - 2), row = placed[0].some(([a, b]) => l < b && a < l + w) ? 1 : 0;
      if (row && placed[1].some(([a, b]) => l < b && a < l + w)) continue;
      placed[row].push([l, l + w]); IE.svg('text', { class: 'note lbl', x: l + 3, y: row ? 26 : 12, text: m.label }, base); }
    const L = [`<span><i style="background:${cc(S.color || 's1')};height:9px;width:9px"></i>${IE.esc(S.drawsLabel || `simulated (${int(n)} draws)`)}</span>`];
    if (ex) L.push(`<span><i style="background:var(--ink);height:3px"></i>${IE.esc(S.exactLabel || 'exact distribution')}</span>`);
    if (sm) L.push(`<span><i class="dash" style="color:var(--ink2)"></i>${IE.esc(qs.map(q => q === 0.5 ? 'median' : Math.round(q * 100) + '%').join(' · '))} of the draws</span>`);
    leg.innerHTML = S.legend === false ? '' : L.join('');
    root.classList.toggle('pickable', !!S.onPick);
  };
  const paint = () => { const S = ch.S, h = S.highlight, col = cc(S.color || 's1'), hc = cc(S.hlColor || 's2');
    for (const b of bars){ const on = h && (h.from == null || b.b > h.from) && (h.to == null || b.a < h.to); b.g.setAttribute('fill', on ? hc : col); b.g.classList.toggle('off', !!h && !on); } };
  ch.set = patch => { const only = patch && Object.keys(patch).length && Object.keys(patch).every(k => k === 'highlight');
    ch.S = { ...(ch.S || {}), ...patch }; if (!only || !bars.length) build(); paint(); return ch; };
  root.addEventListener('pointerdown', e => { const S = ch.S, g = root._geo; if (!S || !S.onPick || !g) return; const r = root.getBoundingClientRect();
    let x = g.x0 + ((e.clientX - r.left) - g.pad.l) / g.pw * (g.x1 - g.x0); if (S.discrete ?? U.isIntegers(S.draws || [])) x = Math.round(x); S.onPick(IE.clamp(x, g.x0, g.x1)); });
  observe(host, ch, () => W0); IE.theme.onChange(() => ch.S && ch.set({}));
  return ch.set(spec);
};

/* ---------------------------------------------------------------- interval (forest) chart
   U.forest(host, { title, rows:[{id,label,est,lo,hi,color,exact:{lo,hi},note}], x:{min,max,fmt,label,log},
     refs:[{x,label}], highlight:id, onPick:id=>…, valueText: r => text, rowH: 30 }) -> { set(patch) }
   One row per group: the estimate as a dot, its interval as a line with caps, an optional exact/second interval as a
   pale wide band behind it, the numbers in a right column. Reference lines (no effect, 50%, a target) are dashed. */
U.forest = (host, spec) => {
  const root = IE.svg('svg', { class: 'ie-chart ie-forest' }, host), title = IE.svg('title', {}, root), base = IE.svg('g', {}, root);
  const ch = { el: root, S: null }; let rowEls = {}, W0 = 0;
  const build = () => {
    const S = ch.S, W = W0 = Math.max(260, host.clientWidth || 600), rowH = S.rowH || 32, fx = (S.x && S.x.fmt) || (v => IE.fmt.num(v, 2)), narrow = W < 520;
    const vt = r => S.valueText ? S.valueText(r, narrow) : narrow ? fx(r.est) : `${fx(r.est)} (${fx(r.lo)}–${fx(r.hi)})`;
    const labW = Math.min(W * (narrow ? 0.34 : 0.3), 10 + Math.max(...S.rows.map(r => IE.textWidth(r.label, 12)))), valW = Math.min(W * 0.32, 12 + Math.max(...S.rows.map(r => IE.textWidth(vt(r), 12, 'bold'))));
    const top = (S.refs || []).some(r => r.label) ? 20 : 6, bot = S.x && S.x.label ? 38 : 24, H = top + S.rows.length * rowH + bot;
    const lgx = S.x && S.x.log, tr = v => lgx ? Math.log10(v) : v;
    const vals = S.rows.flatMap(r => [r.lo, r.hi, r.est, ...(r.exact ? [r.exact.lo, r.exact.hi] : [])]).filter(isFinite);
    const xmin = S.x && S.x.min != null ? S.x.min : Math.min(...vals), xmax = S.x && S.x.max != null ? S.x.max : Math.max(...vals);
    const p0 = labW + 10, p1 = W - valW - 10, X = v => p0 + (tr(IE.clamp(v, xmin, xmax)) - tr(xmin)) / ((tr(xmax) - tr(xmin)) || 1) * (p1 - p0);
    root.setAttribute('viewBox', `0 0 ${W} ${H}`); root.setAttribute('width', W); root.setAttribute('height', H);
    title.textContent = (S.title || 'Estimates with intervals') + ': ' + S.rows.map(r => `${r.label} ${fx(r.est)} (${fx(r.lo)} to ${fx(r.hi)})`).join('; ');
    root.setAttribute('aria-label', title.textContent); root.setAttribute('role', S.onPick ? 'group' : 'img');
    base.replaceChildren(); rowEls = {};
    const yb = top + S.rows.length * rowH;
    const xt = lgx ? [] : IE.ticks(xmin, xmax, Math.max(2, Math.round((p1 - p0) / 70)));
    for (const v of xt){ IE.svg('line', { class: 'grid', x1: X(v), x2: X(v), y1: top, y2: yb }, base);
      IE.svg('text', { class: 'tick', x: X(v), y: yb + 15, 'text-anchor': X(v) - p0 < 16 ? 'start' : p1 - X(v) < 16 ? 'end' : 'middle', text: fx(v) }, base); }
    if (S.x && S.x.label){ const w = IE.textWidth(S.x.label, 11) / 2 + 3; IE.svg('text', { class: 'tick', x: IE.clamp((p0 + p1) / 2, w, W - w), y: H - 5, 'text-anchor': 'middle', text: S.x.label }, base); }
    S.rows.forEach((r, i) => {
      const y = top + i * rowH, cy = y + rowH / 2, col = cc(r.color || 's1');
      const g = IE.svg('g', { class: 'frow', 'data-id': r.id }, base);
      if (S.onPick){ g.setAttribute('data-pick', r.id); g.setAttribute('tabindex', 0); g.setAttribute('role', 'button'); g.setAttribute('aria-label', `${r.label}: ${vt(r)}`); keyPick(g, () => ch.S.onPick(r.id)); }
      IE.svg('rect', { class: 'fbg', x: 0, y: y + 1, width: W, height: rowH - 2, rx: 5 }, g);
      multiText(g, U.wrap(r.label, labW - 6, 12, '', 2), labW, cy, { class: 'lbl', 'text-anchor': 'end' }, 13);
      if (r.exact) IE.svg('line', { class: 'fexact', x1: X(r.exact.lo), x2: X(r.exact.hi), y1: cy, y2: cy, stroke: col }, g);
      IE.svg('line', { x1: X(r.lo), x2: X(r.hi), y1: cy, y2: cy, stroke: col, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, g);
      for (const v of [r.lo, r.hi]) IE.svg('line', { x1: X(v), x2: X(v), y1: cy - 5, y2: cy + 5, stroke: col, 'stroke-width': 2 }, g);
      IE.svg('circle', { cx: X(r.est), cy, r: 5, fill: col, stroke: 'var(--panel2)', 'stroke-width': 1.5 }, g);
      IE.svg('text', { class: 'lbl end', x: p1 + 10, y: cy + 4, text: vt(r) }, g);
      rowEls[r.id] = g;
    });
    for (const rf of S.refs || []){ if (rf.x < xmin || rf.x > xmax) continue; const x = X(rf.x);
      IE.svg('line', { class: 'axis', x1: x, x2: x, y1: top - 2, y2: yb, 'stroke-dasharray': '4 4' }, base);
      if (rf.label){ const w = IE.textWidth(rf.label, 11.5); IE.svg('text', { class: 'note lbl', x: IE.clamp(x - w / 2, 2, W - w - 2), y: 13, text: rf.label }, base); } }
  };
  const paint = () => { for (const id in rowEls) rowEls[id].classList.toggle('on', String(ch.S.highlight) === id); };
  ch.set = patch => { const only = patch && Object.keys(patch).length && Object.keys(patch).every(k => k === 'highlight');
    ch.S = { ...(ch.S || {}), ...patch }; if (!only || !Object.keys(rowEls).length) build(); paint(); return ch; };
  observe(host, ch, () => W0);
  return ch.set(spec);
};

if (typeof module === 'object' && module.exports) module.exports = U;
})();
