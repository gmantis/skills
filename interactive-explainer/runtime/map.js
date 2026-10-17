/* interactive-explainer runtime: map.js (IE.map) — the "where" shape. Inlined by scripts/build.js; edit here, never in
   a built page. Guide: shapes/map.md. Pure geography helpers (decode, projections, fit, area, distance, point-in-polygon,
   class breaks) work in Node too (set globalThis.IE = {} first); IE.map.view needs the DOM and core.js.
   World geometry comes from <script data-ie="geo-world110m"></script> (IE.geo.world110m); finer data from a page file.
   Natural Earth I formulas follow d3-geo (ISC, Mike Bostock; projection by Šavrič, Patterson, Jenny). */
(function(root){
'use strict';
const IE = root.IE || (root.IE = {});
const M = IE.map = {};
const RAD = Math.PI / 180, DEG = 180 / Math.PI, R_KM = 6371.0088, MERC_MAX = 85 * RAD;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- TopoJSON -> GeoJSON
/* IE.map.decode(topology, objectName) -> FeatureCollection. Handles quantized (delta-encoded) arcs, Polygon,
   MultiPolygon, LineString, MultiLineString, Point, MultiPoint. Feature id = geometry id, else properties.name. */
M.decode = (topo, name) => {
  const tf = topo.transform, sx = tf ? tf.scale[0] : 1, sy = tf ? tf.scale[1] : 1, tx = tf ? tf.translate[0] : 0, ty = tf ? tf.translate[1] : 0;
  const arcs = topo.arcs.map(a => { let x = 0, y = 0; return a.map(p => { if (!tf) return [p[0], p[1]]; x += p[0]; y += p[1]; return [x * sx + tx, y * sy + ty]; }); });
  const arc = i => i < 0 ? arcs[~i].slice().reverse() : arcs[i];
  const line = idx => { const out = []; idx.forEach((i, k) => { const a = arc(i); for (let j = k ? 1 : 0; j < a.length; j++) out.push(a[j]); }); return out; };
  const pt = p => tf ? [p[0] * sx + tx, p[1] * sy + ty] : [p[0], p[1]];
  const geom = g => {
    switch (g.type){
      case 'Polygon': return { type: g.type, coordinates: g.arcs.map(line) };
      case 'MultiPolygon': return { type: g.type, coordinates: g.arcs.map(p => p.map(line)) };
      case 'LineString': return { type: g.type, coordinates: line(g.arcs) };
      case 'MultiLineString': return { type: g.type, coordinates: g.arcs.map(line) };
      case 'Point': return { type: g.type, coordinates: pt(g.coordinates) };
      case 'MultiPoint': return { type: g.type, coordinates: g.coordinates.map(pt) };
      default: return null;
    }
  };
  const obj = topo.objects[name || Object.keys(topo.objects)[0]];
  if (!obj) throw new Error('IE.map.decode: no object ' + name + ' (have ' + Object.keys(topo.objects).join(', ') + ')');
  const gs = obj.type === 'GeometryCollection' ? obj.geometries : [obj];
  return { type: 'FeatureCollection', features: gs.map(g => ({ type: 'Feature', id: g.id != null ? String(g.id) : (g.properties && g.properties.name) || null,
    properties: { ...(g.properties || {}) }, geometry: geom(g) })) };
};
let WORLD = null;
/* IE.map.world() -> the vendored 110m countries (cached), each with properties.name and properties.a3 (ISO alpha-3). */
M.world = () => {
  if (WORLD) return WORLD;
  const T = IE.geo && IE.geo.world110m; if (!T) throw new Error('IE.map.world: add <script data-ie="geo-world110m"></script> before the page script');
  WORLD = M.decode(T, 'countries'); WORLD.features.forEach(f => { f.properties.a3 = (T.a3 || {})[f.id] || null; });
  return WORLD;
};
/* Polygons of a feature as [[ring, ...], ...] (lon/lat), whatever its geometry type. */
M.polys = f => { const g = f.geometry || f; return !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; };
M.bbox = f => { let w = 180, s = 90, e = -180, n = -90;
  for (const p of M.polys(f)) for (const r of p) for (const [x, y] of r){ if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [[w, s], [e, n]]; };

// ---------------------------------------------------------------- spherical helpers (km, degrees)
M.R = R_KM;
M.distance = (a, b) => { const p1 = a[1] * RAD, p2 = b[1] * RAD, dp = p2 - p1, dl = (b[0] - a[0]) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h))); };
/* initial bearing a -> b in degrees clockwise from north */
M.bearing = (a, b) => { const p1 = a[1] * RAD, p2 = b[1] * RAD, dl = (b[0] - a[0]) * RAD;
  return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * DEG + 360) % 360; };
const xyz = ([l, p]) => [Math.cos(p * RAD) * Math.cos(l * RAD), Math.cos(p * RAD) * Math.sin(l * RAD), Math.sin(p * RAD)];
/* n points along the great circle a -> b (slerp) */
M.gc = (a, b, n = 32) => { const A = xyz(a), B = xyz(b), w = Math.acos(clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1)), out = [];
  for (let i = 0; i < n; i++){ const t = i / (n - 1); if (w < 1e-9){ out.push([a[0], a[1]]); continue; }
    const ka = Math.sin((1 - t) * w) / Math.sin(w), kb = Math.sin(t * w) / Math.sin(w), x = ka * A[0] + kb * B[0], y = ka * A[1] + kb * B[1], z = ka * A[2] + kb * B[2];
    out.push([Math.atan2(y, x) * DEG, Math.atan2(z, Math.hypot(x, y)) * DEG]); }
  return out; };
