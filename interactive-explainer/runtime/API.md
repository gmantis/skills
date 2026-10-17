# Runtime API (`IE`)

The runtime is the shared engine of every explainer page. `scripts/build.js` inlines it into the page, so the page
stays one offline HTML file, while you write only the page's own parts: the model, the steps and the views.
Never copy runtime code into a page, and never edit inside a `data-ie` block (the next build overwrites it).

## Page anatomy

```html
<style data-ie="core"></style>                      <!-- theme tokens, layout, controls, charts, print, reduced motion -->
<header class="ie-head"><div class="ttl"><h1>…</h1><p class="lede">…</p></div></header>   <!-- theme toggle is added -->
<div class="answer"><p class="claim">…</p><div class="stat"><b data-dyn="k"></b><span>label</span></div></div>
<div class="layout">
  <aside><div class="card" id="tour"></div><div class="card" id="whatif"></div><div class="card" id="controls"><h4>Time</h4></div></aside>
  <main> panels: <section class="panel"><h3>…</h3><p class="sub">what to look at</p> view </section>, <div id="readout"></div></main>
</div>
<div class="wide"> <section>…validation (#valid), how the model works, glossary…</section> <section id="sources"></section> </div>
<script data-ie="core"></script>  <script data-ie="3d"></script>?  <script data-ie="<shape>"></script>?
<script data-ie-file="model.js"></script>            <!-- the model you tested in Node -->
<script> page code: IE.sources(...), IE.app({...}), views </script>
```

Build: `node scripts/build.js page.html --from "$TEMP/<name>"` (fills every block; rerun after editing model.js or to
pick up a newer runtime). Start a page with `node scripts/build.js new <shape> page.html` (copies the shape's skeleton).
Containers that are missing are simply skipped: no `#whatif` means no what-if card.

## model.js
Plain script, pure functions, no DOM. Top-level `const`/`function` are globals in the page. End with
`if (typeof module === 'object' && module.exports) module.exports = { … };` so Node can `require` it for the
validation run. Return `Infinity` for unreachable values and say it in words in the page.

## IE.app(cfg) — the tour, controls, selection, keys and URL state

Parameter, toggle and option ids become element ids, so they must not clash with the runtime's (`prev`, `next`,
`sel`, `play`, `reset`, `params`, `readout`, `valid`, `sources`…) or the page's; the runtime logs an error if they do.

```js
const app = IE.app({
  real: { ampA: 7.7 },                                   // real parameter values; Reset returns here
  params:  [{ id, label, min, max, step, fmt, off: 'offA' }],   // sliders in #controls; dimmed while P[off] is true
  toggles: [{ id: 'offA', label: 'Switch off cause A' }],      // model booleans (default false), checkboxes in #whatif
  options: [{ id: 'ghosts', label: '…', value: true }],        // view-only switches; kept when the step changes
  whatIf:  [{ key: 'noA', label: 'No A', set: { offA: true, offB: false } }],   // pressed when P matches set
  sel: { label, min, max, step, unit, value, cyclic, fmt, play: { rate } | false, keyHint },   // numeric selection
    // or sel: { stepBy(dir, app), parse?(t) } for a non-numeric selection (node, record, option): app.setSel(id) / app.sel;
    // ids come back from the URL as strings unless parse() converts them
  steps: [{ title, params: { offB: true }, sel: 0.3 | (app => …), html: app => `…${D('key')}…`, enter(app) }],
  recompute(P, app),           // params changed: rerun the model, rebuild static views
  render({ P, sel, step, app }), // draw every view for the current selection (called once per dirty frame)
  dyn({ P, sel }) => ({ key: 'text' }),      // values for every D('key') / data-dyn on the page
  readout({ P, sel }) => 'html',             // #readout line
  hash: true,                  // keep step, selection and changed settings in location.hash (shareable links)
});
```
- A step's `params` are applied on top of `real` with every toggle off, so a step lists only what differs and going
  back always restores the same state. Options (view switches) keep the reader's choice.
- `app.set({k: v})`, `app.setSel(v)`, `app.goStep(i)`, `app.redraw()`, `app.pause()`, `app.play()`, `app.stepSel(dir)`,
  `app.P`, `app.sel`, `app.step`, `app.afterRender.push(fn)`.
- A numeric `sel` may also have `stepBy` (it wins for ← →), e.g. to jump between events on a time axis. A
  non-numeric selection plays with `sel.play: { ms }` (one `stepBy(1)` per tick; stops when it no longer moves).
- Easing: call `app.redraw()` inside `render()` to ask for another frame until the motion settles.
- Inline experiment buttons anywhere: `<button data-set="ampA=15; offB=true">` and `<button data-set="sel=0.62">`.
- Keys: ← → move the selection one `unit` (or call `sel.stepBy`) and pause play; Ctrl/⌘ + ← → change topic. Typing
  fields, focused sliders and Alt are left alone. The slider gets `data-time` so `check.js` tests the keys.
