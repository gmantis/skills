# Parameter sweep (`sweep`)

Start: `node scripts/build.js new sweep page.html`. Module: `<script data-ie="sweep">` + `<style data-ie="sweep">` (`IE.sweep`).

## When to pick it
The source says "it depends on k", "past a threshold…", "the dose makes the poison", "a little busier makes it much
worse", "below X nothing happens, above Y it runs away". One parameter moves, one outcome responds, and the interesting
part is the *shape* of the response (a knee, a tipping point, a J-curve, a region with no answer).
Not this shape: a quantity over time (over-time skeleton) or options side by side (compare). A sweep is often the
linked secondary view of another shape (a causal network's "what if this weight were 0.2…0.9").

## Model
- `outcomeAt(x, p)`: pure, returns the outcome at one parameter value, with every other parameter in `p`. Return
  `Infinity` where the outcome does not exist (no steady state, never reached); the page says so in words.
- Exact formulas where they exist; otherwise a small seeded simulation (`IE.seeded` in the page, or your own mulberry32
  in model.js so Node can run it). Validate the simulation against the formula in the validation table.
- A named threshold (`kneeOf(p)`): from the source if it names one; otherwise a stated convention, marked illustrative.
- `ghostsOf(p)`: the same sweep with one cause or assumption flipped (one ghost per cause, at most 3).

## Main view and selection
- `IE.sweep(host, spec)`: the outcome curve (solid), ghosts (dashed, named in the legend above), the current value
  (cursor + dot + bold label; an arrow at the top when off-scale or unbounded), named thresholds (ring + label with a
  leader line), the unbounded region (shaded, bounded by a dashed line, words inside; never plotted, never quoted),
  and the reader's own value (dotted line, dot, tag). Labels are placed clear of the curves and each other.
- `IE.sweep.multiples(host, spec)`: the step **up** the ladder: whole runs (or the over-time chart) at 4–6 fixed
  values, **shared axes**, the panel nearest the selection outlined, click / Enter to jump there. Pick the y scale from
  the bounded panels; let an unbounded run leave the top and say "(off the top)" in its caption.
- A concrete-case panel is the step **down** (one customer, one patient, one day), recomputed at the selection.
- Selection = the parameter value, a numeric `sel` in `IE.app` (slider marked `data-time`, ← → one `unit`, play
  sweeps it). Every view reads `sel`; the chart (`onPick`) and the panels (`onPick`) write it with `app.setSel`.

## What-if
Switch an assumption across the **whole** range: toggles / a `whatIf` segment change `P`, `recompute` redraws curves
and ghosts. A step's `params` sets the assumption; its `sel` sets the value. Keep the y scale stable across what-ifs
(compute it from the worst case), or the reader cannot compare.

## Tour order (5–7 steps)
1. The question at one concrete value (`sel` = the source's case), with a `data-set="sel=…"` "try a bit more" button.
2. One concrete run / case (step down). 3. The whole curve (flat part). 4. The knee / threshold with numbers.
5–6. Each assumption switched off across the range (ghosts carry the comparison). 7. Past the limit + the small
multiples (step up). Put live numbers in every step with `D('key')`.

## API
```js
const sw = IE.sweep(host, {
  title, summary, height: 360,                        // as IE.lineChart
  x: { min, max, fmt, ticks, label }, y: { min, max, fmt, ticks, label, log },
  series: [{ id, label, color: 'total' | 's1'…, points: IE.sweep.curve(x => f(x), lo, hi, 400), ghost, dash, width }],
  limit: { from: 1, to: 1.2, text: ['queue grows', 'without limit'], short: 'no average past 100%' },
  thresholds: [{ x, y, title: 'knee ≈ 63%', text: ['each +10 points', 'adds > 2 min'], color }],
  you: { x, y, label: 'you: 85%, 11 min', color: 's5' } | null,
  current: { x: sel, y: f(sel), label: '80%: wait 8 min' },
  hlines: [{ y, label }], legend: true, onPick: x => app.setSel(x),
});
sw.set(patch)        // { current } (and/or { you }) alone only redraws the overlay: call it from render()
const sm = IE.sweep.multiples(host, { x, y, height: 100, selected: sel, onPick: x => app.setSel(x),
  panels: [{ x, caption: '<b>ρ 50%</b> · avg 0.6', summary: 'text for screen readers', series: [{ points, color, area, dash, width }] }] });
sm.set({ selected: sel })   // moves the outline only; any other key rebuilds the panels
IE.sweep.curve(f, lo, hi, n)          // [[x, f(x)]], Infinity kept (the line breaks there)
IE.sweep.firstWhere(pred, lo, hi, step)   IE.sweep.crossing(f, level, lo, hi)   IE.sweep.limit(f, lo, hi)   IE.sweep.nearest(xs, x)
IE.sweep.place(svgGroup, placed, lines, cands, o)   // the SVG label placer used inside (backing rect + tspans, class lbl)
```
Page pattern: build curves, thresholds and panels in `recompute(P, app)` (they do not depend on `sel`), and in
`render({ P, sel })` call `sw.set({ current })`, `sm.set({ selected: sel })` and the concrete-case panel.

## Validation ideas
Exact textbook values (one row each, tolerance 1e-6); ratios the source quotes ("90% vs 80% is 2.25×"); the limit
("at ρ ≥ 1 the model gives no number"); seeded simulation vs formula for the **current** assumption (re-render the
table only when the assumption changes; cache simulations by key, they cost tens of ms).

## Pitfalls
- Never quote or plot a number in the unbounded region: `outcomeAt` returns `Infinity`, the chart breaks the line,
  `current` gets an arrow, prose says "grows without limit".
- Small multiples on one scale dominated by a runaway run show flat lines; scale on the bounded runs instead.
- On a phone the unbounded band is narrow: the words run up the band rotated; give `limit.short` for very narrow bands.
- Simulated averages differ from formulas by chance (the demo's 80% run shows 4.3 vs 3.2): say "one run" in captions.