/* area of a ring in km² on the sphere (unsigned): sum (l2-l1)(2+sin p1+sin p2) R²/2 */
const ringArea = r => { let s = 0; for (let i = 0; i < r.length; i++){ const a = r[i], b = r[(i + 1) % r.length];
  s += (b[0] - a[0]) * RAD * (2 + Math.sin(a[1] * RAD) + Math.sin(b[1] * RAD)); } return Math.abs(s) * R_KM * R_KM / 2; };
/* IE.map.area(feature) -> km² (first ring of each polygon is the outline, the others are holes) */
M.area = f => M.polys(f).reduce((s, p) => s + ringArea(p[0]) - p.slice(1).reduce((h, r) => h + ringArea(r), 0), 0);
const inRing = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++){ const [xi, yi] = r[i], [xj, yj] = r[j];
  if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
/* IE.map.contains(feature, [lon, lat]) — planar even-odd test in lon/lat (fine away from the poles and the antimeridian) */
M.contains = (f, [x, y]) => M.polys(f).some(p => { let c = false; for (const r of p) if (inRing(r, x, y)) c = !c; return c; });
/* IE.map.locate(features, [lon, lat]) -> the feature containing the point, or null */
M.locate = (fc, pt) => (fc.features || fc).find(f => M.contains(f, pt)) || null;

// ---------------------------------------------------------------- projections and fit
const NE = {
  fwd(l, p){ const p2 = p * p, p4 = p2 * p2;
    return [l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
      p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))]; },
  inv(x, y){ let p = y, i = 25, d;
    do { const p2 = p * p, p4 = p2 * p2;
      p -= d = (p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))) - y) /
        (1.007226 + p2 * (0.015085 * 3 + p4 * (-0.044475 * 7 + 0.028874 * 9 * p2 - 0.005916 * 11 * p4)));
    } while (Math.abs(d) > 1e-12 && --i > 0);
    const p2 = p * p; return [x / (0.8707 + p2 * (-0.131979 + p2 * (-0.013791 + p2 * p2 * p2 * (0.003971 - 0.001529 * p2)))), p]; },
};
/* raw projections on radians: fwd(lon, lat) -> [x, y] (y up), inv(x, y) -> [lon, lat] */
M.projections = {
  equirect: { label: 'Equirectangular', fwd: (l, p) => [l, p], inv: (x, y) => [x, y] },
  mercator: { label: 'Mercator', fwd: (l, p) => [l, Math.log(Math.tan(Math.PI / 4 + clamp(p, -MERC_MAX, MERC_MAX) / 2))], inv: (x, y) => [x, 2 * Math.atan(Math.exp(y)) - Math.PI / 2] },
  naturalEarth: { label: 'Natural Earth I', fwd: NE.fwd, inv: NE.inv },
};
M.REGIONS = { world: [[-180, -57], [180, 83]] };
/* IE.map.fit(name, bounds [[w,s],[e,n]], W, H, pad=12) -> { project([lon,lat]) -> [x,y] px, invert([x,y]) -> [lon,lat] | null,
   scale, name, bounds }. The bounds box (sampled along its edges) is scaled to fit W x H and centred. */
