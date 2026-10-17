# Compare (options × criteria)

Pick it when the source says **"A vs B vs C"**, "the trade-offs are…", "choose X when…, Y when…", or gives a table of
options scored on several properties: tools, designs, treatments, plans, vendors, algorithms. Not when the point is how
one outcome *depends on a parameter* (sweep) or *what drives what* (graph).

Skeleton: `node scripts/build.js new compare page.html` (`assets/skeleton-compare.html`). Modules: `core` + `compare`
(`<style data-ie="compare">` and `<script data-ie="compare">`).

## Model
- Data only, in model.js: `CRITERIA` (id, label, short, `dir` +1/−1, `log` for criteria spanning orders of magnitude,
  `fmt` with the unit, `desc`) and `OPTIONS` (id, label, short, sub, notes, pros, cons, `v: { criterion: cell }`).
  A cell is `[value, 'where this number comes from', { src: 'sourceId', illustrative: false }]`; the note is shown in
  the detail card, `src` becomes a citation. Ids: `[A-Za-z0-9_]`, not numbers.
- The method lives in the module: min–max score per criterion over the options in play (log10 where marked and every
  value > 0; a flat row scores 0.5), total = Σ w·score / Σ w, ranks with shared ties, best per row.
- Sensitivity is **exact**: the totals share one denominator, so the order is that of N = Σ w·s, linear in each
  weight. Winner i ties rival j at w′ = w + (N_i − N_j)/(s_j − s_i); the nearest tie each way is the flip. The module
  also picks a round "try" value past the flip and re-checks it, and says "no change from 0 to 10 flips it" otherwise.
- Status is always said in words: a winner, "a tie between…", "no criteria weighted", "the only option in play".

## Views (all driven by one selection)
- Aligned table: options as columns, criteria as rows, raw value with its unit + a 0–1 score bar, best in row shaded
  with ★, weighted total and rank rows (▲▼ = last rank change), sticky criterion column, scroll wrapper.
- Ranking: stacked bars (one slice per criterion's share of the total) that slide when the order changes.
- Side by side: one small view per option on the same 0–1 scale (beats one chart with many lines past 3 options).
- How sure: one sentence per criterion, the closest call marked, a "try" button at the nearest flip.
- Sweep: `IE.lineChart` of every option's total as the focused weight runs 0..wMax; flip dots, a cursor at the current
  weight; click or drag sets the weight. Focused = the selected criterion, else the closest call.
- Detail card: an option (notes, pros/cons, each number's source note), a criterion (how it is scored, its
  sensitivity, "only this" / "ignore it") or one cell (value, score, source note, citation, illustrative badge).
- Selection `app.sel`: `'o:<option>'`, `'k:<criterion>'`, `'c:<option>:<criterion>'` or null. ← → walks options
  or criteria in table order, along the row when a cell is selected (cycling). `#selnav` shows it with ‹ ›.

## What-ifs and tour
- Presets: Balanced and "Only <criterion>" (`M.presets()`), plus named viewpoints from the source via
  `M.presets({ extra: [{ key, label, set: M.weights({ size: 8, lat: 2 }) }] })`. Toggles: "Leave out <option>"
  (min–max is relative, so this can change the winner) and "linear scales" when any criterion is `log`.
- Tour: the question + current winner → one row read concretely (raw values → scores) → the weights decide (inline
  `data-set` weight changes) → a preset that flips the winner and one that ties → **step up**: how sure, the whole
  0–10 range of each weight → what the table can't tell (illustrative, relative scores, deal-breakers, no error bars).

## API
```js
const M = IE.compare.model({ criteria: CRITERIA, options: OPTIONS, wMax: 10, balanced: 5, illustrative: true });
const V = IE.compare.view(M, { table: 'cmp', ranking: 'ranking', legend: 'legend', minis: 'minis', sens: 'sens',
  sweep: 'sweep', sweepTitle: 'sweepTitle', detail: 'detail', selnav: 'selnav' }, { sweepHeight: 260 });
const app = IE.app({ real: M.real, params: M.params(), toggles: M.toggles(), whatIf: M.presets(),
  sel: { stepBy: V.stepBy, keyHint: 'next option or criterion' }, steps,
  recompute: (P, app) => V.recompute(P, app), render(S){ V.render(S); valid.render(); },
  dyn: S => V.dyn(S), readout: S => V.readout(S) });
```
- `model(spec)` → `M`: `criteria, options, OPT, CRIT, wMax, balanced, real` (w_<id> = balanced, off_<id> = false,
  lin), `wKey(id)`, `offKey(id)`, `weights({ id: w })` (others 0), `params(o)`, `toggles(o)`, `presets(o)`,
  `only(id)` (a `data-set` string), `normalise(p)`, `evaluate(p)` → `R { ins, score, range, N, total, part, order,
  rank, top, status, winner, runner, margin, rowWin }`, `sensitivity(p, R)` → `S { status, rows: { id: { w, up, down,
  beyond } }, best }` (a flip: `{ at, first, act, by, tie }`), `sweep(p, R, id, n)` → `{ cur, lo, hi, series, at(id, w) }`,
  `name`, `listNames`, `statusText(R)`, `sensText(id, S, R)`, `fmtW`. Pure; `require('runtime/compare.js')` in Node.
- `view(M, hosts, opts)` → `V`: `recompute`, `render`, `dyn` (winner, runner, margin, top_total, flip_dist,
  flip_crit, sens_best, t_/r_<option>, w_/sens_<criterion>, raw_/n_<option>_<criterion>), `readout`, `stepBy`,
  `focusCrit(sel)`, `pick(code)`, `parseSel`, `R`, `S`. Any host may be missing; that view is skipped.
- Weight-0 sliders dim (`.cmp-zero`). Values that are sentences (winner, sensitivity) go in `DW()`, not `D()`.

## Validation
Method checks, live on the current settings: every non-flat row has best 1 and worst 0; ranking slices add up to each
total; at every reported flip the winner and the first rival tie (gap 0); just past each flip, first place goes to a
rival level with the winner there (several when flips coincide); the sweep passes through the table's totals. Then
the source's claims: a named viewpoint's ranking ("by size alone, A beats B beats C"), a stated tie, a stated winner.
In Node: `require` compare.js + model.js, and cross-check every flip against a fine grid search (the skeleton's demo
agrees to 0.001).

## Pitfalls
- A preset where two options score 1 on the only weighted criterion is a tie; say so, never pick one.
- Scores are relative: adding or removing an option changes the others' scores. Say it on the page.
- Log scale needs every value > 0 ("live" = 0 data age can't be logged); the module falls back to linear.
- Deal-breakers (a hard limit, a missing feature) are not weights; list them in the text, not as a criterion.
- Flips can coincide (three options level at one weight): the option past the flip may not be the first rival.
- `.sr-only` text inside a wide scrolling table is `position:absolute`; without `.tablewrap{position:relative}`
  (compare.css adds it) it escapes the scroll clip and the phone page scrolls sideways.
- Flex/grid items default to `min-width:auto`, so a 640 px table widens `main` on phones; compare.css sets
  `main .panel, main .grid2 > * { min-width: 0 }`.