- Globals for `check.js`: `STEPS`, `STEP`, `goStep`, `setParams`, `P`, `APP`, `IE.current`.

## Prose helpers
`D('key')` live number (no wrap), `DW('key')` live text that may wrap. `cite('id')` superscript link to a source.
`IE.sources({ id: { title, url, where: 'p. 4, Table 2', quote: 'exact words' } })` renders `#sources` with each quote.
`IE.validation('valid', [{ claim, source: 'id', target: 'source value' | () => 'text', model: () => 'text', ok: () => bool }])` renders a
live check table; call `.render()` in `render()` when its numbers depend on the settings.

## Views
- `IE.lineChart(host, spec)` → `chart.set(patch)`. SVG, themed, accessible, lintable by `check.js`.
  spec: `{ title, summary, height, x: { min, max, fmt, ticks, label }, y: { min, max, fmt, ticks, label, log },
  series: [{ id, label, color: 's1'…'s8' | 'total' | 'ink' | '#hex', points: [[x, y]], width, dash, ghost, area, endLabel, endText,
  band: [[x, lo, hi]] (a shaded range, e.g. 10–90% of repeated runs) }],
  cursor, cursorLabel, marks: [{ x, y, label, color, r }], bands: [{ x0, x1, label }], hlines: [{ y, label }],
  notes: [{ x, y, text, anchor }], onPick: x => …, legend: false, afterBuild: (geo, svg) => … }`. Marks take `anchor`.
  Patching only `cursor`/`cursorLabel`/`marks` redraws the overlay, so it is cheap per frame. End labels are
  de-overlapped in a right gutter; dashed series get a legend above the chart.
- `IE.barChart(host, { title, rows: [{ id, label, value, color, note, ghost }], fmt, min, max, highlight, onPick })`:
  horizontal bars; with `onPick` each bar is a keyboard-focusable `data-pick` button.
- `IE.table(host, { columns: [{ key, label, num, fmt }], rows, highlight, pick: (r, i) => id, onPick: id => …, caption })`:
  with `onPick`, rows are keyboard buttons.
- Canvas (dense marks, 3D, per-pixel): `IE.setupCanvas(cv)` (logical height in `data-h`), `IE.chartFrame(cv, { x0, x1, y0, y1, fmtX, fmtY })`
  → `{ ctx, X, Y, line(pts, color, w, dash) }`, `IE.onPickX(cv, x => …)`, `IE.txt`, `IE.disc`, `IE.placeLabel(ctx, placed, lines, cands, o)`.
  Canvas has no lintable text, so prefer SVG below a few thousand marks.
- SVG building: `IE.svg(tag, attrs, parent)` (`text:` sets textContent), `IE.pathD(pts)`, `IE.spread(items, gap, lo, hi)`,
  `IE.textWidth(s, px, weight)`. Give clickable elements `data-pick`, text labels class `lbl`, the root `role="img"` + `aria-label`.
- 3D (`<script data-ie="3d">`): `IE.v3 = { Cam, poly, curve, seg, sph, unit, dot, cross, label3, renderSphere }`;
  `cam.attach(canvas, app.redraw)` adds drag-to-orbit and wheel zoom.

## Colours, theme, formatting
- Colours are CSS variables that switch with the theme: series `s1`…`s8` (validated categorical order; at most 3
  when every pair can touch, as in scatter plots or maps), `total`/`ink` for the main quantity, `ink2`, `muted`,
  `grid`, `axis`, `accent`, `good`, `bad`, sequential `seq1`…`seq5`. SVG/CSS: `var(--s2)` or `IE.cssColor('s2')`;
  canvas: `IE.color('s2')` (read at draw time, cached per theme).
- `IE.theme.get()`, `.set('dark'|'light')`, `.onChange(fn)`; `?theme=dark` in the URL forces one. `IE.reducedMotion`.
- `IE.fmt.num(v, d)`, `.int`, `.sgn`, `.pct(fraction, d)`, `.si`, `.money(v, 'SGD')`, `.dur(seconds)`;
  `IE.ticks(lo, hi, n)`, `IE.niceStep`, `IE.niceMax`, `IE.clamp`, `IE.lerp`, `IE.range`, `IE.sum`, `IE.seeded(seed)` (RNG), `IE.esc`.

## Shape modules
`<script data-ie="<shape>"></script>` adds a shape's engine (e.g. `graph`, `stepper`, `timeline`). Each shape's guide
in `shapes/<shape>.md` documents its module; `node scripts/build.js list` shows what exists.