M.fit = (name, bounds, W, H, pad = 12) => {
  const P = M.projections[name] || M.projections.naturalEarth, [[w, s], [e, n]] = bounds;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i <= 24; i++){ const t = i / 24, lon = w + (e - w) * t, lat = s + (n - s) * t;
    for (const [l, p] of [[lon, s], [lon, n], [w, lat], [e, lat]]){ const [x, y] = P.fwd(l * RAD, p * RAD); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
  const k = Math.min((W - 2 * pad) / (x1 - x0 || 1e-9), (H - 2 * pad) / (y1 - y0 || 1e-9)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { name, bounds, W, H, scale: k, cx, cy, aspect: (y1 - y0) / (x1 - x0 || 1e-9),
    project: ([lon, lat]) => { const [x, y] = P.fwd(lon * RAD, lat * RAD); return [W / 2 + (x - cx) * k, H / 2 - (y - cy) * k]; },
    invert: ([px, py]) => { const [l, p] = P.inv((px - W / 2) / k + cx, cy - (py - H / 2) / k); const lon = l * DEG, lat = p * DEG;
      return isFinite(lon) && isFinite(lat) && Math.abs(lon) <= 180 + 1e-9 && Math.abs(lat) <= 90 ? [lon, lat] : null; } };
};
/* projected height/width ratio of a bounds box (for sizing a map so the region fills it) */
M.aspect = (name, bounds) => M.fit(name, bounds, 1000, 1000, 0).aspect;

// ---------------------------------------------------------------- values -> classes and colours
/* IE.map.breaks(values, n=5, method='nice'|'quantile'|'equal') -> thresholds (n-1 or fewer, ascending) */
M.breaks = (vals, n = 5, method = 'nice') => {
  const v = vals.filter(isFinite).sort((a, b) => a - b); if (!v.length) return [];
  if (method === 'quantile'){ const out = []; for (let i = 1; i < n; i++){ const q = v[Math.min(v.length - 1, Math.floor(i / n * v.length))]; if (!out.length || q > out[out.length - 1]) out.push(q); } return out; }
  const lo = method === 'nice' && v[0] >= 0 ? 0 : v[0], hi = v[v.length - 1]; if (hi <= lo) return [];
  const st = method === 'nice' && IE.niceStep ? IE.niceStep(hi - lo, n) : (hi - lo) / n, out = [];
  for (let i = 1; i < n; i++){ const b = lo + st * i; if (b < hi) out.push(+b.toPrecision(12)); }
  return out;
};
const SEQ = { 1: ['seq2'], 2: ['seq2', 'seq4'], 3: ['seq1', 'seq3', 'seq5'], 4: ['seq1', 'seq2', 'seq4', 'seq5'], 5: ['seq1', 'seq2', 'seq3', 'seq4', 'seq5'] };
const mix = (c, pct) => `color-mix(in srgb, var(--${c}) ${pct}%, var(--div0))`;
const MID = 'color-mix(in srgb, var(--ink) 15%, var(--panel))';   // neutral grey, darker than the no-data fill (--btn) in both themes
const DIV = { 3: ['var(--s2)', MID, 'var(--s1)'], 5: ['var(--s2)', mix('s2', 45), MID, mix('s1', 45), 'var(--s1)'],
  7: ['var(--s2)', mix('s2', 65), mix('s2', 32), MID, mix('s1', 32), mix('s1', 65), 'var(--s1)'] };
/* IE.map.scale({ type:'seq'|'div', values:[...], n:5, breaks, method, mid:0, fmt }) -> { color(v), classes:[{lo,hi,color,label}], breaks, type }
   seq: n <= 5 classes on seq1..seq5 (low = close to the background in both themes). div: 3/5/7 classes, warm (s2) below
   `mid`, cool (s1) above, neutral div0 around it; breaks default to a symmetric nice split of max |v - mid|. */
M.scale = (o = {}) => {
  const fmt = o.fmt || (v => IE.fmt ? IE.fmt.num(v, Math.abs(v) < 10 ? 1 : 0) : String(v));
  let br, cols;
  if (o.type === 'div'){
    const n = [3, 5, 7].includes(o.n) ? o.n : 5, mid = o.mid || 0, h = (n - 1) / 2;
    if (o.breaks) br = o.breaks.slice(); else {
      const m = Math.max(...(o.values || [1]).filter(isFinite).map(v => Math.abs(v - mid)), 1e-9), st = IE.niceStep ? IE.niceStep(m, h + 0.5) : m / (h + 0.5);
      const pos = []; for (let i = 1; i <= h; i++) pos.push(+(mid + st * i).toPrecision(12));   // neutral class = mid ± one step
      br = [...pos.map(b => 2 * mid - b).reverse(), ...pos];
    }
    cols = DIV[n];
  } else {
    br = o.breaks ? o.breaks.slice() : M.breaks(o.values || [], o.n || 5, o.method || 'nice');
    cols = SEQ[Math.min(5, br.length + 1)].map(c => `var(--${c})`);
  }
  const classes = cols.map((c, i) => ({ lo: i ? br[i - 1] : -Infinity, hi: i < br.length ? br[i] : Infinity, color: c }));
  classes.forEach((c, i) => { c.label = i === 0 ? (br.length ? '< ' + fmt(c.hi) : 'all') : i === classes.length - 1 ? '≥ ' + fmt(c.lo) : fmt(c.lo) + (c.lo < 0 ? ' to ' : '–') + fmt(c.hi); });
  return { type: o.type || 'seq', breaks: br, classes, fmt,
    color: v => { if (v == null || !isFinite(v)) return null; let i = 0; while (i < br.length && v >= br[i]) i++; return cols[i]; } };
};
/* ids sorted by value, largest first (non-finite values dropped) — the order ← → cycles through */
M.order = (values, dir = -1) => Object.keys(values).filter(k => isFinite(values[k])).sort((a, b) => dir * (values[a] - values[b]) || (a < b ? -1 : 1));
/* next id in `order` after `cur` (wraps); unknown cur -> first */
M.cycle = (order, cur, dir = 1) => { if (!order.length) return cur; const i = order.indexOf(cur); return i < 0 ? order[dir > 0 ? 0 : order.length - 1] : order[(i + dir + order.length) % order.length]; };

// ---------------------------------------------------------------- the view (DOM)
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, a, parent) => IE.svg ? IE.svg(tag, a, parent) : (() => { const e = document.createElementNS(NS, tag); for (const k in a) if (a[k] != null && a[k] !== false) k === 'text' ? e.textContent = a[k] : e.setAttribute(k, a[k]); if (parent) parent.appendChild(e); return e; })();
const css = c => /[(#]/.test(String(c)) ? c : IE.cssColor ? IE.cssColor(c) : c;   // 's2' | 'ink' -> var(--…); '#hex', var(), color-mix() as given
// A ring that crosses the antimeridian (Russia, Fiji, Antarctica) jumps from +180 to -180. Start it just after a jump
// and begin a new closed subpath at every jump, so each side closes along the map edge instead of a stripe across it.
const ringD = (r, project, minD = 0.45) => {
  let k = -1; for (let i = 1; i < r.length; i++) if (Math.abs(r[i][0] - r[i - 1][0]) > 180){ k = i; break; }
  const R = k < 0 ? r : r.slice(k).concat(r.slice(1, k));   // r is closed (last = first): drop the duplicate when rotating
  let d = '', sub = '', lx = NaN, ly = NaN, n = 0;
  const flush = () => { if (n > 2) d += sub + 'Z'; sub = ''; n = 0; };
  for (let i = 0; i < R.length; i++){
    if (i && Math.abs(R[i][0] - R[i - 1][0]) > 180) flush();
    const [x, y] = project(R[i]); if (!isFinite(x) || !isFinite(y)) continue;
    if (n && i < R.length - 1 && Math.abs(x - lx) < minD && Math.abs(y - ly) < minD) continue;
    sub += (n ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1); lx = x; ly = y; n++; }
  flush(); return d; };
const lineD = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');

/* IE.map.view(host, spec) -> map. spec (all optional except what you draw):
   { title, summary, features (FeatureCollection | [features]; default IE.map.world()), projection: 'naturalEarth'|'mercator'|'equirect',
     bounds: [[w,s],[e,n]] | 'world' | [ids] (fit), height | (minHeight 220, maxHeight 560, from the bounds' aspect), pad,
     values: { id|a3|name: number }, scale: IE.map.scale(...) | { type, n, breaks, method, mid, fmt }, fill: id => css (categorical; ≤ 3 colours),
     legend: { title, items: [{ swatch|line|arrow|circle: css, label }] } | false, names: { id: 'label' },
     selected: id, onPick: (id, kind) => …, pickable: id => bool (default: has a value), labels: [ids] (default: ids with values),
     labelAt: { id: [lon, lat] }, graticule: true | degrees,
     symbols: [{ id, lon, lat, value, color, label, pick }], symbolMax: 22 (px radius at the largest value), symbolRef: value,
     points:  [{ id, lon, lat, label, color, r, pick }],
     flows:   [{ id, from: [lon,lat], to: [lon,lat], value, color, label, bend: 0.18 }], flowMax: 9 (px), flowRef: value,
     field:   { at: (lon, lat) => [u east, v north] | null, spacing: 44 (px), ref: 5 (speed for a full-length arrow), color: 'muted' } }
   map.set(patch) redraws only what the patch touches (geometry, colours, overlays or the selection);
   map.zoomTo(bounds | ids | 'world') animates (jumps under reduced motion). Clickable countries/symbols/points get data-pick,
   tabindex=0, role=button, Enter/Space. map.project, map.invert, map.feature(id), map.resolve(id), map.name(id), map.el. */
M.view = (host, spec) => {
  const leg = document.createElement('div'); leg.className = 'ie-map-legend'; host.appendChild(leg);
  const root = svg('svg', { class: 'ie-map', role: 'img' }); host.appendChild(root);
  const title = svg('title', {}, root);
  const clipId = 'mc' + Math.random().toString(36).slice(2, 8), defs = svg('defs', {}, root), clipR = svg('rect', { x: 0, y: 0 }, svg('clipPath', { id: clipId }, defs));
  const frame = svg('g', { 'clip-path': `url(#${clipId})` }, root), all = svg('g', { class: 'ie-map-zoom' }, frame);
  const sea = svg('rect', { class: 'sea', x: 0, y: 0 }, all), grat = svg('path', { class: 'grat' }, all);
  const gLand = svg('g', { class: 'land' }, all), gSel = svg('g', { class: 'selg' }, all), gField = svg('g', { class: 'fieldg' }, all),
    gFlow = svg('g', { class: 'flows' }, all), gSym = svg('g', { class: 'syms' }, all), gPt = svg('g', { class: 'pts' }, all), gLab = svg('g', { class: 'labels' }, frame);
  let S = {}, F = null, idx = new Map(), alias = new Map(), PR = null, W = 0, H = 0, geoKey = '', paths = new Map(), vals = {}, sc = null, anim = 0, anchors = new Map();
  const m = { el: root, legend: leg, get proj(){ return PR; }, get spec(){ return S; } };

  const feats = () => (S.features ? (S.features.features || S.features) : M.world().features);
  const index = () => { idx = new Map(); alias = new Map(); for (const f of F){ const id = String(f.id); idx.set(id, f);
    for (const k of [f.properties.a3, f.properties.name]) if (k) alias.set(String(k).toLowerCase(), id);
    if (/^\d+$/.test(id)) alias.set('#' + (+id), id); } };
  m.resolve = id => { if (id == null) return null; const s = String(id); if (idx.has(s)) return s;
    return alias.get(s.toLowerCase()) || (/^\d+$/.test(s) ? alias.get('#' + (+s)) : null) || null; };
  m.feature = id => idx.get(m.resolve(id)) || null;
  m.name = id => { const r = m.resolve(id), f = r && idx.get(r); return (S.names && (S.names[id] || S.names[r] || (f && S.names[f.properties.a3]))) || (f && f.properties.name) || String(id); };
  m.project = p => PR ? PR.project(p) : [NaN, NaN];
  m.invert = p => PR ? PR.invert(p) : null;
  const boundsOf = b => { if (!b || b === 'world') return M.REGIONS.world; if (typeof b === 'string') return M.REGIONS[b] || boundsOf([b]);
    if (typeof b[0] === 'number' || typeof b[0][0] === 'number') return b;
    let w = 180, s = 90, e = -180, n = -90; for (const id of b){ const f = m.feature(id); if (!f) continue; const [[a, c], [d, g]] = M.bbox(f); w = Math.min(w, a); s = Math.min(s, c); e = Math.max(e, d); n = Math.max(n, g); }
    const dx = (e - w) * 0.08 + 0.5, dy = (n - s) * 0.08 + 0.5; return w > e ? M.REGIONS.world : [[w - dx, s - dy], [e + dx, n + dy]]; };
  const sizeOf = () => { const w = Math.max(260, host.clientWidth || 600), B = boundsOf(S.bounds);
    const h = S.height || Math.round(clamp(w * M.aspect(S.projection || 'naturalEarth', B), S.minHeight || 220, Math.min(S.maxHeight || 560, w * 1.15))); return [w, h, B]; };

  // ---- geometry: country paths (rebuilt per size / projection / bounds / features)
  const buildGeo = () => {
    const [w, h, B] = sizeOf(); W = w; H = h; PR = M.fit(S.projection || 'naturalEarth', B, W, H, S.pad ?? 10);
    for (const e of [root]){ e.setAttribute('viewBox', `0 0 ${W} ${H}`); e.setAttribute('width', W); e.setAttribute('height', H); }
    clipR.setAttribute('width', W); clipR.setAttribute('height', H); sea.setAttribute('width', W); sea.setAttribute('height', H);
    gLand.replaceChildren(); paths = new Map(); anchors = new Map();
    for (const f of F){ const d = M.polys(f).map(p => p.map(r => ringD(r, PR.project)).join('')).join(''); if (!d) continue;
      const p = svg('path', { d, class: 'cty', 'data-id': f.id }, gLand); paths.set(String(f.id), p);
      const b = p.getBBox ? p.getBBox() : null; if (b && (b.x > W || b.y > H || b.x + b.width < 0 || b.y + b.height < 0)) p.classList.add('off'); }   // off-view: display:none (kept for zoom-out animation)
    // graticule: 5/10/30 degree lines across the visible bounds
    const span = Math.max(B[1][0] - B[0][0], B[1][1] - B[0][1]), st = typeof S.graticule === 'number' ? S.graticule : span > 120 ? 30 : span > 40 ? 10 : span > 12 ? 5 : 1;
    let gd = ''; if (S.graticule !== false){ const lo = Math.max(-180, Math.floor(B[0][0] / st) * st - st), hi = Math.min(180, Math.ceil(B[1][0] / st) * st + st), la = Math.max(-85, Math.floor(B[0][1] / st) * st - st), lb = Math.min(85, Math.ceil(B[1][1] / st) * st + st);
      for (let x = lo; x <= hi; x += st){ const pts = []; for (let y = la; y <= lb; y += (lb - la) / 40) pts.push(PR.project([x, y])); gd += lineD(pts); }
      for (let y = la; y <= lb; y += st){ const pts = []; for (let x = lo; x <= hi; x += (hi - lo) / 80) pts.push(PR.project([x, y])); gd += lineD(pts); } }
    grat.setAttribute('d', gd);
    geoKey = [W, H, S.projection, JSON.stringify(B), F.length].join('|');
  };
  // ---- colours, pickability, aria labels
  const paint = () => {
    vals = {}; for (const k in S.values || {}){ const r = m.resolve(k); if (r != null) vals[r] = S.values[k]; }
    sc = S.values ? (S.scale && S.scale.color ? S.scale : M.scale({ ...(S.scale || {}), values: Object.values(vals) })) : null;
    const fmt = (sc && sc.fmt) || (v => String(v));
    for (const [id, p] of paths){ const v = vals[id], fill = S.fill ? S.fill(id) : sc ? sc.color(v) : null;
      p.style.fill = fill ? css(fill) : '';
      p.classList.toggle('nodata', !fill);
      const pick = S.onPick && (S.pickable ? S.pickable(id) : v != null && isFinite(v));
      if (pick){ p.setAttribute('data-pick', id); p.setAttribute('tabindex', '0'); p.setAttribute('role', 'button');
        p.setAttribute('aria-label', m.name(id) + (v != null && isFinite(v) ? ': ' + fmt(v) + (S.unit ? ' ' + S.unit : '') : '')); }
      else { p.removeAttribute('data-pick'); p.removeAttribute('tabindex'); p.removeAttribute('role'); p.removeAttribute('aria-label'); } }
    drawLegend();
  };
  const drawLegend = () => {
    if (S.legend === false){ leg.innerHTML = ''; return; }
    const L = S.legend || {}, items = [];
    if (sc && !S.fill) items.push(`<span class="cls">${sc.classes.map(c => `<span class="it"><i class="sw" style="background:${c.color}"></i>${IE.esc ? IE.esc(c.label) : c.label}</span>`).join('')}</span>`);
    if (S.values) items.push(`<span class="it"><i class="sw nodata"></i>no data</span>`);
    for (const it of L.items || []){
      const sw = it.circle ? `<svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="7" style="fill:${css(it.circle)};fill-opacity:.35;stroke:${css(it.circle)}"/></svg>`
        : it.arrow ? `<svg width="26" height="12" aria-hidden="true"><path d="M2,6L20,6M15,2L21,6L15,10" style="fill:none;stroke:${css(it.arrow)};stroke-width:1.6"/></svg>`
        : it.line ? `<svg width="26" height="12" aria-hidden="true"><path d="M2,6L24,6" style="stroke:${css(it.line)};stroke-width:3"/></svg>`
        : it.dot ? `<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" style="fill:${css(it.dot)}"/></svg>`
        : `<i class="sw" style="background:${css(it.swatch || 'muted')}"></i>`;
      items.push(`<span class="it">${sw}${IE.esc ? IE.esc(it.label) : it.label}</span>`); }
    leg.innerHTML = (L.title ? `<b>${IE.esc ? IE.esc(L.title) : L.title}</b>` : '') + items.join('');
  };
  // ---- overlays: field, flows, symbols, points
  const drawField = () => { gField.replaceChildren(); const fd = S.field; if (!fd || !fd.at) return;
    const sp = fd.spacing || 44, ref = fd.ref || 5; let d = '';
    for (let y = sp / 2; y < H; y += sp) for (let x = sp / 2; x < W; x += sp){
      const ll = PR.invert([x, y]); if (!ll) continue; const uv = fd.at(ll[0], ll[1]); if (!uv) continue;
      const sp2 = Math.hypot(uv[0], uv[1]); if (sp2 < 1e-9) continue;
      const e = 0.05, q = PR.project([ll[0] + e * uv[0] / sp2 / Math.max(0.05, Math.cos(ll[1] * RAD)), ll[1] + e * uv[1] / sp2]), dx = q[0] - x, dy = q[1] - y, n = Math.hypot(dx, dy) || 1;
      const L = Math.min(0.9, sp2 / ref) * sp * 0.8, ux = dx / n, uy = dy / n, x0 = x - ux * L / 2, y0 = y - uy * L / 2, x1 = x + ux * L / 2, y1 = y + uy * L / 2, hl = Math.min(6, L * 0.4);
      d += `M${x0.toFixed(1)},${y0.toFixed(1)}L${x1.toFixed(1)},${y1.toFixed(1)}M${(x1 - ux * hl - uy * hl * 0.55).toFixed(1)},${(y1 - uy * hl + ux * hl * 0.55).toFixed(1)}L${x1.toFixed(1)},${y1.toFixed(1)}L${(x1 - ux * hl + uy * hl * 0.55).toFixed(1)},${(y1 - uy * hl - ux * hl * 0.55).toFixed(1)}`; }
    svg('path', { class: 'field', d, style: `stroke:${css(fd.color || 'muted')}` }, gField); };
  const shrink = () => clamp(W / 900, 0.6, 1);   // symbols and flow widths shrink on narrow maps (phones) so they stay in proportion
  const pickAttrs = (o, kind) => o.pick != null ? { 'data-pick': o.pick, tabindex: 0, role: 'button', 'aria-label': o.aria || o.label || String(o.pick), 'data-kind': kind } : {};
  const drawFlows = () => { gFlow.replaceChildren(); const fl = S.flows || []; if (!fl.length) return;
    const ref = S.flowRef || Math.max(...fl.map(f => Math.abs(f.value ?? 1)), 1e-9), mx = (S.flowMax || 9) * shrink();
    for (const f of fl){ const w = Math.max(1, mx * Math.min(1, Math.abs(f.value ?? ref) / ref)), col = css(f.color || 's2');
      let pts = M.gc(f.from, f.to, 28).map(PR.project); const a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < 3) continue; const bend = f.bend ?? 0.18, nx = -dy / len, ny = dx / len;
      pts = pts.map((p, i) => { const t = i / (pts.length - 1), o = bend * len * 4 * t * (1 - t) / 2; return [p[0] + nx * o, p[1] + ny * o]; });
      // trim the end so the head stops short of the target marker
      let trim = (f.trim ?? 7) + w * 1.2, k = pts.length - 1; while (k > 1 && trim > 0){ const s = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); if (s > trim){ const r = (s - trim) / s; pts[k] = [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * r, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * r]; break; } trim -= s; pts.pop(); k--; }
      const e = pts[pts.length - 1], p = pts[pts.length - 2], ex = e[0] - p[0], ey = e[1] - p[1], el = Math.hypot(ex, ey) || 1, ux = ex / el, uy = ey / el, hl = 5 + w * 0.9, hw = 3 + w * 0.6;
      const body = pts.slice(0, -1).concat([[e[0] - ux * hl * 0.8, e[1] - uy * hl * 0.8]]);
      const g = svg('g', { class: 'flow', ...pickAttrs(f, 'flow') }, gFlow);
      svg('path', { d: lineD(body), style: `stroke:${col};stroke-width:${w.toFixed(1)}` }, g);
      svg('path', { class: 'head', d: `M${(e[0]).toFixed(1)},${e[1].toFixed(1)}L${(e[0] - ux * hl - uy * hw).toFixed(1)},${(e[1] - uy * hl + ux * hw).toFixed(1)}L${(e[0] - ux * hl + uy * hw).toFixed(1)},${(e[1] - uy * hl - ux * hw).toFixed(1)}Z`, style: `fill:${col}` }, g);
      f._mid = pts[Math.floor(pts.length / 2)]; } };
  const drawSyms = () => { gSym.replaceChildren(); const sy = (S.symbols || []).filter(s => isFinite(s.value) && s.value > 0); if (!sy.length) return;
    const ref = S.symbolRef || Math.max(...sy.map(s => s.value)), mx = (S.symbolMax || 22) * shrink();
    for (const s of [...sy].sort((a, b) => b.value - a.value)){ const [x, y] = PR.project([s.lon, s.lat]); const r = Math.max(1.5, mx * Math.sqrt(s.value / ref)), col = css(s.color || 's2');
      s._xy = [x, y]; s._r = r; if (x + r < 0 || x - r > W || y + r < 0 || y - r > H) continue; svg('circle', { class: 'sym', cx: x.toFixed(1), cy: y.toFixed(1), r: r.toFixed(1), style: `fill:${col};stroke:${col}`, ...pickAttrs(s, 'symbol') }, gSym); } };
  const drawPts = () => { gPt.replaceChildren();
    for (const p of S.points || []){ const [x, y] = PR.project([p.lon, p.lat]); p._xy = [x, y]; if (x < -9 || x > W + 9 || y < -9 || y > H + 9) continue;
      svg('circle', { class: 'pt', cx: x.toFixed(1), cy: y.toFixed(1), r: p.r || 4.5, style: `fill:${css(p.color || 'ink')}`, ...pickAttrs(p, 'point') }, gPt); } };
  const drawSel = () => { gSel.replaceChildren(); const id = m.resolve(S.selected), p = id && paths.get(id); if (!p) return;
    svg('path', { class: 'selpath', d: p.getAttribute('d') }, gSel); };
  // ---- labels: points first (always), then the selected region, then other regions where they fit (no overlaps)
  const anchorOf = id => { if (anchors.has(id)) return anchors.get(id); const f = idx.get(id); let best = null, ba = 0;
    if (S.labelAt && (S.labelAt[id] || S.labelAt[f.properties.a3])){ const a = PR.project(S.labelAt[id] || S.labelAt[f.properties.a3]); anchors.set(id, a); return a; }
    for (const p of M.polys(f)){ const r = p[0].map(PR.project); let A = 0, cx = 0, cy = 0;
      for (let i = 0; i < r.length; i++){ const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length], c = x0 * y1 - x1 * y0; A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; }
      if (Math.abs(A) > ba){ ba = Math.abs(A); best = [cx / (3 * A), cy / (3 * A)]; } }
    anchors.set(id, best); return best; };
  const drawLabels = () => { gLab.replaceChildren(); const placed = [], sel = m.resolve(S.selected);
    const marks = [...(S.symbols || []).filter(s => s._xy).map(s => [s._xy, s._r]), ...(S.points || []).filter(p => p._xy).map(p => [p._xy, p.r || 4.5])]
      .map(([[x, y], r]) => ({ l: x - r, r: x + r, t: y - r, b: y + r }));   // region labels keep off symbols and points when they can
    const put = (s, x, y, cands, o = {}) => { const px = o.size || 12, w = IE.textWidth ? IE.textWidth(s, px, o.weight || '') : s.length * px * 0.55;
      const box = (cx, cy, a) => { const l = a === 'middle' ? cx - w / 2 : a === 'end' ? cx - w : cx; return { l: l - 2, r: l + w + 2, t: cy - px * 0.82 - 1, b: cy + px * 0.28 + 1, x: cx, y: cy, a }; };
      const hit = q => b => b.l < q.r && q.l < b.r && b.t < q.b && q.t < b.b, inside = b => b.l >= 1 && b.r <= W - 1 && b.t >= 1 && b.b <= H - 1;
      const free = b => !placed.some(q => hit(q)(b)) && !(o.avoid && o.avoid.some(q => hit(q)(b)));
      let pick = null; for (const [dx, dy, a] of cands){ const b = box(x + dx, y + dy, a); if (inside(b) && free(b)){ pick = b; break; } }
      if (!pick){ if (!o.force) return null; const [dx, dy, a] = cands[0]; pick = box(x + dx, y + dy, a);
        const sx = pick.l < 1 ? 1 - pick.l : pick.r > W - 1 ? W - 1 - pick.r : 0, sy = pick.t < 1 ? 1 - pick.t : pick.b > H - 1 ? H - 1 - pick.b : 0;
        pick = { ...pick, l: pick.l + sx, r: pick.r + sx, t: pick.t + sy, b: pick.b + sy, x: pick.x + sx, y: pick.y + sy }; }
      placed.push(pick); svg('text', { class: 'lbl ' + (o.cls || ''), x: pick.x.toFixed(1), y: pick.y.toFixed(1), 'text-anchor': pick.a, text: s }, gLab); return pick; };
    const around = (r, g = 4) => [[r + g, 4, 'start'], [-r - g, 4, 'end'], [0, -r - g - 2, 'middle'], [0, r + g + 11, 'middle'], [r + g, -r, 'start'], [-r - g, -r, 'end'], [r + g, r + 8, 'start'], [-r - g, r + 8, 'end']];
    const vis = ([x, y]) => x >= 0 && x <= W && y >= 0 && y <= H;
    for (const p of S.points || []) if (p.label && p._xy && vis(p._xy)) put(p.label, p._xy[0], p._xy[1], around(p.r || 4.5), { force: true, cls: 'pt-lbl', weight: 'bold' });
    const lab = S.labels || Object.keys(vals);
    const ids = [...new Set([sel, ...lab.map(m.resolve)])].filter(id => id && idx.has(id));
    for (const id of ids){ const a = anchorOf(id); if (!a || !vis(a)) continue; const on = id === sel;
      const c = [[0, 0, 'middle'], [0, -16, 'middle'], [0, 16, 'middle'], [-24, 0, 'end'], [24, 0, 'start'], [0, -30, 'middle'], [0, 30, 'middle']];
      if (!put(m.name(id), a[0], a[1] + 4, c, { avoid: marks, cls: on ? 'cty-lbl on' : 'cty-lbl', weight: on ? 'bold' : '' }))
        put(m.name(id), a[0], a[1] + 4, c, { force: on, cls: on ? 'cty-lbl on' : 'cty-lbl', weight: on ? 'bold' : '' }); }
    for (const s of S.symbols || []) if (s.label && s._xy && vis(s._xy)) put(s.label, s._xy[0], s._xy[1], around(s._r || 4), { cls: 'sym-lbl', size: 11 });
    for (const f of S.flows || []) if (f.label && f._mid && vis(f._mid)) put(f.label, f._mid[0], f._mid[1], [[6, -6, 'start'], [-6, -6, 'end'], [0, 14, 'middle']], { cls: 'flow-lbl', size: 11 });
  };
  const aria = () => { const t = (S.title || 'Map') + (S.summary ? '. ' + S.summary : ''); title.textContent = t; root.setAttribute('aria-label', t); };

  const ALL = ['features', 'projection', 'bounds', 'height', 'minHeight', 'maxHeight', 'pad', 'graticule'];
  m.set = (patch = {}, opts = {}) => {
    S = { ...S, ...patch };
    if (!F || 'features' in patch){ F = feats(); index(); }
    const [w, h, B] = sizeOf(), key = [w, h, S.projection, JSON.stringify(B), F.length].join('|');
    const geo = key !== geoKey || ALL.some(k => k in patch && k !== 'bounds') || opts.force;
    if (anim && !opts.force) return m;
    if (geo){ buildGeo(); paint(); drawField(); drawFlows(); drawSyms(); drawPts(); }
    else {
      if (['values', 'scale', 'fill', 'pickable', 'onPick', 'legend', 'names', 'unit'].some(k => k in patch)) paint();
      if ('field' in patch) drawField(); if ('flows' in patch || 'flowRef' in patch) drawFlows();
      if ('symbols' in patch || 'symbolRef' in patch) drawSyms(); if ('points' in patch) drawPts();
    }
    drawSel(); drawLabels(); aria();
    for (const [id, p] of paths) p.classList.toggle('on', id === m.resolve(S.selected));
    return m;
  };
  /* animated zoom: scale/translate the drawn layer to the new fit, then rebuild crisp */
  m.zoomTo = b => {
    if (!PR || IE.reducedMotion || !root.isConnected || !host.clientWidth) return m.set({ bounds: b });
    const old = PR, S2 = { ...S, bounds: b }, keep = S; S = S2; const [w, h, B] = sizeOf(); S = keep;
    if (w !== W || h !== H){ return m.set({ bounds: b }); }
    const nw = M.fit(S.projection || 'naturalEarth', B, W, H, S.pad ?? 10);
    if (nw.scale === old.scale && nw.cx === old.cx && nw.cy === old.cy) return m.set({ bounds: b });
    const k = nw.scale / old.scale, tx = W / 2 - k * W / 2 + (old.cx - nw.cx) * nw.scale, ty = H / 2 - k * H / 2 - (old.cy - nw.cy) * nw.scale;
    clearTimeout(anim); gLab.style.opacity = 0; for (const p of paths.values()) p.classList.remove('off'); all.style.transition = 'none'; all.style.transform = 'none'; all.getBoundingClientRect();
    all.style.transition = 'transform .45s ease-in-out'; all.style.transform = `matrix(${k},0,0,${k},${tx},${ty})`;
    S = S2; anim = setTimeout(() => { anim = 0; all.style.transition = 'none'; all.style.transform = ''; gLab.style.opacity = ''; m.set({}, { force: true }); }, 470);
    return m;
  };
  // ---- picking: click / Enter / Space on anything with data-pick
  const fire = e => { const t = e.target.closest && e.target.closest('[data-pick]'); if (!t || !root.contains(t) || !S.onPick) return false; S.onPick(t.getAttribute('data-pick'), t.getAttribute('data-kind') || 'region'); return true; };
  root.addEventListener('click', fire);
  root.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && fire(e)) e.preventDefault(); });
  new ResizeObserver(() => { if (host.clientWidth && Math.max(260, host.clientWidth) !== W) m.set({}); }).observe(host);
  if (IE.theme && IE.theme.onChange) IE.theme.onChange(() => drawLegend());
  m.set(spec);
  return m;
};

