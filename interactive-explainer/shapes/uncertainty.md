# Uncertainty (risk, probability, base rates, simulation)

Pick it when the source says **"how likely"**, "1 in N", "what are the odds", "the risk is…", "the test is 90%
accurate", "false positives", "the chance an attacker catches up", "on average… but it varies", "90% confidence",
"Monte Carlo". The reader's question is about a *chance* or a *spread*, not one number. Not when the point is a
curve over a parameter (sweep; though a sweep can be this shape's secondary view) or a choice (decision).

Skeleton: `node scripts/build.js new uncertainty page.html` (`assets/skeleton-uncertainty.html`, demo: a screening
test, exact Bayes checked against a seeded per-person simulation). Modules: `core` + `uncertainty`.

## Model
- Two halves, both pure in model.js: the **exact** answer (Bayes' rule, a binomial/Poisson/normal formula, a closed
  form) and a **simulation** that does the experiment literally (one person, one block, one game at a time) from a
  uniform random function `u()` that the page passes in (`IE.seeded(P.seed)`); Node passes its own copy. Never let
  the simulation call the exact formula: it is the independent check.
- Keep the seed in `P` (`REAL.seed = 1`): the URL then reproduces a draw, and steps return to the same draw.
- Express every probability as a **natural frequency next to the percentage**: "8.9% (89 of 1,000)". Pick one
  reference class (1,000 people, 10,000 games) and keep it on the whole page. Say "1 in 11" for small chances.
- Expected counts are fractional; for icon arrays round them with `U.roundCounts(vals, N)` so they still add to N.

## Views (one shared selection)
- **Icon array**: N icons coloured by outcome, in blocks of 10×10 so counts read by blocks. Groups fill in order (the
  expected counts) or at random places (`shuffle: seed`, one simulated sample). The legend repeats each group with
  its natural frequency. 1,000 is the usual N; 10,000 still works (squares).
- **Histogram / dot plot of the draws** with the exact distribution overlaid (dots for discrete, a curve for
  continuous) and dashed quantile markers (5%, median, 95%). Use dots (`mode: 'dots'`) for ≤ ~300 draws, where each
  dot is one run; bars beyond. A **Draw again** button (`U.drawAgain`) bumps `P.seed`.
- **Interval / forest chart**: one row per group or scenario, estimate + interval (+ an optional exact band behind).
  This is usually the **step up**: the same calculation across populations, sample sizes or settings.
- Selection: an outcome group (`sel.stepBy` cycles groups; legend, icons, picker and forest rows set it), or a
  numeric threshold/probability (`sel: { min, max, … }` with the `data-time` slider; use `highlight: { from }` on the
  histogram to shade "at least k").

## What-ifs and tour
- What-ifs change the inputs that move the answer most: a better test (specificity), a different base rate ("10× as
  common"), a second test (prevalence ← the first test's PPV), a larger sample. Option: "show one random sample".
- Tour: the concrete case first ("you test positive: how likely is it real?", with the intuitive wrong answer) →
  picture N people → each group in turn (the step text sets `sel`) → the answer as counts → chance: the spread of
  simulated samples (Draw again) → **step up** across populations/settings → the lever that helps most.

## API (`const U = IE.uncertainty`)
```js
U.binom.pmf(k, n, p) .cdf(k, n, p) .quantile(q, n, p) .mean .sd .support   // exact to ~1e-13
U.poisson.pmf(k, l) .cdf .quantile        U.normal.pdf(x, mu, sd) .cdf .quantile
U.rng(seed) -> { u(), int(a,b), bernoulli(p), normal(mu,sd), binomial(n,p), poisson(l), pick(a), shuffle(a) }
U.simulate(runs, seed, (rng, i) => outcome) -> outcomes[]
U.summary(draws, [0.05, 0.5, 0.95]) -> { n, mean, sd, min, max, q: [..], discrete }   // q: inverse-ECDF for integers
U.quantile(draws, q, { sorted, discrete })   U.share(draws, pred)   U.mean / U.sd   U.wilson(k, n, 0.95)
U.seProp(p, n)  U.seMean(sd, n)  U.seQuantile(q, n, density)  U.agree(sim, exact, se, z = 3) -> { ok, z, tol }
U.pct(p)  U.freq(p, N) -> { k, N, text: '89 of 1,000' }  U.both(p, N) -> '8.9% (89 of 1,000)'  U.oneIn(p) -> '1 in 11'
U.roundCounts(values, N)   U.wrap(text, maxW, px, weight, lines)
U.iconArray(host, { title, groups: [{ id, label, count, color }], N, cols: 10, rows: 10, shape: 'person'|'dot'|'square',
  shuffle: seed|null, highlight, onPick: id => …, legend, legendText: (g, N) => html, maxHeight: 380 }) -> { set(patch) }
U.histogram(host, { title, draws, discrete, bins, maxBars: 90, x: { min, max, fmt, label }, exact: { pmf } | { pdf },
  exactLabel, color, highlight: { from, to }, hlColor, quantiles, qLabel, marks: [{ x, label, color }], mode, height,
  onPick: x => … }) -> { set(patch) }
U.forest(host, { title, rows: [{ id, label, est, lo, hi, color, exact: { lo, hi } }], x: { min, max, fmt, label },
  refs: [{ x, label }], valueText: (r, narrow) => text, highlight, onPick: id => … }) -> { set(patch) }
U.picker(host, [{ id, label, title }], onPick, { label }) -> { set(id) }      U.drawAgain(host, onDraw, label)
```
Patching only `highlight` is cheap (classes, no rebuild); everything else rebuilds the SVG. Example:
```js
const icons = U.iconArray($('icons'), { groups: [], N: 1000, onPick: id => app.setSel(id) });
// render(): icons.set({ groups: GROUPS.map((g, i) => ({ ...g, count: counts[i] })), highlight: sel });
// hist.set({ draws: SIM.map(c => c[sel]), exact: { pmf: k => U.binom.pmf(k, 1000, q) } });
```
The maths runs in Node for model tests: `globalThis.IE = { seeded }` (copy mulberry32 from core.js), then
`require('runtime/uncertainty.js')`.

## Validation ideas
- Source numbers at the real settings (counts per 1,000, the quoted risk).
- Identities at the current settings: Bayes' rule = counting natural frequencies; the groups add up to N in every
  simulated sample (conservation).
- Simulation vs exact, **within its tolerance**: a pooled proportion within 3·`U.seProp`, a mean within
  3·`U.seMean`, sample quantiles within max(1, 3·`U.seQuantile`) of the exact quantiles. Three standard errors fail
  by chance about 0.3% of the time; if a check fails, change the seed in Node before believing it.
- Known textbook values (the classic screening problems in Gigerenzer & Hoffrage 1995, with the source's numbers).

## Pitfalls
- Parameter ids share the page's id space with the runtime: `prev`, `next`, `sel`, `play`, `reset` are taken (a param
  called `prev` broke the tour). Use descriptive ids (`prevalence`).
- `IE.app` options (view switches) do **not** call `recompute`; anything an option changes must be drawn in `render`.
- Per-person simulation of 2,000 × 1,000 people takes ~25 ms; for many scenarios (forest rows) draw counts with
  `rng.binomial` (multinomial: draw the first group, then the next among the rest) instead.
- Hundreds of `<use>` icons count as empty space for check.js's lint; the module draws one `<path>` per group.
- Low base rates make tiny groups (1 of 1,000): say the count in words and keep the colour strong; dimmed groups
  stay at 30% opacity so the crowd is still visible.
- A histogram whose bars span 2+ counts cannot show exact dots; keep `maxBars` above the spread or say "line".
