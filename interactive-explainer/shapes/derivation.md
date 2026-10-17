# Derivation shape (`IE.derivation`, `IE.mml`)

Start: `node scripts/build.js new derivation page.html`. Demo: section 11 of the Bitcoin paper in 10 lines, from the
gambler's-ruin recursion to (q/p)^z and on to the Poisson-mixture formula, checked line by line, with the Poisson
step compared against the exact (negative binomial) race.

## When to pick it
The source says "Proposition 3 follows from…", "it can be shown that…", "rearranging gives…", "to first order…",
"approximating X by Y…", or the reader asks *why the formula is what it is*. The idea is a chain of equalities, not a
mechanism over time. If the source only states a formula and its consequences, use the sweep shape instead and put
the formula beside the curve.

## Model
- Pure functions for every quantity a line mentions, plus at least one **independent route** to the key result
  (solve the recursion numerically, brute-force the sum, simulate). A check that only re-evaluates the same closed
  form on both sides proves nothing.
- Where the source approximates, implement the exact version too (here `attackerExact`, `nbPmf`), so the page can
  show the error. Quote the sentence where the source makes the approximation.
- Parameters are the symbols the reader can vary (q, z). Keep them few: two sliders is typical.

## Main view and selection
- One `<li>` per line: number, MathML, the check badge, the rule ("divide both sides by r^(z−1)") and, on the current
  line only, the plain-words gloss. Optional `part` headings group the lines (A · why (q/p)^z, B · the mixture).
- **Selection = line index**, a numeric `sel` (`min 0, max n−1, step 1, unit 1`), so ← → step lines, the slider gets
  `data-time`, and play walks the derivation. Clicking a line calls `onPick(i)` → `app.setSel(i)`.
- **Terms**: wrap a quantity in `term('name', …)`; the module colours it on every line (from `terms`) and marks it
  (yellow) on the current line when it differs from the same term on the previous line, or is new.
- **Linked plot** (secondary view): `line.plot(P)` returns the curve of *the quantity this line is about*: both sides
  as functions of r where a line equates them, the polynomial whose roots the line finds, the distribution a line
  approximates, the final result against z. `plot.onPick` lets a click on the plot set a parameter.
- Numeric check: `line.check(P)` → `[lhs, rhs]` or `{ lhs, rhs, scale, note }`. Exact lines pass at a relative
  difference ≤ `tol` (1e-9); `approx: true` lines show "≈ 2.8%" and count as close within `line.tol ?? approxTol`.
  For a rewrite step, lhs = the previous line's value, rhs = this line's. For a step that holds for any value
  (dividing, factoring), evaluate both sides at a stated test value and say so in `note`.

## What-ifs
- Parameter sliders feed the checks and the plot; presets for the cases the source tabulates (`whatIf` q = 10 / 30 / 45 %).
- "Show where the approximation breaks" (`breaks` option): grey bands where |approx − exact| > `breakTol`·|exact|,
  with the x-range written under the plot. Approximation-line badges turn ⚠ when the error passes their tolerance.

## Tour order
1. The concrete case and the first line (the only physics). 2. The algebra in one step (lines that just rearrange).
3. The key result, with the numerical solution sitting on the closed form. 4. The approximation, quoted. 5. The final
formula reproducing the source's table (dots on the plot). 6. Step up: the whole range, where the approximation breaks.

## Module API
```js
const { math, inline, v, n, o, text, sp, term, sub, sup, subsup, frac, paren, sqrt, sum, cases } = IE.mml;
// strings: numbers -> <mn>, one letter -> italic <mi> (mathvariant="normal" + CSS italic), one symbol -> <mo>,
// longer names (Pr, exp) -> upright <mi>; arrays concatenate; anything starting with '<' is kept as MathML
math(term('qz', sub('q', 'z')), '=', 'q', '·', sub('q', ['z', '−', '1']), '+', 'p', '·', sub('q', ['z', '+', '1']))
cases([[expr, [text('if'), sp(0.3), 'k', '≤', 'z']], ['1', [text('if'), sp(0.3), 'k', '>', 'z']]])
const der = IE.derivation('deriv', {
  lines: [{ part, math, rule, gloss, approx, tol, check: P => ({ lhs, rhs, note }), plot: P => plotSpec }],
  terms: { qz: { color: 's1', label: 'catch-up chance q<sub>z</sub>' } },
  plotHost: 'plot', plotHeight: 300, onPick: i => { app.pause(); app.setSel(i); },
  tol: 1e-9, approxTol: 0.1, breakTol: 0.1, paramText: P => `q = ${P.q}, z = ${P.z}` });
der.set({ sel, P, breaks })     // in render(): highlight the line, repaint badges and the plot when anything changed
der.checkHtml(i, P)            // "Check at …: left side …, right side …, relative difference … ✓" for #check / readout
der.results(P)                 // [{ lhs, rhs, diff, rel, lim, approx, ok, note }] per line
der.summary(P)                 // { pass, total, exactPass, exactTotal } for the validation table
IE.derivation.sci(v, sig)      // 9.14×10⁻⁴ style numbers; .logY(values, {floor}) / .linY(values) axis helpers
```
`plotSpec = { title (html), summary, x: {min, max, ticks, fmt, label}, xName, y: {log} | {min, max, fmt},
exact: {label, points}, approx?: {label, points} (same x grid as exact), series?: extra lineChart series drawn on
top, marks?, cursor?, hlines?, note?, onPick?: x => … }`. Without `y.min` the module picks a log or linear axis.
Pass only the model parameters as `P` to `der.set` (not view options), so badges are not recomputed for nothing.

## Validation ideas
- Every number in the source's tables (here 22 rows plus the "z for P < 0.1%" list, all to 7 decimals).
- The closed form against the independent route over the whole parameter range (max relative difference).
- "Every line's check passes at the source's values": `der.summary(REAL).pass === lines.length`.
- For the approximation: a seeded simulation of the exact process agrees with the exact formula within 3 s.e., and
  the approximate value is outside it (say by how many s.e.).

## Pitfalls
- A literal `<style data-ie="…"></style>` or `<script data-ie="…">` *inside a runtime file's comment* is read by
  build.js and check.js as a block: the page then fails with "UNBUILT". Describe blocks in words in comments.
- `mtext` drops trailing spaces ("if k"): put `sp(0.3)` after the word.
- MathML lines are wide: `.dm` scrolls sideways, and below 600 px the check badge moves under the formula.
- `lineChart.set` merges patches, so a plot that drops `hlines`/`bands` must pass empty arrays; the module does.
- Exact-zero residuals print as "✓ 0"; tiny ones as "✓ 2×10⁻¹⁶". A residual that is *relative* to a value near 0
  is meaningless: give `scale` (the size of the terms) in the check.
- Decide in words what "exact" means on each plot (here the negative-binomial race, not the paper's formula), and
  label the curves with it; readers assume the source is the exact one.