/* IE.map.card(host, { title, sub, rows: [[label, value]], note, html }) — the picked region's detail card */
M.card = (host, o) => { const e = IE.esc || (s => s);
  host.innerHTML = !o ? '' : `<div class="ie-map-card">${o.title ? `<h4>${e(o.title)}</h4>` : ''}${o.sub ? `<p class="sub">${o.sub}</p>` : ''}${o.rows && o.rows.length ? `<dl>${o.rows.map(([k, v]) => `<dt>${e(k)}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}${o.note ? `<p class="sub">${o.note}</p>` : ''}${o.html || ''}</div>`; };

/* IE.map.browse(host, app, { order: () => ids, name: id => text, label }) — a "browse by value" slider marked data-time,
   so ← → (which call sel.stepBy) have a visible control and check.js can test the keys. Rank 1 = first in order(). */
M.browse = (host, app, o) => {
  const id = 'mapRank' + Math.random().toString(36).slice(2, 6), wrap = document.createElement('div'); wrap.className = 'ctl';
  wrap.innerHTML = `<div class="lab"><label for="${id}">${o.label || 'Browse regions by value'}</label><output id="${id}_o"></output></div><input type="range" id="${id}" data-time min="0" max="1" step="1" value="0">`;
  host.appendChild(wrap); const inp = wrap.querySelector('input'), out = wrap.querySelector('output');
  inp.addEventListener('input', () => { app.pause(); const ord = o.order(); if (ord.length) app.setSel(ord[+inp.value]); });
  app.afterRender.push(S => { const ord = o.order(), cur = o.current ? o.current(S.sel) : S.sel, i = ord.indexOf(cur);
    inp.max = Math.max(1, ord.length - 1); inp.disabled = ord.length < 2; if (+inp.value !== Math.max(0, i)) inp.value = Math.max(0, i);
    out.textContent = i < 0 ? '–' : `${i + 1} of ${ord.length} · ${o.name ? o.name(cur) : cur}`; });
  return inp;
};

if (typeof module === 'object' && module.exports) module.exports = M;
})(typeof window !== 'undefined' ? window : globalThis);
