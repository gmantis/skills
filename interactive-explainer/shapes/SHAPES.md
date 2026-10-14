# Explanation shapes

A page explains best when its main view has the same shape as the idea. The original skeleton has one shape:
*a quantity that changes over a cycle* (time slider, charts over the cycle). Many sources are not shaped like that.
Pick the shape in workflow step 1b, then use the matching section here.

Every shape keeps the skill's core: a **pure model**, a **guided tour** (`STEPS` + `goStep`), **what-if toggles**
(`[data-w]`), **live numbers** (`data-dyn`), **one shared selection state** that every view reads and writes, and
`check.js`. Only the main view and what the "selection" means change.

## Choosing

| The source mostly says… | Shape | Main view | Selection state | What-if means | Start from |
|---|---|---|---|---|---|
| "X rises and falls over the day/year/cycle", "A + B adds up to the curve" | **Over time** | chart over the cycle + 2D/3D scene | time `T` | switch a cause's term off | `assets/skeleton.html` |
| "A raises B, which lowers C…", feedback, vicious/virtuous circles, "what drives X" | **Causal network** | boxes and signed arrows, loops marked R/B | selected box/arrow; replay round `K` | switch a box off / cut an arrow | `assets/skeleton-graph.html` |
| "X is made of parts; each part does…", anatomy, architecture, org chart | **Structure** | labelled diagram or box map; click a part | selected part | remove a part, see what breaks | `skeleton-graph.html` (no weights) or the 2D diagram rules in SKILL.md 3b |
| "First…, then…, if … else …", protocols, algorithms, life cycles, state transitions | **State machine / stepper** | lanes or states + transitions, or the algorithm's data | trace position `K` | change the input or a rule, rerun | `assets/skeleton-stepper.html` (or `skeleton-graph.html` with states as nodes) |
| "Who sends what to whom, in which order" | **Sequence** | lanes (one per actor) with messages down the page | trace position `K` | drop or delay a message | `assets/skeleton-stepper.html` |
| "Explain this function / transform / script" | **Code walkthrough** | lanes + the source with the running lines highlighted | trace position `K` | change the environment (time zone, file present, input), or switch to a fixed version | `assets/skeleton-stepper.html` with `SOURCE` |
| "A vs B vs C", trade-offs, options | **Comparison** | aligned table / side-by-side small views | highlighted option or criterion | change the weights, see the ranking move | `assets/skeleton-compare.html` |
| "It depends on k", thresholds, tipping points, dose–response | **Parameter sweep** | a curve over the parameter with the current value marked, plus small multiples | parameter value | switch a cause off across the whole sweep | `assets/skeleton-sweep.html` |
| "Kinds of…", taxonomies, nested categories, "where does X go" | **Hierarchy** | collapsible tree + zoomable treemap | selected node and its path | hide a branch, re-total; switch measure | `assets/skeleton-tree.html` |
| "What happens to a record in this graph / ETL job / middleware" | **Record flow** | pipeline of components with live counts, one record's fields before/after each hop | (record, component) | change a rule, the order, or the data; diff against a fixed graph | `assets/skeleton-recordflow.html` |

