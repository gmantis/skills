/* interactive-explainer runtime: compare.js (IE.compare). Options × criteria with weights: min–max scores, a weighted
   total, ranks, exact sensitivity of first place to each weight, and the linked views (aligned table, re-sorting
   ranking, side-by-side small views, sensitivity list, weight sweep chart, detail card with each cell's source note).
   IE.compare.model(spec) is pure (no DOM) and also loads in Node: require('<skill>/runtime/compare.js').model(spec).
   IE.compare.view(M, hosts) draws it; it needs core.js and <style data-ie="compare">. Guide: shapes/compare.md. */
(function(){
'use strict';
const G = typeof window !== 'undefined' ? window : globalThis;
const IE = G.IE || (G.IE = {});
const EPS = 1e-9;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ model (pure)
   spec = { criteria: [{ id, label, short, dir: +1|-1, log, fmt: v => 'text', desc, color }],
            options:  [{ id, label, short, sub, notes, pros: [], cons: [], v: { <criterionId>: cell } }],
            wMax: 10, balanced: 5, illustrative: false }
   cell = [value, 'source note'] | [value, 'note', { src: 'sourceId', illustrative: false }] | { v, note, src, illustrative }
   Ids must match [A-Za-z0-9_] (they become parameter keys w_<id>, off_<id> and selection codes). */
function model(spec){
  const wMax = spec.wMax ?? 10, balanced = spec.balanced ?? wMax / 2;
  const criteria = spec.criteria.map((c, i) => ({ dir: 1, short: c.label, fmt: v => String(v), desc: '', color: 's' + ((i % 8) + 1), ...c }));
  const options = spec.options.map(o => {
    const cells = {};
    for (const c of criteria){ const raw = o.v[c.id];
      if (raw == null) throw new Error(`IE.compare: option ${o.id} has no value for criterion ${c.id}`);
      const cell = Array.isArray(raw) ? { v: raw[0], note: raw[1] || '', ...(raw[2] || {}) } : typeof raw === 'number' ? { v: raw, note: '' } : { note: '', ...raw };
      cell.illustrative = cell.illustrative ?? o.illustrative ?? c.illustrative ?? !!spec.illustrative;
      cells[c.id] = cell; }
    return { short: o.label, sub: '', notes: '', pros: [], cons: [], ...o, cells };
  });
  const OPT = Object.fromEntries(options.map(o => [o.id, o])), CRIT = Object.fromEntries(criteria.map(c => [c.id, c]));
  const wKey = id => 'w_' + id, offKey = id => 'off_' + id;
  const weights = o => Object.fromEntries(criteria.map(c => [wKey(c.id), o[c.id] ?? 0]));
  const BAL = weights(Object.fromEntries(criteria.map(c => [c.id, balanced])));
  const hasLog = criteria.some(c => c.log);
  const real = { ...BAL, ...Object.fromEntries(options.map(o => [offKey(o.id), false])), ...(hasLog ? { lin: false } : {}) };
  const cellsAll = options.flatMap(o => criteria.map(c => o.cells[c.id]));
  const illus = { all: cellsAll.every(x => x.illustrative), any: cellsAll.some(x => x.illustrative) };

  // Scores: min–max per criterion over the options in play (on log10 where marked and every value > 0); a flat
  // criterion (all equal) scores 0.5 for everyone, so it cannot change the ranking.
  function normalise(p){
    const ins = options.filter(o => !p[offKey(o.id)]).map(o => o.id), score = {}, range = {};
    options.forEach(o => score[o.id] = {});
    for (const c of criteria){
      const log = !!c.log && !p.lin && options.every(o => o.cells[c.id].v > 0), f = v => log ? Math.log10(v) : v;
      const xs = ins.map(id => f(OPT[id].cells[c.id].v)), lo = Math.min(...xs), hi = Math.max(...xs), flat = !ins.length || hi - lo < EPS;
      range[c.id] = { lo, hi, flat, log };
      for (const o of options){ const x = f(o.cells[c.id].v);
        score[o.id][c.id] = p[offKey(o.id)] ? null : flat ? 0.5 : c.dir > 0 ? (x - lo) / (hi - lo) : (hi - x) / (hi - lo); }
    }
    return { ins, score, range };
  }
  // Totals = Σ w·score / Σ w (0–1), ranks (ties share a rank), first place and its status.
  function evaluate(p){
    const nm = normalise(p), wsum = criteria.reduce((a, c) => a + (+p[wKey(c.id)] || 0), 0), N = {}, total = {}, part = {};
    for (const id of nm.ins){ N[id] = 0; part[id] = {};
      for (const c of criteria){ const t = (+p[wKey(c.id)] || 0) * nm.score[id][c.id]; N[id] += t; part[id][c.id] = wsum > EPS ? t / wsum : 0; }
      total[id] = wsum > EPS ? N[id] / wsum : null; }
    const order = nm.ins.slice().sort((a, b) => N[b] - N[a]), rank = {};
    if (wsum > EPS) order.forEach(id => rank[id] = 1 + order.filter(j => N[j] > N[id] + EPS).length);
    const top = wsum > EPS ? order.filter(id => rank[id] === 1) : [];
    const status = !nm.ins.length ? 'none' : nm.ins.length === 1 ? 'single' : wsum <= EPS ? 'noweights' : top.length > 1 ? 'tie' : 'winner';
    const rowWin = {};
    for (const c of criteria){ const best = Math.max(...nm.ins.map(id => nm.score[id][c.id]));
      rowWin[c.id] = nm.range[c.id].flat ? [] : nm.ins.filter(id => nm.score[id][c.id] > best - EPS); }
    const winner = status === 'winner' ? top[0] : null, runner = winner ? order[1] : null;
    return { ...nm, wsum, N, total, part, order, rank, top, status, winner, runner, margin: winner ? total[winner] - total[runner] : null, rowWin };
  }
  // Sensitivity: move weight c alone to w'. Totals share one denominator, so the order is the order of N_j = Σ w·s_j,
  // and winner i loses to j where (N_i − N_j) + (w' − w_c)(s_ic − s_jc) = 0, i.e. w' = w_c + (N_i − N_j)/(s_jc − s_ic).
  // The nearest such w' each way is where first place flips. Up to the second-nearest one the first overtaker leads,
  // so the suggested value `act` is a round number inside that window, re-checked with evaluate().
  const ceil1 = x => { let a = Math.ceil(x * 10 - 1e-7) / 10; if (a <= x + 1e-9) a += 0.1; return Math.round(a * 10) / 10; };
  const floor1 = x => { let a = Math.floor(x * 10 + 1e-7) / 10; if (a >= x - 1e-9) a -= 0.1; return Math.round(a * 10) / 10; };
  function sensitivity(p, R){
    if (R.status !== 'winner') return { status: R.status, rows: {}, best: null };
    const i = R.winner, rows = {}; let best = null;
    for (const c of criteria){
      const w = +p[wKey(c.id)] || 0, ups = [], downs = [];
      for (const j of R.ins){ if (j === i) continue;
        const gap = R.N[i] - R.N[j], d = R.score[i][c.id] - R.score[j][c.id];
        if (d < -EPS) ups.push({ at: w + gap / -d, by: j }); else if (d > EPS) downs.push({ at: w - gap / d, by: j }); }
      ups.sort((a, b) => a.at - b.at); downs.sort((a, b) => b.at - a.at);
      const row = { w, up: null, down: null, beyond: null };
      const choose = (list, dir) => {
        const f = list[0], lim = list[1] ? list[1].at : dir > 0 ? Infinity : -Infinity, ok = v => dir > 0 ? v > f.at && v < lim && v <= wMax : v < f.at && v > lim && v >= 0;
        const cand = [dir > 0 ? ceil1(f.at + 0.04) : floor1(f.at - 0.04), dir > 0 ? ceil1(f.at) : floor1(f.at), dir > 0 ? wMax : 0,
          Math.round((f.at + (Number.isFinite(lim) ? lim : f.at + dir * 0.02)) / 2 * 100) / 100].find(ok);
        const act = cand !== undefined ? cand : Math.min(wMax, Math.max(0, Math.round((f.at + dir * 0.005) * 1000) / 1000));   // flips coincide
        const e = evaluate({ ...p, [wKey(c.id)]: act });
        return { at: f.at, first: f.by, act, by: e.status === 'winner' ? e.winner : null, tie: e.status === 'tie' ? e.top : null };
      };
      if (ups.length && ups[0].at < wMax - 1e-6) row.up = choose(ups, +1); else if (ups.length) row.beyond = ups[0];
      if (downs.length && downs[0].at > 1e-6) row.down = choose(downs, -1);
      for (const dir of ['up', 'down']) if (row[dir]){ const dist = Math.abs(row[dir].act - w);
        if (!best || dist < best.dist) best = { c: c.id, dir, dist, ...row[dir] }; }
      rows[c.id] = row;
    }
    return { status: 'winner', winner: i, rows, best };
  }
  // Each option's total as one weight sweeps 0..wMax with the others fixed (scores don't depend on weights).
  function sweep(p, R, cid, n = 101){
    const cur = +p[wKey(cid)] || 0;
    const at = (id, w) => { const ws = R.wsum - cur + w; return ws > EPS ? (R.N[id] + (w - cur) * R.score[id][cid]) / ws : NaN; };
    const series = R.ins.map(id => ({ id, points: IE_range(0, wMax, n).map(w => [w, at(id, w)]) }));
    const vals = series.flatMap(s => s.points.map(q => q[1])).filter(Number.isFinite);
    let lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 1;
    if (hi - lo < 0.1){ const m = (lo + hi) / 2; lo = m - 0.05; hi = m + 0.05; }
    const m = (hi - lo) * 0.08; lo = Math.max(0, lo - m); hi = Math.min(1, hi + m);
    return { cur, lo, hi, series, at, onlyThis: R.wsum - cur <= EPS };
  }
  const IE_range = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
  const name = id => OPT[id] ? OPT[id].label : String(id);
  const listNames = ids => ids.length <= 2 ? ids.map(name).join(' and ') : ids.slice(0, -1).map(name).join(', ') + ' and ' + name(ids[ids.length - 1]);
  const fmtW = v => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? v.toFixed(1) : String(+v.toFixed(3));
  function statusText(R){
    return R.status === 'winner' ? name(R.winner) : R.status === 'tie' ? 'a tie between ' + listNames(R.top)
      : R.status === 'noweights' ? 'nobody: no criteria weighted' : R.status === 'single' ? name(R.ins[0]) + ' (the only option in play)' : 'nobody: no options in play';
  }
  function sensText(cid, S, R){
    if (S.status !== 'winner') return S.status === 'tie' ? 'the top is already a tie, so there is no single winner to flip'
      : S.status === 'noweights' ? 'no criteria weighted: raise any weight to get a ranking' : 'nothing to compare';
    const c = CRIT[cid], r = S.rows[cid], lab = c.short + ' weight', parts = [];
    const then = f => f.by ? `${name(f.by)} wins` : `${listNames(f.tie)} tie for first`;
    if (r.up) parts.push(`raise the ${lab} from ${r.w.toFixed(1)} to ${fmtW(r.up.act)} and ${then(r.up)} (flip at ${r.up.at.toFixed(2)})`);
    if (r.down) parts.push(`${parts.length ? 'lower it' : 'lower the ' + lab} from ${r.w.toFixed(1)} to ${fmtW(r.down.act)} and ${then(r.down)} (flip at ${r.down.at.toFixed(2)})`);
    if (parts.length) return parts.join('; or ');
    return `no ${lab} from 0 to ${wMax} changes the winner` + (r.beyond ? ` (${name(r.beyond.by)} would need ${r.beyond.at.toFixed(1)})` : '');
  }
  const only = cid => criteria.map(c => `${wKey(c.id)}=${c.id === cid ? wMax : 0}`).join('; ');
  return {
    criteria, options, OPT, CRIT, wMax, balanced, wKey, offKey, real, illus, hasLog,
    weights: o => weights(o),
    // IE.app pieces: weight sliders, "leave out" toggles (+ linear scales), "only X" presets
    params: (o = {}) => criteria.map(c => ({ id: wKey(c.id), label: `<span class="cmp-sw" style="background:${IE.cssColor ? IE.cssColor(c.color) : c.color}"></span>${o.label ? o.label(c) : esc(c.label)}`,
      min: 0, max: wMax, step: o.step || 0.1, fmt: v => (+v).toFixed(1) })),
    toggles: (o = {}) => [...options.map(x => ({ id: offKey(x.id), label: (o.leaveOut || 'Leave out ') + esc(x.label) })),
      ...(hasLog ? [{ id: 'lin', label: o.linLabel || 'Score every criterion on a linear scale (ignore "log scale")' }] : [])],
    presets: (o = {}) => [{ key: 'balanced', label: o.balancedLabel || 'Balanced', set: { ...BAL } },
      ...criteria.map(c => ({ key: 'only_' + c.id, label: (o.onlyLabel || 'Only ') + c.short, set: weights({ [c.id]: wMax }) })), ...(o.extra || [])],
    normalise, evaluate, sensitivity, sweep, name, listNames, fmtW, statusText, sensText, only,
  };
}

/* ------------------------------------------------------------------ view (browser)
   hosts: element ids (or elements), each optional: { table, ranking, legend, minis, sens, sweep, sweepTitle, detail, selnav }
   opts:  { sweepHeight: 260, rowH: 34, onSelect(sel) }
   Selection (app.sel): 'o:<option>' | 'k:<criterion>' | 'c:<option>:<criterion>' (one cell) | null.
   Returns V: recompute(P, app), render(S), dyn(S), readout(S), stepBy(dir, app), focusCrit(sel), get R / S. */
function view(M, hosts = {}, opts = {}){
  const el = k => typeof hosts[k] === 'string' ? document.getElementById(hosts[k]) : hosts[k] || null;
  const H = Object.fromEntries(['table', 'ranking', 'legend', 'minis', 'sens', 'sweep', 'sweepTitle', 'detail', 'selnav'].map(k => [k, el(k)]));
  const { criteria: CR, options: OP, OPT, CRIT, wKey, offKey, wMax } = M;
  const ROW_H = opts.rowH || 34, f3 = v => v.toFixed(3);
  let app = null, P = null, R = null, S = null, PREV = null, shown = '', chart = null, built = false;
  const col = c => IE.cssColor(c.color);
  const parseSel = s => { if (typeof s !== 'string') return { o: null, k: null }; const [kind, a, b] = s.split(':');
    return kind === 'o' && OPT[a] ? { o: a, k: null } : kind === 'k' && CRIT[a] ? { o: null, k: a } : kind === 'c' && OPT[a] && CRIT[b] ? { o: a, k: b } : { o: null, k: null }; };
  const code = (o, k) => o && k ? `c:${o}:${k}` : o ? 'o:' + o : k ? 'k:' + k : null;
  const V = { M, parseSel, code, get R(){ return R; }, get S(){ return S; } };
  const select = s => { if (!app) return; app.setSel(s); opts.onSelect && opts.onSelect(s); };
  function pick(pk){
    const [kind, a, b] = pk.split(':'), cur = parseSel(app.sel);
    if ('ormt'.includes(kind)) select(code(a, null));
    else if (kind === 'k') select(code(null, a));
    else if (kind === 's') select(code(cur.o, a));
    else if (kind === 'c') select(code(a, b));
  }
  V.pick = pick;
  // ← → : along the row when a cell is selected, else to the next option / criterion (table order, cycling)
  V.stepBy = (dir, a) => { app = a || app; const s = parseSel(app.sel), oi = OP.map(o => o.id), ki = CR.map(c => c.id);
    const nx = (list, id) => list[((list.indexOf(id) + dir) % list.length + list.length) % list.length];
    select(s.o && s.k ? code(nx(oi, s.o), s.k) : s.k ? code(null, nx(ki, s.k)) : s.o ? code(nx(oi, s.o), null) : code(dir > 0 ? oi[0] : oi[oi.length - 1], null)); };
  V.focusCrit = sel => { const s = sel && typeof sel === 'object' ? sel : parseSel(sel); return CRIT[s.k] || (S && S.best && CRIT[S.best.c]) || CR[0]; };

  // ---- wiring (once): click and Enter/Space on every [data-pick]; rebuilt hosts keep keyboard focus
  const wire = host => { if (!host) return;
    host.addEventListener('click', e => { if (e.target.closest('button[data-set]')) return; const t = e.target.closest('[data-pick]'); if (t && host.contains(t)) pick(t.dataset.pick); });
    host.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; if (e.target.tagName === 'BUTTON') return;
      const t = e.target.closest('[data-pick]'); if (t){ e.preventDefault(); pick(t.dataset.pick); } }); };
  const rebuild = (host, html) => { if (!host) return; const a = document.activeElement, pk = a && host.contains(a) && a.dataset ? a.dataset.pick : null;
    host.innerHTML = html; if (pk){ const t = [...host.querySelectorAll('[data-pick]')].find(x => x.dataset.pick === pk); if (t) t.focus({ preventScroll: true }); } };
  function build(){
    built = true;
    ['table', 'ranking', 'minis', 'sens', 'detail'].forEach(k => wire(H[k]));
    if (H.ranking){ H.ranking.classList.add('cmp-rank'); H.ranking.style.height = OP.length * ROW_H + 'px';
      H.ranking.innerHTML = OP.map(o => `<div class="cmp-rrow" id="rr_${o.id}" data-pick="r:${o.id}" role="button" tabindex="0"><span class="cmp-rk" id="rrk_${o.id}"></span><span class="cmp-rname">${esc(o.label)}</span>` +
        `<span class="cmp-stack">${CR.map(c => `<i id="rs_${o.id}_${c.id}" style="background:${col(c)};width:0"></i>`).join('')}</span><span class="cmp-num" id="rt_${o.id}"></span></div>`).join(''); }
    if (H.legend) H.legend.classList.add('cmp-legend');
    if (H.legend) H.legend.innerHTML = CR.map(c => `<span><i style="background:${col(c)}"></i>${esc(c.short)}</span>`).join('');
    if (H.minis){ H.minis.classList.add('cmp-minis');
      H.minis.innerHTML = OP.map(o => `<div class="cmp-mini" id="mini_${o.id}" data-pick="m:${o.id}" role="button" tabindex="0"><div class="cmp-mhead"><b>${esc(o.label)}</b><span class="mut" id="mt_${o.id}"></span></div>` +
        CR.map(c => `<div class="cmp-mrow"><span>${esc(c.short)}</span><span class="cmp-track"><span class="cmp-mid"></span><span class="cmp-fill" id="mf_${o.id}_${c.id}" style="background:${col(c)};width:0"></span></span><span class="cmp-num" id="mn_${o.id}_${c.id}"></span></div>`).join('') + '</div>').join(''); }
    if (H.selnav){
      H.selnav.innerHTML = `<div class="cmp-selnav"><button type="button" class="btn" data-dir="-1" aria-label="Previous (←)">‹</button><span class="cur" aria-live="polite"></span><button type="button" class="btn" data-dir="1" aria-label="Next (→)">›</button></div>
        <div class="row" style="margin-top:6px"><button type="button" class="btn" data-set="sel=o:${OP[0].id}">Walk the options</button><button type="button" class="btn" data-set="sel=k:${CR[0].id}">Walk the criteria</button></div>`;
      H.selnav.addEventListener('click', e => { const b = e.target.closest('[data-dir]'); if (b){ app.pause && app.pause(); V.stepBy(+b.dataset.dir, app); } });
    }
    if (H.sweep){ H.sweep.classList.add('cmp-sweep');
      chart = IE.lineChart(H.sweep, { title: 'Weight sweep', height: opts.sweepHeight || 260, x: { min: 0, max: wMax }, y: { min: 0, max: 1 }, series: [],
        onPick: x => { if (!app) return; const c = V.focusCrit(app.sel), s = parseSel(app.sel);
          if (s.k !== c.id) app.setSel(code(s.o, c.id));
          app.set({ [wKey(c.id)]: IE.clamp(Math.round(x * 10) / 10, 0, wMax) }); } }); }
  }

  V.recompute = (p, a) => {
    P = p; if (a) app = a;
    const nr = M.evaluate(p);
    if (R && R.order.join() + R.status !== nr.order.join() + nr.status) PREV = { rank: { ...R.rank }, status: R.status };   // last rank change: ▲▼ marks
    R = nr; S = M.sensitivity(p, R);
  };

  // ---- table: options as columns, criteria as rows; raw value + 0–1 score; best per row; total and rank rows
  const rankText = id => P[offKey(id)] ? 'not in play' : R.rank[id] == null ? '–' : R.rank[id] + (R.order.filter(j => R.rank[j] === R.rank[id]).length > 1 ? '=' : '');
  const moveText = id => { if (!PREV || PREV.rank[id] == null || R.rank[id] == null || PREV.rank[id] === R.rank[id]) return '';
    const d = PREV.rank[id] - R.rank[id]; return d > 0 ? ` <span class="cmp-up" title="moved up ${d}">▲${d}</span>` : ` <span class="cmp-down" title="moved down ${-d}">▼${-d}</span>`; };
  const rawText = (o, c) => { const x = o.cells[c.id]; return (M.illus.any && !M.illus.all && x.illustrative ? '≈ ' : '') + c.fmt(x.v); };
  function renderTable(sel){
    const colCls = id => [P[offKey(id)] ? 'out' : '', sel.o === id ? 'selcol' : ''].join(' ');
    const badge = M.illus.all ? '<span class="badge illustrative">all values illustrative</span>' : M.illus.any ? '<span class="badge illustrative">≈ = illustrative</span>' : '';
    let h = `<table class="cmp"><caption class="sr-only">Options as columns, criteria as rows; each cell has the raw value and its 0 to 1 score</caption><thead><tr><th class="corner" scope="col">Criterion<br><span class="mut">weight · direction · scale</span>${badge ? '<br>' + badge : ''}</th>`;
    for (const o of OP) h += `<th scope="col" class="opt ${colCls(o.id)}${R.winner === o.id ? ' lead' : ''}" data-pick="o:${o.id}" tabindex="0" aria-selected="${sel.o === o.id && !sel.k}"><div class="oname">${esc(o.label)}</div><div class="mut">${esc(o.sub)}</div></th>`;
    h += '</tr></thead><tbody>';
    for (const c of CR){ const w = +P[wKey(c.id)], rg = R.range[c.id];
      h += `<tr class="${w === 0 ? 'zero' : ''}${sel.k === c.id ? ' selrow' : ''}"><th scope="row" data-pick="k:${c.id}" tabindex="0"><span class="cmp-sw" style="background:${col(c)}"></span>${esc(c.label)}` +
        `<div class="mut">w ${w.toFixed(1)} · ${c.dir > 0 ? 'higher' : 'lower'} is better${rg.log ? ' · log scale' : ''}${rg.flat ? ' · all equal' : ''}</div></th>`;
      for (const o of OP){ const s = R.score[o.id][c.id], win = R.rowWin[c.id].includes(o.id);
        h += `<td data-pick="c:${o.id}:${c.id}" tabindex="0" class="${colCls(o.id)}${win ? ' win' : ''}${sel.o === o.id && sel.k === c.id ? ' sel' : ''}"${win ? ' title="best in this row"' : ''}><div class="raw">${esc(rawText(o, c))}${win ? '<span class="sr-only"> (best in row)</span>' : ''}</div>` +
          (s == null ? '<div class="sc">not in play</div>' : `<div class="sc"><b><i style="width:${(s * 100).toFixed(1)}%;background:${col(c)}"></i></b>${s.toFixed(2)}</div>`) + '</td>'; }
      h += '</tr>'; }
    h += '<tr class="tot"><th scope="row">Weighted total<div class="mut">Σ w·score / Σ w</div></th>' + OP.map(o => { const t = R.total[o.id];
      return `<td data-pick="t:${o.id}" class="${colCls(o.id)}">${t == null ? (P[offKey(o.id)] ? 'not in play' : '–') : `<div class="raw">${f3(t)}</div><div class="sc"><b><i style="width:${(t * 100).toFixed(1)}%;background:var(--ink)"></i></b></div>`}</td>`; }).join('') + '</tr>';
    h += '<tr><th scope="row">Rank</th>' + OP.map(o => { const r = R.rank[o.id];
      return `<td class="${colCls(o.id)}">${r == null ? `<span class="mut">${rankText(o.id)}</span>` : `<span class="cmp-rk${r === 1 ? ' r1' : ''}">${rankText(o.id)}</span>${moveText(o.id)}`}</td>`; }).join('') + '</tr></tbody></table>';
    rebuild(H.table, `<div class="tablewrap">${h}</div>`);
  }
  // ---- ranking rows and small views: built once, updated in place so the CSS transitions animate the re-sort
  function updateViews(sel){
    if (H.ranking){ const seq = [...R.order, ...OP.map(o => o.id).filter(id => !R.order.includes(id))];
      seq.forEach((id, k) => { const row = document.getElementById('rr_' + id), t = R.total[id], r = R.rank[id];
        row.style.transform = `translateY(${k * ROW_H}px)`; row.classList.toggle('out', !!P[offKey(id)]); row.classList.toggle('sel', sel.o === id);
        row.setAttribute('aria-label', `${OPT[id].label}: rank ${rankText(id)}, total ${t == null ? 'none' : f3(t)}`);
        const rk = document.getElementById('rrk_' + id); rk.textContent = r == null ? '–' : rankText(id); rk.classList.toggle('r1', r === 1);
        document.getElementById('rt_' + id).textContent = t == null ? (P[offKey(id)] ? 'out' : '–') : f3(t);
        CR.forEach(c => document.getElementById(`rs_${id}_${c.id}`).style.width = (t == null ? 0 : R.part[id][c.id] * 100).toFixed(2) + '%'); }); }
    if (H.minis) OP.forEach(o => { const off = !!P[offKey(o.id)], m = document.getElementById('mini_' + o.id);
      m.classList.toggle('out', off); m.classList.toggle('sel', sel.o === o.id); m.classList.toggle('win', R.winner === o.id || (R.status === 'tie' && R.top.includes(o.id)));
      document.getElementById('mt_' + o.id).textContent = off ? 'not in play' : R.total[o.id] == null ? 'no total' : `#${rankText(o.id)} · ${f3(R.total[o.id])}`;
      CR.forEach(c => { const s = R.score[o.id][c.id], f = document.getElementById(`mf_${o.id}_${c.id}`);
        f.style.width = (s == null ? 0 : s * 100).toFixed(1) + '%'; f.style.opacity = +P[wKey(c.id)] === 0 ? 0.3 : 1;
        document.getElementById(`mn_${o.id}_${c.id}`).textContent = s == null ? '–' : s.toFixed(2); }); });
  }
  // ---- sensitivity in words, one line per criterion, with a "try" button at the nearest flip
  function renderSens(sel){
    if (!H.sens) return;
    if (S.status !== 'winner'){ rebuild(H.sens, `<p>First place: <b>${esc(M.statusText(R))}</b>. ${R.status === 'tie' ? 'With no single winner there is nothing to flip; change a weight on which the tied options differ.' : R.status === 'noweights' ? 'Raise any weight to get a ranking.' : 'Put at least two options in play to compare them.'}</p>`); return; }
    rebuild(H.sens, `<p class="mut" style="margin:0 0 6px">Winner now: <b>${esc(M.name(S.winner))}</b>, ${f3(R.margin)} ahead of ${esc(M.name(R.runner))}. Marked edge = the closest call.</p>` +
      CR.map(c => { const r = S.rows[c.id], near = r.up && r.down ? (Math.abs(r.up.act - r.w) <= Math.abs(r.down.act - r.w) ? r.up : r.down) : r.up || r.down;
        return `<div class="cmp-srow${sel.k === c.id ? ' sel' : ''}${S.best && S.best.c === c.id ? ' frag' : ''}" data-pick="s:${c.id}" role="button" tabindex="0"><span class="cmp-sw" style="background:${col(c)}"></span>` +
          `<span><b>${esc(c.short)}</b>: ${esc(M.sensText(c.id, S, R))}</span>${near ? `<button type="button" class="btn" data-set="${wKey(c.id)}=${near.act}" aria-label="Try ${esc(c.short)} weight ${M.fmtW(near.act)}">try</button>` : '<span></span>'}</div>`; }).join(''));
  }
  // ---- sweep: every option's total as the focused weight goes 0..wMax; flip points marked; click sets the weight
  function renderSweep(sel){
    if (!chart) return;
    const c = V.focusCrit(sel), sw = M.sweep(P, R, c.id), row = S.rows && S.rows[c.id];
    if (H.sweepTitle) H.sweepTitle.textContent = `Sweep one weight: ${c.short}`;
    const colOf = id => id === R.winner || (R.status === 'tie' && R.top.includes(id)) ? 'total' : id === sel.o ? 'accent' : 'muted';
    const series = sw.series.map(s => ({ id: s.id, label: OPT[s.id].short, color: colOf(s.id), width: colOf(s.id) === 'muted' ? 1.6 : 2.6, points: s.points }))
      .sort((a, b) => (a.color === 'muted' ? 0 : 1) - (b.color === 'muted' ? 0 : 1));
    // flip points: a dot where the winner is overtaken, named along the bottom on the side away from the cursor line
    const fl = row ? [row.up, row.down].filter(Boolean) : [];
    const marks = fl.map(f => ({ x: f.at, y: sw.at(S.winner, f.at), color: 'bad' }));
    const flipNotes = fl.map(f => { const left = (f.at <= sw.cur && f.at > wMax * 0.15) || f.at > wMax * 0.85;
      return { x: f.at + (left ? -0.06 : 0.06) * wMax / 10, y: sw.lo + (sw.hi - sw.lo) * 0.04, text: 'flip ' + f.at.toFixed(2), anchor: left ? 'end' : 'start' }; });
    const notes = flipNotes.concat(!R.ins.length ? [{ x: wMax / 2, y: (sw.lo + sw.hi) / 2, text: 'No options in play', anchor: 'middle' }]
      : sw.onlyThis ? [{ x: wMax / 2, y: sw.hi - (sw.hi - sw.lo) * 0.06, text: 'Only this weight is on: at 0 nothing is weighted', anchor: 'middle' }] : []);
    chart.set({ title: `Each option's total as the ${c.short} weight goes from 0 to ${wMax}`,
      summary: row ? M.sensText(c.id, S, R) : M.statusText(R), height: opts.sweepHeight || 260,
      x: { min: 0, max: wMax, ticks: IE.ticks(0, wMax, 5), fmt: v => String(+v.toFixed(1)), label: `${c.short} weight (others fixed)` },
      y: { min: sw.lo, max: sw.hi, fmt: v => v.toFixed(2) }, series, marks, notes,
      cursor: sw.cur, cursorLabel: 'now ' + sw.cur.toFixed(1) });
  }
  // ---- detail card: the selected option, criterion or cell, with each number's source note
  function renderDetail(sel){
    if (!H.detail) return;
    const o = OPT[sel.o], c = CRIT[sel.k], D = IE.D, DW = IE.DW, cite = id => IE.cite ? IE.cite(id) : '';
    if (!o && !c){ rebuild(H.detail, '<p>Click a column header, a cell, a ranking bar or a small chart to read that option\'s notes and where each number comes from. Click a criterion name to see how it is scored.</p>'); return; }
    const srcOf = x => (x.src ? ' ' + cite(x.src) : '') + (x.illustrative ? ' <span class="badge illustrative">illustrative</span>' : '');
    let h = '';
    if (o && c){ const x = o.cells[c.id];
      h += `<p class="cmp-note"><b>${esc(o.label)} · ${esc(c.label)}</b>: ${esc(c.fmt(x.v))}, score ${D(`n_${o.id}_${c.id}`)}${srcOf(x)}<br>Source note: ${esc(x.note || 'none given')}</p>`; }
    if (o){
      h += `<p><b>${esc(o.label)}</b> <span class="mut">${esc(o.sub)}</span> · total ${D('t_' + o.id)} · rank ${D('r_' + o.id)}</p>${o.notes ? `<p>${o.notes}</p>` : ''}`;
      if (o.pros.length || o.cons.length) h += `<div class="cmp-pc"><div><h5>Pros</h5><ul>${o.pros.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div><h5>Cons</h5><ul>${o.cons.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`;
      if (!c) h += '<h5>Where each number comes from</h5><div class="tablewrap"><table class="cmp-ev">' + CR.map(k => { const x = o.cells[k.id];
        return `<tr><td>${esc(k.short)}</td><td class="v">${esc(rawText(o, k))}</td><td class="n">${esc(x.note)}${srcOf(x)}</td></tr>`; }).join('') + '</table></div>';
      h += `<button type="button" class="btn" data-set="${offKey(o.id)}=${P[offKey(o.id)] ? 'false' : 'true'}">${P[offKey(o.id)] ? 'Put it back in play' : 'Take it out of the comparison'}</button>`;
    } else {
      const rg = R.range[c.id], win = R.rowWin[c.id];
      h += `<p><b>${esc(c.label)}</b> · weight ${D('w_' + c.id)}</p>${c.desc ? `<p>${c.desc}</p>` : ''}` +
        `<p>${c.dir > 0 ? 'Higher' : 'Lower'} is better. Score = min–max ${rg.log ? 'on log10(value)' : 'on the value'} across the options in play: ` +
        `${rg.flat ? 'all equal, so everyone gets 0.5 and it cannot change the ranking' : `the best gets 1, the worst 0. Best here: <b>${esc(M.listNames(win))}</b>`}.</p>` +
        `<p>How sure: ${DW('sens_' + c.id)}.</p><div class="row"><button type="button" class="btn" data-set="${M.only(c.id)}">Only this criterion</button><button type="button" class="btn" data-set="${wKey(c.id)}=0">Ignore it</button><button type="button" class="btn" data-set="${wKey(c.id)}=${M.balanced}">Weight ${M.balanced}</button></div>`;
    }
    rebuild(H.detail, h);
  }
  function renderSelnav(sel){
    if (!H.selnav) return; const cur = H.selnav.querySelector('.cur');
    cur.innerHTML = sel.o && sel.k ? `<b>${esc(OPT[sel.o].short)}</b> × <b>${esc(CRIT[sel.k].short)}</b> <span class="mut">(cell)</span>` : sel.o ? `<b>${esc(OPT[sel.o].label)}</b> <span class="mut">(option)</span>`
      : sel.k ? `<b>${esc(CRIT[sel.k].label)}</b> <span class="mut">(criterion)</span>` : '<span class="mut">nothing selected</span>';
  }
  V.render = ({ P: p, sel: s }) => {
    P = p; if (!built) build();
    const sel = parseSel(s), key = JSON.stringify(P) + '|' + s;
    if (key === shown) return; shown = key;
    if (H.table) renderTable(sel);
    updateViews(sel); renderSens(sel); renderSweep(sel); renderDetail(sel); renderSelnav(sel);
    for (const c of CR){ const sl = document.getElementById(wKey(c.id)); if (sl && sl.closest('.ctl')) sl.closest('.ctl').classList.toggle('cmp-zero', +P[wKey(c.id)] === 0); }
  };
  // every D('key') the module's own HTML uses, plus handy ones for step text
  V.dyn = () => {
    const v = { winner: M.statusText(R), runner: R.runner ? M.name(R.runner) : 'nobody', margin: R.margin == null ? 'no margin' : f3(R.margin),
      top_total: R.top.length ? f3(R.total[R.top[0]]) : 'no total' };
    OP.forEach(o => { v['t_' + o.id] = R.total[o.id] == null ? (P[offKey(o.id)] ? 'not in play' : 'no total') : f3(R.total[o.id]); v['r_' + o.id] = rankText(o.id);
      CR.forEach(c => { const s = R.score[o.id][c.id]; v[`raw_${o.id}_${c.id}`] = c.fmt(o.cells[c.id].v); v[`n_${o.id}_${c.id}`] = s == null ? 'not in play' : s.toFixed(2); }); });
    CR.forEach(c => { v['w_' + c.id] = (+P[wKey(c.id)]).toFixed(1); v['sens_' + c.id] = M.sensText(c.id, S, R); });
    v.sens_best = S.best ? M.sensText(S.best.c, S, R) : S.status === 'winner' ? `no single weight change from 0 to ${wMax} changes the winner` : M.sensText(CR[0].id, S, R);
    // how far the nearest flip is: one weight moved this much (on the 0..wMax scale) changes first place
    v.flip_dist = S.best ? Math.abs(S.best.at - (+P[wKey(S.best.c)])).toFixed(2) : S.status === 'winner' ? 'no flip' : '–';
    v.flip_crit = S.best ? CRIT[S.best.c].short : S.status === 'winner' ? 'no single weight' : '–';
    return v;
  };
  V.readout = () => { const d = V.dyn();
    return R.status === 'winner' ? `First: <b>${esc(d.winner)}</b> ${d.top_total} · second: ${esc(d.runner)} (gap <b>${d.margin}</b>) · closest call: ${esc(d.sens_best)}` : `First place: <b>${esc(d.winner)}</b>`; };
  return V;
}

IE.compare = { model, view };
if (typeof module === 'object' && module.exports) module.exports = IE.compare;
})();
