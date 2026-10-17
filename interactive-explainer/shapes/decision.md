# Decision ("should I…?" under the reader's own numbers)

Pick it when the source or the reader asks **"should I…?"**, "is it worth it", "buy or rent", "which plan", "when
does X pay off", "at what point does B win": a choice among a few options whose cost or value depends on numbers
the reader knows better than the author (usage, prices, how long, their risk). Not when options are scored on many
qualitative criteria with weights (compare), or when there is no choice, only a dependence (sweep).

Skeleton: `node scripts/build.js new decision page.html` (`assets/skeleton-decision.html`, demo: which air purifier
over the years you keep it). Modules: `core` + `decision`.

## Model
- model.js: `REAL` (the example reader's answers), `OPTIONS` `[{ id, label, short, noun, color, cost: P => { part:
  value } }]` (parts are drawn stacked; a plain number works too), `INPUTS` `[{ id, label, lo, hi, fmt, phrase }]`
  (plausible ranges for the tornado and the flip condition; `phrase(dir, x)` → "you run it less than 5.2 h a night").
- Costs over a stated **horizon** (years kept, months of the plan) and **expected values** where chance enters: a
  repair that happens with probability q costs q × price in expectation; show the branches in the tree.
- Write closed forms for the break-even of the main inputs by hand (`breakEvenExact`), independent of `cost`; they
  are what the validation compares the chart against. Linear costs make this easy; otherwise solve and say how.
- For values instead of costs (savings, utility), pass `sense: 'max'` everywhere.

## Views (one shared selection: the option you follow)
- **Questions** (`D.questions`): a short form, each answer a parameter with units, a number box for the exact value
  plus a slider; secondary inputs (quoted prices) folded under `group: 'more'`. Steps, what-ifs and URL update it.
- **Cost per option** (`D.stackedBars`): expected total split into parts, ranked, "cheapest" / "+$30" notes.
- **Decision tree** (`D.tree`): square = choice, circle = chance, triangle = outcome; the selected option's path is
  highlighted and the best option outlined. A rule flowchart ("run it > 5.2 h?" → yes/no) uses the same view with
  `kind: 'question'` nodes, built from the break-evens.
- **Break-even chart** (`D.breakEvenChart`, wraps `IE.lineChart`): each option's total over one input, the reader's
  value as a cursor, crossings as labelled dots, the selected option's winning stretch shaded; click sets the value.
  Default input: the tornado's top bar (`sweep: 'auto'`); clicking a tornado bar or a step's `params: { sweep }` pins it.
- **Tornado** (`D.tornado`): the gap "selected minus its best rival" as each input runs over its range; bars that
  cross the dashed tie line can flip the choice alone (their labels are bold).
- **Recommendation**: one line in `.answer` (`D.recommend(...).text`): "The efficient unit costs least over 3 years:
  $366, $30 less than the budget unit. If you keep it less than 2.4 years, the budget unit wins."
- Selection: `sel: { stepBy }` cycling OPTIONS; bars, tree nodes and the picker in `#controls` set it.

## What-ifs and tour
- What-ifs are the reader's scenarios: "price ×2", "use it half as much", "power price ×2", "move in a year". Give
  each `set` all the keys the segment touches, so exactly one button is pressed.
- Tour: the reader's situation and the answer → where the money goes → chance (expected value in the tree) → the
  break-even of the input they control → what matters most (tornado) → a case where another option wins → **step up**:
  the break-even over the whole range of the horizon.

## API (`const D = IE.decision`; maths runs in Node: `require('runtime/decision.js')`)
```js
D.total(o, P)  D.parts(o, P)  D.rank(options, P, sense)  D.best(options, P, sense) -> { best, runnerUp, margin, ranking }
D.at(P, key, v)                       // P with one input changed
D.sweep(options, P, key, lo, hi, n)   // [{ id, o, points: [[x, total]] }]
D.crossings(options, P, key, lo, hi, { sense, n: 400 }) -> [{ x, from, to, y }]   // where the best changes (bisected)
D.breakEven(oa, ob, P, key) -> x | null                                            // secant solve of the pair
D.sensitivity(f, P, inputs) -> rows sorted by swing: { ...input, fLo, fHi, swing, deriv, zero }
D.flip(options, P, inputs, sense) -> { id, input, at, dir, winner, rel, phrase } | null
D.recommend(options, P, inputs, { sense, fmt, horizon }) -> { best, runnerUp, margin, flip, text }
D.questions(host, app, [{ id, q, unit, min, max, step, hint, group }], { more }) -> { sync() }
D.picker(host, options, onPick, { label }) -> { set(id) }
D.tree(host, { title, root: { id, kind, label, value, pick, color, children }, highlight: [ids], best, onPick })
D.stackedBars(host, { title, rows: [{ id, label, parts, note }], parts: [{ key, label, color }], fmt, highlight, onPick })
D.breakEvenChart(host, { options, P, key, lo, hi, sense, highlight, fmtX, fmtY, xLabel, height, title, youLabel, onPick })
  -> { set(patch), crossings, chart }
D.tornado(host, { title, rows, base, fmt, x: { label }, zero, zeroLabel, baseLabel, loColor, hiColor, loText, hiText,
  highlight, onPick })
```
Example (render): the rival is the cheapest other option, and the tornado measures the gap to it.
```js
const s = OPT(sel), rival = D.best(OPTIONS.filter(o => o.id !== s.id), P).best.o, gap = q => D.total(s, q) - D.total(rival, q);
const TOR = D.sensitivity(gap, P, INPUTS).filter(r => r.swing > 1e-9);
tornado.set({ rows: TOR, base: gap(P), highlight: KEY });
```

## Validation ideas
- Source numbers at the example values (energy used, a quoted total).
- Break-even: the closed form equals the crossing found on the chart (for the pair alone: pass just the two options,
  because a third option can hide the pair's crossing under the envelope); the options tie at every marked crossing.
- Tornado order = order of |∂gap/∂input| × range, and each bar = |∂gap/∂input| × range when costs are linear in each
  input (one-at-a-time swings are exact then; with kinks, say "approximate").
- The tree: expected value = Σ probability × outcome for each option; the parts add up to the total.
- The recommendation's flip: just before the stated point the current best wins, just after the stated winner does.

## Pitfalls
- `.dyn` is bold and nowrap: put sentence-long values (the recommendation) in a plain `<span data-dyn>` or `DW()`.
- Tornado labels in bold (flipping rows) are wider: the module measures them bold; keep labels under ~25 characters.
- `D.crossings` reports only where the *best* changes; a pair's break-even can sit under a third option.
- A $30 gap makes almost every input "able to flip" the choice; say how close the call is in words.
- `fmt.money` follows the reader's locale ("US$" outside the US); a demo can format its own currency.
- Long axis labels: the tornado wraps its label to two lines; keep chart titles short on phones.