**Combine at most two.** A common strong pair: a causal network as the main view, plus a parameter sweep or an
over-time chart as the linked secondary view (the graph skeleton's "how the change spreads" chart is exactly that).
If you need three main views, the page is two pages.

**Ladder of abstraction** (Bret Victor): for any shape, offer one step *down* (a single concrete case: one patient,
one day, one input) and one step *up* (the same system across a range: a sweep, small multiples, a distribution).
The concrete case goes first in the tour; the step up goes near the end.

## Causal network

Use `assets/skeleton-graph.html`.
- **Model**: linear signed influence `x = ext + W·x` by default. It gives an exact per-input split of every box
  (the skeleton's `decompose`), loop gains (`loopInfo`) and a "rounds of influence" replay. Each arrow's weight
  is a parameter key, so steps and sliders can change it.
- If the source has saturation or thresholds, replace the update with a non-linear one (`y = f(ext + W·x)`), drop the
  exact split, and show "only this cause on" shares instead, labelled as not adding up exactly.
- **Loops**: label each loop `R1`/`B1` (reinforcing / balancing) next to its feedback arrow. Gain ≥ 1 (or ≤ −1)
  does not settle; the skeleton then says so in words and shows "runs away" instead of numbers.
- **Weights from a non-numeric source**: pick small round numbers (0.3, 0.6, 0.9), say "illustrative weights" on
  the page, and validate the *qualitative* claims (signs, which route dominates, the loop damps) in a validation table.
- Keep it to **12 boxes or fewer**; past that, group boxes into a parent box and let the reader expand it.
- Tour order: the whole map → each driver alone (others off, `focus` on its path) → each loop (show "without the
  loop" as a live counterfactual) → everything together with the shares adding up.
- Prior art: Nicky Case's LOOPY (https://ncase.me/loopy/, CC0) for the feel of poking a loop and watching it spread.

## Structure

- Main view: a labelled 2D diagram (follow SKILL.md 3b: figure in its own coordinates, labels in screen space,
  de-overlapped label columns) or the graph skeleton without weights (set every `w` to 1, hide badges).
- Clicking a part opens its card: what it does, what it connects to, what fails without it. Every clickable part
  gets `data-pick` so `check.js` clicks it.
- What-if = remove a part; the model says what stops working (a dependency check over the edges), shown greyed.
- Tour: zoom from the whole to one part at a time, then follow one thing (a signal, a request, a nutrient) through.

## State machine / stepper / algorithm

- Model: a pure transition function `next(state, event, rules) → state`, and a precomputed list of states for the
  current input (`TRACE`). The selection state is the step index `K`; the play button advances `K`.
- Main view: the states as boxes (graph skeleton: nodes = states, edges = transitions labelled with the event)
  with the current state highlighted and the last transition animated, **or** the algorithm's own data
  (array bars, a grid, a queue), drawn fresh for `TRACE[K]`.
- Show the **invariant** in words beside the view ("everything left of the bar is sorted") and check it on every step
  in the validation table.
- What-if: change the input (preset inputs from the source) or break a rule (skip a step, change a guard) and show
  where the trace diverges from the correct one, side by side.

## Stepper skeleton contract (`assets/skeleton-stepper.html`)

- `simulate(params) → TRACE`: pure. One entry per message (`kind:'msg'`, `from`, `to`, `payload`, `tArr`, `lost`) or
  internal action (`kind:'note'`, `actor`), each with `short` (diagram label, at most about 18 characters), `text` (one
  sentence), `state` (a snapshot of every actor), and optionally `line: [from, to]` for the source panel.
- `tArr` null or equal to `t` = an instant message, drawn flat. Use it when several actions happen at the same clock
  time (function calls inside one request). A real latency draws a sloped arrow down to the arrival time.
- `INVARIANTS`: `check(state, isEnd)` returns true, false, or null (cannot tell yet). The first breaking step is
  marked pink in the lanes and in the rules list.
- `referenceRun(p)` and `REF_LABEL`: the run to diff against. For protocols, normal rules on the same input. For
  code, the **fixed version under the same conditions** is far more telling than a fixed baseline.
- `fmtT` / `fmtTick`: how a time is shown in "At this step" and in the lanes' gutter (ms, clock time, round).
- Two positions: `STEP` (tour) and `K` (trace). Tour steps set `k` as a number, `'end'`, or a function of `TRACE`
  (for example `() => AN.firstBreak.found`), so a step can land exactly on the interesting entry.

## Code walkthrough

- Re-implement the code's logic in `simulate`, one trace entry per branch decision, call, load or write, and
  tag each entry with the source lines it executes. Keep globals and other cross-call state in the actor `state`.
- Drive it with a **realistic run** of inputs that crosses the edges the code handles (midnight, a missing
  file, a retry), not one input. Behaviour that only shows across calls is the usual reason to build the page.
- **Verify the semantics of every built-in the logic depends on** before modelling it: the product docs first,
  then a one-line `m_eval` (or the language's REPL) under the conditions that matter (time zone, locale, NULL).
  Write what you verified into the page's text.
- Embed the source verbatim, HTML-escaped, in a `<pre hidden id="…Source">` and read its `textContent`. Never use
  `<script type="text/plain">`, because `check.js` syntax-checks every inline script.
- Say on the page that it is a model built from reading the code, and label any suggested fix as a sketch.

## Sequence

- Lanes: one vertical lane per actor, messages as arrows down the page in order, current message highlighted.
  Draw it as SVG with the lane headers sticky; on a phone keep at most 4 lanes and abbreviate names.
- The selection state is the message index; each step's text says who knows what at that moment.
- What-if: drop, delay or duplicate a message and show the consequence (timeout, retry, double charge).

## Comparison

Use `assets/skeleton-compare.html`.
- An aligned HTML table (options as columns, criteria as rows) in a scroll wrapper, with number cells `nowrap`.
  Highlight the winner per row. Add a weight slider per criterion and a live total row; the ranking reorders.
- Small side-by-side views of the same chart (same axes, same scale) beat one chart with many lines when there are
  more than 3 options.
- What-if: "if you care only about X" presets set the weights.
- Sensitivity, computed exactly from the linear weighted sum: for each criterion, how far its weight alone must move
  to change the winner, or "no change flips it". Say it in words.
- Mark illustrative scores as illustrative, and keep each cell's source note for the detail card.

## Parameter sweep

Use `assets/skeleton-sweep.html` (demo: queue wait vs utilisation, M/M/1, M/D/1, M/M/2, validated against exact
formulas and a seeded simulation).
- x = the parameter, y = the outcome; mark the current value with a cursor and let clicks set it (same pattern as
  `chartFrame` + `_geo`). Ghost curves = the same sweep with one cause off.
- Small multiples: the over-time chart repeated for 4–6 parameter values on shared axes, current value outlined.
- Name thresholds and tipping points in the chart, and say where the reader's own value falls ("your numbers").
- Past a limit where the outcome is unbounded (a queue above 100% load), shade the region and say so in words; never
  plot or quote a number there.
- Small-multiple canvases need grid columns of at least about 300 px (`setupCanvas` draws at least 280 px wide):
  `grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr))`.
- Canvas labels can't be linted by `check.js`. Place them with the sweep skeleton's `placeLabel` (tries candidate
  positions, avoids placed labels, curves and cursor lines), and still read the screenshots.

## Hierarchy

Use `assets/skeleton-tree.html` (squarified treemap, two levels at a time, zoom to the selected node, breadcrumb up,
hide-branch and measure what-ifs, a top-N leaves list as the step up).
- Small trees: nested `<details>` with counts or totals in each summary line; selecting a node highlights its path.
- Proportions: nested boxes (treemap) or an icicle, in SVG, with the label inside only when it fits (else in the
  side card). Hiding a branch re-totals the parents.
- Two measures (bytes vs files, cost vs headcount) often tell different stories; offer both as a switch.
- Branches far below 1% become slivers; that is honest. The tree and the card still show them.

## Record flow

Use `assets/skeleton-recordflow.html`.
- Model: `simulate(p)` runs every sample record through one pure function per component and records, per hop, the
  record before and after, the port it left on, every rule that ran with its result (ok / NULL / fail / not run),
  and the error message if rejected. Selection is (record `R`, component `H`).
- Pick sample records that each show one edge case (whitespace, NULL, an unknown code, a negative value), plus
  one clean record to follow first.
- Check "in = out + rejects + deselected" at every component; a disconnected reject port is the classic way to break it.
- For Ab Initio semantics (rule priorities, NULL into a non-nullable field, reject behaviour), use only what the DAIS
  notes or product docs say, and label the rest illustrative on the page.
- The layout is hand-placed for the demo topology (one lookup, one deselect port, one shared reject file). For a
  different graph, edit the positions in `buildFlow`; joins of two inputs are not handled yet.

## Libraries and the offline rule

Pages must work offline: no CDNs. Prefer the built-in helpers (canvas `chartFrame`, the graph skeleton's SVG layer).
- **Formulas**: use MathML (`<math>`), which current Chrome, Edge, Firefox and Safari render natively, so it needs
  no library. Keep formulas short; put the plain-words version next to each one. Single-letter `<mi>` renders as an
  empty box in some headless Chromium builds; use `mathvariant="normal"` plus CSS `font-style: italic`.
- **Large graphs (more than about 25 nodes)** or graphs that need force or compound layout: inline a vendored,
  minified copy of a permissively licensed library (Cytoscape.js, MIT; d3-force, ISC) into the page's `<script>`,
  with its licence header kept. Don't fetch it at view time. If no vendored copy is available offline, group nodes
  until the hand layout works.
- **Mermaid** is fine for a static side figure in notes or markdown, but not for the main interactive view: it
  re-renders the whole diagram, so selection and live numbers get lost.
- Never add a library just for one effect the helpers can do in 20 lines.
